import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MOCK_DIR = "static/mock";

// In-memory version counter (per page). In production this comes from Lance.
const versions = new Map<string, number>();

function getVersion(pageId: string): number {
  if (!versions.has(pageId)) versions.set(pageId, 1);
  return versions.get(pageId)!;
}

function bumpVersion(pageId: string): number {
  const v = getVersion(pageId) + 1;
  versions.set(pageId, v);
  return v;
}

function versionETag(pageId: string): string {
  return `"v${getVersion(pageId)}-${pageId}"`;
}

// GET: return Arrow IPC with version ETag
export const GET: RequestHandler = async ({ params, url }) => {
  const path = `${MOCK_DIR}/${params.pageId}.arrow`;
  const chunkSize = Number(url.searchParams.get("chunk") ?? 0);

  let ipc: Uint8Array;
  try {
    ipc = await Deno.readFile(path);
  } catch {
    error(404, `No annotations for page: ${params.pageId}`);
  }

  const etag = versionETag(params.pageId);

  if (chunkSize > 0) {
    const stream = new ReadableStream({
      start(controller) {
        let offset = 0;
        const push = () => {
          if (offset >= ipc.length) {
            controller.close();
            return;
          }
          const end = Math.min(offset + chunkSize, ipc.length);
          controller.enqueue(ipc.slice(offset, end));
          offset = end;
          setTimeout(push, 10);
        };
        push();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/vnd.apache.arrow.stream",
        "Transfer-Encoding": "chunked",
        ETag: etag,
      },
    });
  }

  return new Response(ipc as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
      ETag: etag,
    },
  });
};

// POST: full table overwrite (fallback)
export const POST: RequestHandler = async ({ request, params }) => {
  const body = new Uint8Array(await request.arrayBuffer());
  const path = `${MOCK_DIR}/${params.pageId}.arrow`;

  // Persist the full table
  await Deno.writeFile(path, body);
  const newVersion = bumpVersion(params.pageId);

  // Return the saved data back
  const saved = await Deno.readFile(path);
  return new Response(saved as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
      ETag: `"v${newVersion}-${params.pageId}"`,
    },
  });
};

// PATCH: delta update with OCC
export const PATCH: RequestHandler = async ({ request, params }) => {
  const path = `${MOCK_DIR}/${params.pageId}.arrow`;

  // OCC: check If-Match version
  const ifMatch = request.headers.get("If-Match");
  const currentETag = versionETag(params.pageId);
  if (ifMatch && ifMatch !== currentETag) {
    // Conflict: client's data is stale
    const currentData = await Deno.readFile(path);
    return new Response(currentData as unknown as BodyInit, {
      status: 409,
      headers: {
        "Content-Type": "application/vnd.apache.arrow.stream",
        ETag: currentETag,
      },
    });
  }

  // Read existing data
  let existingBytes: Uint8Array;
  try {
    existingBytes = await Deno.readFile(path);
  } catch {
    error(404, `No annotations for page: ${params.pageId}`);
  }

  // Parse delta from request body
  const deltaBytes = new Uint8Array(await request.arrayBuffer());
  const deletedIdsHeader = request.headers.get("X-Deleted-Ids");
  const deletedIds = deletedIdsHeader
    ? new Set(deletedIdsHeader.split(","))
    : new Set<string>();

  // Dynamic import for Arrow (server-side table manipulation)
  const { tableFromIPC, tableFromArrays, tableToIPC, Schema, Table } =
    await import("apache-arrow");

  const existing = tableFromIPC(existingBytes);

  // Apply deletes: filter out deleted IDs
  let working = existing;
  if (deletedIds.size > 0) {
    const idCol = existing.getChild("id");
    if (idCol) {
      const keepIndices: number[] = [];
      for (let i = 0; i < existing.numRows; i++) {
        if (!deletedIds.has(String(idCol.get(i)))) {
          keepIndices.push(i);
        }
      }
      // Rebuild without deleted rows
      const cols: Record<string, unknown[]> = {};
      for (const field of existing.schema.fields) {
        const col = existing.getChild(field.name)!;
        const isListCol = field.name === "polygon";
        const arr: unknown[] = new Array(keepIndices.length);
        for (let j = 0; j < keepIndices.length; j++) {
          const i = keepIndices[j];
          if (isListCol) {
            const val = col.get(i);
            if (val && val.length > 0) {
              const plain = new Array(val.length);
              for (let k = 0; k < val.length; k++) plain[k] = val.get(k);
              arr[j] = plain;
            } else {
              arr[j] = null;
            }
          } else {
            arr[j] = col.get(i);
          }
        }
        cols[field.name] = arr;
      }
      const filtered = tableFromArrays(cols);
      const schemaWithMeta = new Schema(
        filtered.schema.fields,
        existing.schema.metadata,
      );
      working = new Table(schemaWithMeta, filtered.batches);
    }
  }

  // Apply upserts from delta
  if (deltaBytes.length > 0) {
    const delta = tableFromIPC(deltaBytes);
    if (delta.numRows > 0) {
      const deltaIdCol = delta.getChild("id");
      if (deltaIdCol) {
        // Build a set of IDs in the delta for O(1) lookup
        const deltaIds = new Set<string>();
        for (let i = 0; i < delta.numRows; i++) {
          deltaIds.add(String(deltaIdCol.get(i)));
        }

        // Filter existing rows that are NOT in the delta (keep untouched rows)
        const workingIdCol = working.getChild("id");
        const keepIndices: number[] = [];
        for (let i = 0; i < working.numRows; i++) {
          if (!deltaIds.has(String(workingIdCol?.get(i)))) {
            keepIndices.push(i);
          }
        }

        // Rebuild: kept rows + delta rows
        const cols: Record<string, unknown[]> = {};
        for (const field of working.schema.fields) {
          const existCol = working.getChild(field.name)!;
          const deltaCol = delta.getChild(field.name);
          const isListCol = field.name === "polygon";
          const arr: unknown[] = new Array(
            keepIndices.length + delta.numRows,
          );

          // Copy kept rows
          for (let j = 0; j < keepIndices.length; j++) {
            const i = keepIndices[j];
            if (isListCol) {
              const val = existCol.get(i);
              if (val && val.length > 0) {
                const plain = new Array(val.length);
                for (let k = 0; k < val.length; k++) plain[k] = val.get(k);
                arr[j] = plain;
              } else {
                arr[j] = null;
              }
            } else {
              arr[j] = existCol.get(i);
            }
          }

          // Append delta rows
          for (let d = 0; d < delta.numRows; d++) {
            const j = keepIndices.length + d;
            if (isListCol && deltaCol) {
              const val = deltaCol.get(d);
              if (val && val.length > 0) {
                const plain = new Array(val.length);
                for (let k = 0; k < val.length; k++) plain[k] = val.get(k);
                arr[j] = plain;
              } else {
                arr[j] = null;
              }
            } else {
              arr[j] = deltaCol?.get(d) ?? null;
            }
          }

          cols[field.name] = arr;
        }

        const merged = tableFromArrays(cols);
        const schemaWithMeta = new Schema(
          merged.schema.fields,
          existing.schema.metadata,
        );
        working = new Table(schemaWithMeta, merged.batches);
      }
    }
  }

  // Write merged result
  const resultIpc = tableToIPC(working, "stream");
  await Deno.writeFile(path, resultIpc);
  const newVersion = bumpVersion(params.pageId);

  return new Response(resultIpc as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
      ETag: `"v${newVersion}-${params.pageId}"`,
    },
  });
};

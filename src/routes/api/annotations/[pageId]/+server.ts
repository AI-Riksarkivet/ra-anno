import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MOCK_DIR = "static/mock";

// GET: stream Arrow IPC in chunks (simulates Flight SQL RecordBatch streaming)
export const GET: RequestHandler = async ({ params, url }) => {
  const path = `${MOCK_DIR}/${params.pageId}.arrow`;
  const chunkSize = Number(url.searchParams.get("chunk") ?? 0);

  let ipc: Uint8Array;
  try {
    ipc = await Deno.readFile(path);
  } catch {
    error(404, `No annotations for page: ${params.pageId}`);
  }

  // If chunk param is set, stream the IPC in chunks to simulate
  // Flight SQL streaming RecordBatches over the wire
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
          // Small delay to simulate network latency between chunks
          setTimeout(push, 10);
        };
        push();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/vnd.apache.arrow.stream",
        "Transfer-Encoding": "chunked",
        ETag: `"mock-${params.pageId}"`,
      },
    });
  }

  // Default: return full IPC at once (for small responses / cached data)
  return new Response(ipc, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
      ETag: `"mock-${params.pageId}"`,
    },
  });
};

// POST: accept Arrow IPC (mock: just acknowledge)
export const POST: RequestHandler = async ({ request, params }) => {
  await request.arrayBuffer();

  const path = `${MOCK_DIR}/${params.pageId}.arrow`;
  const ipc = await Deno.readFile(path);

  return new Response(ipc, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
    },
  });
};

import {
  Schema,
  type Table,
  Table as ArrowTable,
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
} from "apache-arrow";
import { undoStack } from "./undo.svelte.js";

/** Extract specific rows from a table into a new table */
function extractRows(table: Table, indices: number[]): Table {
  if (indices.length === 0) return tableFromArrays({});
  const cols: Record<string, unknown[]> = {};
  for (const field of table.schema.fields) {
    const col = table.getChild(field.name)!;
    const isListCol = field.name === "polygon";
    const arr: unknown[] = new Array(indices.length);
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
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
  return tableFromArrays(cols);
}

/** Rebuild a table, preserving schema metadata from the original */
function rebuildTable(
  existing: Table,
  cols: Record<string, unknown[]>,
): Table {
  const raw = tableFromArrays(cols);
  // Preserve schema metadata (page-level info) that tableFromArrays drops
  if (existing.schema.metadata.size > 0) {
    const schemaWithMeta = new Schema(
      raw.schema.fields,
      existing.schema.metadata,
    );
    return new ArrowTable(schemaWithMeta, raw.batches);
  }
  return raw;
}

class AnnotationStore {
  // $state.raw — Arrow Tables are large, only reassigned, never mutated
  private _tables = $state.raw<Record<string, Table>>({});
  private _dirty = $state<Record<string, boolean>>({});
  private _loading = $state<Record<string, boolean>>({});

  // Version tracking: ETag from server, used for OCC
  private _versions = $state<Record<string, string>>({});

  // Delta tracking: which row indices have been modified since last save
  private _dirtyRows = $state<Record<string, Set<number>>>({});
  // Rows that were appended (not in the original server data)
  private _appendedRows = $state<Record<string, Set<number>>>({});
  // Row IDs that were deleted
  private _deletedIds = $state<Record<string, Set<string>>>({});

  table(pageId: string): Table | null {
    return this._tables[pageId] ?? null;
  }

  isDirty(pageId: string): boolean {
    return this._dirty[pageId] ?? false;
  }

  isLoading(pageId: string): boolean {
    return this._loading[pageId] ?? false;
  }

  version(pageId: string): string | null {
    return this._versions[pageId] ?? null;
  }

  private trackDirtyRow(pageId: string, index: number): void {
    const set = this._dirtyRows[pageId] ?? new Set();
    set.add(index);
    this._dirtyRows = { ...this._dirtyRows, [pageId]: set };
  }

  private trackDirtyRows(pageId: string, indices: Iterable<number>): void {
    const set = this._dirtyRows[pageId] ?? new Set();
    for (const i of indices) set.add(i);
    this._dirtyRows = { ...this._dirtyRows, [pageId]: set };
  }

  private clearDelta(pageId: string): void {
    this._dirtyRows = { ...this._dirtyRows, [pageId]: new Set() };
    this._appendedRows = { ...this._appendedRows, [pageId]: new Set() };
    this._deletedIds = { ...this._deletedIds, [pageId]: new Set() };
  }

  /**
   * Load annotations with streaming support.
   * Reads the response as a stream, parsing Arrow IPC incrementally.
   * Each parsed batch triggers a reactive update → canvas renders progressively.
   */
  async load(pageId: string): Promise<Table> {
    const cached = this._tables[pageId];
    if (cached) return cached;

    this._loading = { ...this._loading, [pageId]: true };

    const res = await fetch(`/api/annotations/${pageId}`);
    if (!res.ok) {
      this._loading = { ...this._loading, [pageId]: false };
      throw new Error(`Failed to load annotations: ${res.status}`);
    }

    // Store server version from ETag
    const etag = res.headers.get("ETag") ?? "";
    this._versions = { ...this._versions, [pageId]: etag };

    // If no body stream, fall back to batch
    if (!res.body) {
      const buffer = await res.arrayBuffer();
      const table = tableFromIPC(new Uint8Array(buffer));
      this._tables = { ...this._tables, [pageId]: table };
      this._loading = { ...this._loading, [pageId]: false };
      this.clearDelta(pageId);
      return table;
    }

    // Stream: read chunks, accumulate bytes, try parsing after each chunk
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalLen = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      totalLen += value.length;

      try {
        const combined = concatBytes(chunks, totalLen);
        const table = tableFromIPC(combined);
        if (table.numRows > 0) {
          this._tables = { ...this._tables, [pageId]: table };
        }
      } catch {
        // Incomplete IPC stream — wait for more bytes
      }
    }

    // Final parse with all bytes
    const combined = concatBytes(chunks, totalLen);
    const table = tableFromIPC(combined);
    this._tables = { ...this._tables, [pageId]: table };
    this._loading = { ...this._loading, [pageId]: false };
    this.clearDelta(pageId);
    return table;
  }

  appendLocal(pageId: string, row: Record<string, unknown>): Table | null {
    const existing = this._tables[pageId];
    if (!existing) return null;

    undoStack.push(existing);

    const cols: Record<string, unknown[]> = {};
    for (const field of existing.schema.fields) {
      cols[field.name] = [row[field.name] ?? null];
    }
    const updated = existing.concat(tableFromArrays(cols));
    const newIndex = updated.numRows - 1;

    // Track as appended
    const appended = this._appendedRows[pageId] ?? new Set();
    appended.add(newIndex);
    this._appendedRows = { ...this._appendedRows, [pageId]: appended };

    this._tables = { ...this._tables, [pageId]: updated };
    this._dirty = { ...this._dirty, [pageId]: true };
    return updated;
  }

  updateLocal(
    pageId: string,
    rowIndex: number,
    updates: Record<string, unknown>,
  ): Table | null {
    const existing = this._tables[pageId];
    if (!existing || rowIndex < 0 || rowIndex >= existing.numRows) return null;

    undoStack.push(existing);

    const cols: Record<string, unknown[]> = {};
    for (const field of existing.schema.fields) {
      const col = existing.getChild(field.name)!;
      const n = existing.numRows;
      const isListCol = field.name === "polygon";

      const arr: unknown[] = new Array(n);
      for (let i = 0; i < n; i++) {
        if (i === rowIndex && field.name in updates) {
          arr[i] = updates[field.name];
        } else if (isListCol) {
          const val = col.get(i);
          if (val && val.length > 0) {
            const plain = new Array(val.length);
            for (let j = 0; j < val.length; j++) plain[j] = val.get(j);
            arr[i] = plain;
          } else {
            arr[i] = null;
          }
        } else {
          arr[i] = col.get(i);
        }
      }
      cols[field.name] = arr;
    }

    const updated = rebuildTable(existing, cols);
    this._tables = { ...this._tables, [pageId]: updated };
    this._dirty = { ...this._dirty, [pageId]: true };
    this.trackDirtyRow(pageId, rowIndex);
    return updated;
  }

  /** Apply multiple row updates in a single table rebuild + single undo entry */
  batchUpdateLocal(
    pageId: string,
    updatesMap: Map<number, Record<string, unknown>>,
  ): Table | null {
    const existing = this._tables[pageId];
    if (!existing || updatesMap.size === 0) return existing ?? null;

    undoStack.push(existing);

    const cols: Record<string, unknown[]> = {};
    for (const field of existing.schema.fields) {
      const col = existing.getChild(field.name)!;
      const n = existing.numRows;
      const isListCol = field.name === "polygon";

      const arr: unknown[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const rowUpdates = updatesMap.get(i);
        if (rowUpdates && field.name in rowUpdates) {
          arr[i] = rowUpdates[field.name];
        } else if (isListCol) {
          const val = col.get(i);
          if (val && val.length > 0) {
            const plain = new Array(val.length);
            for (let j = 0; j < val.length; j++) plain[j] = val.get(j);
            arr[i] = plain;
          } else {
            arr[i] = null;
          }
        } else {
          arr[i] = col.get(i);
        }
      }
      cols[field.name] = arr;
    }

    const updated = rebuildTable(existing, cols);
    this._tables = { ...this._tables, [pageId]: updated };
    this._dirty = { ...this._dirty, [pageId]: true };
    this.trackDirtyRows(pageId, updatesMap.keys());
    return updated;
  }

  deleteLocal(pageId: string, rowIndex: number): Table | null {
    const existing = this._tables[pageId];
    if (!existing || rowIndex < 0 || rowIndex >= existing.numRows) return null;

    undoStack.push(existing);

    // Track the deleted annotation's ID for the server
    const deletedId = String(
      existing.getChild("id")?.get(rowIndex) ?? "",
    );
    if (deletedId) {
      const deleted = this._deletedIds[pageId] ?? new Set();
      deleted.add(deletedId);
      this._deletedIds = { ...this._deletedIds, [pageId]: deleted };
    }

    const n = existing.numRows;
    const cols: Record<string, unknown[]> = {};
    for (const field of existing.schema.fields) {
      const col = existing.getChild(field.name)!;
      const isListCol = field.name === "polygon";
      const dst = new Array(n - 1);
      for (let i = 0, j = 0; i < n; i++) {
        if (i === rowIndex) continue;
        if (isListCol) {
          const val = col.get(i);
          if (val && val.length > 0) {
            const plain = new Array(val.length);
            for (let k = 0; k < val.length; k++) plain[k] = val.get(k);
            dst[j++] = plain;
          } else {
            dst[j++] = null;
          }
        } else {
          dst[j++] = col.get(i);
        }
      }
      cols[field.name] = dst;
    }

    // Shift dirty row indices above the deleted row down by 1
    const dirtyRows = this._dirtyRows[pageId];
    if (dirtyRows) {
      const shifted = new Set<number>();
      for (const idx of dirtyRows) {
        if (idx < rowIndex) shifted.add(idx);
        else if (idx > rowIndex) shifted.add(idx - 1);
      }
      this._dirtyRows = { ...this._dirtyRows, [pageId]: shifted };
    }
    const appended = this._appendedRows[pageId];
    if (appended) {
      const shifted = new Set<number>();
      for (const idx of appended) {
        if (idx < rowIndex) shifted.add(idx);
        else if (idx > rowIndex) shifted.add(idx - 1);
      }
      this._appendedRows = { ...this._appendedRows, [pageId]: shifted };
    }

    const updated = rebuildTable(existing, cols);
    this._tables = { ...this._tables, [pageId]: updated };
    this._dirty = { ...this._dirty, [pageId]: true };
    return updated;
  }

  undo(pageId: string): Table | null {
    const current = this._tables[pageId];
    if (!current) return null;

    const prev = undoStack.undo(current);
    if (!prev) return null;

    this._tables = { ...this._tables, [pageId]: prev };
    this._dirty = { ...this._dirty, [pageId]: true };
    return prev;
  }

  redo(pageId: string): Table | null {
    const current = this._tables[pageId];
    if (!current) return null;

    const next = undoStack.redo(current);
    if (!next) return null;

    this._tables = { ...this._tables, [pageId]: next };
    this._dirty = { ...this._dirty, [pageId]: true };
    return next;
  }

  async save(pageId: string): Promise<Table> {
    const table = this._tables[pageId];
    if (!table) throw new Error("No table to save");

    // Build delta: only rows that changed or were appended
    const dirtyRows = this._dirtyRows[pageId] ?? new Set();
    const appendedRows = this._appendedRows[pageId] ?? new Set();
    const deletedIds = this._deletedIds[pageId] ?? new Set();
    const allDirtyIndices = [...new Set([...dirtyRows, ...appendedRows])];

    // If we have a delta, send only changed rows. Otherwise send full table.
    const hasDeltas = allDirtyIndices.length > 0 || deletedIds.size > 0;
    const ipc = hasDeltas && allDirtyIndices.length > 0
      ? tableToIPC(extractRows(table, allDirtyIndices), "stream")
      : hasDeltas
      ? new Uint8Array(0) // only deletes, no row data
      : tableToIPC(table, "stream"); // fallback: full table

    const method = hasDeltas ? "PATCH" : "POST";
    const headers: Record<string, string> = {
      "Content-Type": "application/vnd.apache.arrow.stream",
    };

    // OCC: send the version we loaded from
    const loadedVersion = this._versions[pageId];
    if (loadedVersion) {
      headers["If-Match"] = loadedVersion;
    }

    // Include deleted IDs as a header (comma-separated)
    if (deletedIds.size > 0) {
      headers["X-Deleted-Ids"] = [...deletedIds].join(",");
    }

    const res = await fetch(`/api/annotations/${pageId}`, {
      method,
      headers,
      body: ipc as unknown as BodyInit,
    });

    if (res.status === 409) {
      throw new Error(
        "Conflict: data was modified by another user. Please reload.",
      );
    }
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);

    // Update version from response
    const newVersion = res.headers.get("ETag") ?? "";
    this._versions = { ...this._versions, [pageId]: newVersion };

    const fresh = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
    this._tables = { ...this._tables, [pageId]: fresh };
    this._dirty = { ...this._dirty, [pageId]: false };
    this.clearDelta(pageId);
    undoStack.clear();
    return fresh;
  }
}

/** Concatenate Uint8Array chunks into a single buffer */
function concatBytes(chunks: Uint8Array[], totalLen: number): Uint8Array {
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export const annotationStore = new AnnotationStore();

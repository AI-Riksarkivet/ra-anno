import {
  type Table,
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
} from "apache-arrow";
import { undoStack } from "./undo.svelte.js";

class AnnotationStore {
  // $state.raw — Arrow Tables are large, only reassigned, never mutated
  private _tables = $state.raw<Record<string, Table>>({});
  private _dirty = $state<Record<string, boolean>>({});
  private _loading = $state<Record<string, boolean>>({});

  table(pageId: string): Table | null {
    return this._tables[pageId] ?? null;
  }

  isDirty(pageId: string): boolean {
    return this._dirty[pageId] ?? false;
  }

  isLoading(pageId: string): boolean {
    return this._loading[pageId] ?? false;
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

    // If no body stream (e.g. 304, or browser doesn't support), fall back to batch
    if (!res.body) {
      const buffer = await res.arrayBuffer();
      const table = tableFromIPC(new Uint8Array(buffer));
      this._tables = { ...this._tables, [pageId]: table };
      this._loading = { ...this._loading, [pageId]: false };
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

      // Try to parse accumulated bytes as Arrow IPC
      // tableFromIPC succeeds once we have at least one complete RecordBatch
      try {
        const combined = concatBytes(chunks, totalLen);
        const table = tableFromIPC(combined);
        if (table.numRows > 0) {
          // Update reactively — $effect triggers canvas sync
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

      // For list columns (e.g. polygon), we must convert each row individually
      // because col.toArray() returns Arrow Vectors, not plain arrays
      const isListCol = field.name === "polygon";

      const arr: unknown[] = new Array(n);
      for (let i = 0; i < n; i++) {
        if (i === rowIndex && field.name in updates) {
          arr[i] = updates[field.name];
        } else if (isListCol) {
          // Convert Arrow Vector row to plain number array
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

    const updated = tableFromArrays(cols);
    this._tables = { ...this._tables, [pageId]: updated };
    this._dirty = { ...this._dirty, [pageId]: true };
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

    const updated = tableFromArrays(cols);
    this._tables = { ...this._tables, [pageId]: updated };
    this._dirty = { ...this._dirty, [pageId]: true };
    return updated;
  }

  deleteLocal(pageId: string, rowIndex: number): Table | null {
    const existing = this._tables[pageId];
    if (!existing || rowIndex < 0 || rowIndex >= existing.numRows) return null;

    undoStack.push(existing);

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

    const updated = tableFromArrays(cols);
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

    const ipc = tableToIPC(table, "stream");
    const res = await fetch(`/api/annotations/${pageId}`, {
      method: "POST",
      headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
      body: ipc,
    });

    if (!res.ok) throw new Error(`Save failed: ${res.status}`);

    const fresh = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
    this._tables = { ...this._tables, [pageId]: fresh };
    this._dirty = { ...this._dirty, [pageId]: false };
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

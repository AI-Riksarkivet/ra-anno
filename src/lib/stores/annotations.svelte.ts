import {
  Schema,
  type Table,
  Table as ArrowTable,
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
} from "apache-arrow";
import { undoStack } from "./undo.svelte.js";

// ── Helpers ──

/** Extract specific rows from a table, applying field overlays */
function extractRowsWithOverlays(
  table: Table,
  indices: number[],
  fieldOverrides: Map<number, Map<string, unknown>>,
): Table {
  if (indices.length === 0) return tableFromArrays({});
  const cols: Record<string, unknown[]> = {};
  for (const field of table.schema.fields) {
    const col = table.getChild(field.name)!;
    const isListCol = field.name === "polygon";
    const arr: unknown[] = new Array(indices.length);
    for (let j = 0; j < indices.length; j++) {
      const i = indices[j];
      // Check field overlay first
      const override = fieldOverrides.get(i)?.get(field.name);
      if (override !== undefined) {
        arr[j] = override;
      } else if (isListCol) {
        arr[j] = arrowListToArray(col.get(i));
      } else {
        arr[j] = col.get(i);
      }
    }
    cols[field.name] = arr;
  }
  return tableFromArrays(cols);
}

/** Build full table from Arrow base + overlays (only called on save) */
function materializeTable(
  base: Table,
  fieldOverrides: Map<number, Map<string, unknown>>,
  appendedRows: Record<string, unknown>[],
  deletedIndices: Set<number>,
): Table {
  const n = base.numRows + appendedRows.length - deletedIndices.size;
  const cols: Record<string, unknown[]> = {};
  for (const field of base.schema.fields) {
    cols[field.name] = new Array(n);
  }

  let dst = 0;
  // Copy base rows (skip deleted)
  for (let i = 0; i < base.numRows; i++) {
    if (deletedIndices.has(i)) continue;
    const rowOverrides = fieldOverrides.get(i);
    for (const field of base.schema.fields) {
      const override = rowOverrides?.get(field.name);
      if (override !== undefined) {
        cols[field.name][dst] = override;
      } else if (field.name === "polygon") {
        cols[field.name][dst] = arrowListToArray(
          base.getChild(field.name)!.get(i),
        );
      } else {
        cols[field.name][dst] = base.getChild(field.name)!.get(i);
      }
    }
    dst++;
  }
  // Append new rows
  for (const row of appendedRows) {
    for (const field of base.schema.fields) {
      cols[field.name][dst] = row[field.name] ?? null;
    }
    dst++;
  }

  const raw = tableFromArrays(cols);
  // Preserve schema metadata
  if (base.schema.metadata.size > 0) {
    const schema = new Schema(raw.schema.fields, base.schema.metadata);
    return new ArrowTable(schema, raw.batches);
  }
  return raw;
}

/** Convert Arrow List element to plain number array */
function arrowListToArray(val: unknown): number[] | null {
  if (!val || typeof val !== "object") return null;
  const v = val as { length: number; get: (i: number) => number };
  if (!v.length || v.length === 0) return null;
  const arr = new Array(v.length);
  for (let j = 0; j < v.length; j++) arr[j] = v.get(j);
  return arr;
}

// ── Undo snapshot: captures overlay state, not full table rebuild ──

interface UndoSnapshot {
  fieldOverrides: Map<number, Map<string, unknown>>;
  appendedRows: Record<string, unknown>[];
  deletedIndices: Set<number>;
  deletedIds: Set<string>;
}

function cloneSnapshot(
  fo: Map<number, Map<string, unknown>>,
  ar: Record<string, unknown>[],
  di: Set<number>,
  dids: Set<string>,
): UndoSnapshot {
  return {
    fieldOverrides: new Map(
      [...fo].map(([k, v]) => [k, new Map(v)]),
    ),
    appendedRows: ar.map((r) => ({ ...r })),
    deletedIndices: new Set(di),
    deletedIds: new Set(dids),
  };
}

class AnnotationStore {
  // The server's Arrow table — NEVER modified after load. This is the read-only base.
  private _serverTables = $state.raw<Record<string, Table>>({});

  // Overlays on top of the server table — O(1) per edit, no table rebuild
  private _fieldOverrides = $state<
    Record<string, Map<number, Map<string, unknown>>>
  >({});
  private _appendedRows = $state<Record<string, Record<string, unknown>[]>>(
    {},
  );
  private _deletedIndices = $state<Record<string, Set<number>>>({});
  private _deletedIds = $state<Record<string, Set<string>>>({});

  // Undo: snapshots of overlay state (cheap — just Maps, not full tables)
  private _undoStack = $state<Record<string, UndoSnapshot[]>>({});
  private _redoStack = $state<Record<string, UndoSnapshot[]>>({});

  // Version tracking for OCC
  private _versions = $state<Record<string, string>>({});
  private _dirty = $state<Record<string, boolean>>({});
  private _loading = $state<Record<string, boolean>>({});

  // Materialized view — rebuilt only when overlays change (NOT the full Arrow table)
  // This is what the UI and Pixi read from
  private _materializedTables = $state.raw<Record<string, Table>>({});

  /** The current table (base + overlays materialized) for UI consumption */
  table(pageId: string): Table | null {
    return this._materializedTables[pageId] ?? null;
  }

  /** The server's original table (for reading columns zero-copy) */
  serverTable(pageId: string): Table | null {
    return this._serverTables[pageId] ?? null;
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

  private getOverlays(pageId: string) {
    return {
      fields: this._fieldOverrides[pageId] ?? new Map(),
      appended: this._appendedRows[pageId] ?? [],
      deleted: this._deletedIndices[pageId] ?? new Set(),
      deletedIds: this._deletedIds[pageId] ?? new Set(),
    };
  }

  private pushUndo(pageId: string): void {
    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);
    const snapshot = cloneSnapshot(fields, appended, deleted, deletedIds);
    const stack = this._undoStack[pageId] ?? [];
    stack.push(snapshot);
    this._undoStack = { ...this._undoStack, [pageId]: stack };
    // Clear redo on new edit
    this._redoStack = { ...this._redoStack, [pageId]: [] };
  }

  private rematerialize(pageId: string): void {
    const base = this._serverTables[pageId];
    if (!base) return;
    const { fields, appended, deleted } = this.getOverlays(pageId);
    const table = materializeTable(base, fields, appended, deleted);
    this._materializedTables = {
      ...this._materializedTables,
      [pageId]: table,
    };
    this._dirty = { ...this._dirty, [pageId]: true };
  }

  // ── Load ──

  async load(pageId: string): Promise<Table> {
    const cached = this._serverTables[pageId];
    if (cached) return this._materializedTables[pageId] ?? cached;

    this._loading = { ...this._loading, [pageId]: true };

    const res = await fetch(`/api/annotations/${pageId}`);
    if (!res.ok) {
      this._loading = { ...this._loading, [pageId]: false };
      throw new Error(`Failed to load annotations: ${res.status}`);
    }

    const etag = res.headers.get("ETag") ?? "";
    this._versions = { ...this._versions, [pageId]: etag };

    if (!res.body) {
      const buffer = await res.arrayBuffer();
      const table = tableFromIPC(new Uint8Array(buffer));
      this._serverTables = { ...this._serverTables, [pageId]: table };
      this._materializedTables = {
        ...this._materializedTables,
        [pageId]: table,
      };
      this._loading = { ...this._loading, [pageId]: false };
      this.clearOverlays(pageId);
      return table;
    }

    // Stream
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
          this._serverTables = { ...this._serverTables, [pageId]: table };
          this._materializedTables = {
            ...this._materializedTables,
            [pageId]: table,
          };
        }
      } catch { /* incomplete stream */ }
    }

    const combined = concatBytes(chunks, totalLen);
    const table = tableFromIPC(combined);
    this._serverTables = { ...this._serverTables, [pageId]: table };
    this._materializedTables = {
      ...this._materializedTables,
      [pageId]: table,
    };
    this._loading = { ...this._loading, [pageId]: false };
    this.clearOverlays(pageId);
    return table;
  }

  // ── Edits (O(1) — overlay only, no table rebuild) ──

  updateLocal(
    pageId: string,
    rowIndex: number,
    updates: Record<string, unknown>,
  ): void {
    this.pushUndo(pageId);
    const fields = this._fieldOverrides[pageId] ?? new Map();
    let row = fields.get(rowIndex);
    if (!row) {
      row = new Map();
      fields.set(rowIndex, row);
    }
    for (const [k, v] of Object.entries(updates)) {
      row.set(k, v);
    }
    this._fieldOverrides = { ...this._fieldOverrides, [pageId]: fields };
    this.rematerialize(pageId);
  }

  batchUpdateLocal(
    pageId: string,
    updatesMap: Map<number, Record<string, unknown>>,
  ): void {
    if (updatesMap.size === 0) return;
    this.pushUndo(pageId);
    const fields = this._fieldOverrides[pageId] ?? new Map();
    for (const [rowIndex, updates] of updatesMap) {
      let row = fields.get(rowIndex);
      if (!row) {
        row = new Map();
        fields.set(rowIndex, row);
      }
      for (const [k, v] of Object.entries(updates)) {
        row.set(k, v);
      }
    }
    this._fieldOverrides = { ...this._fieldOverrides, [pageId]: fields };
    this.rematerialize(pageId);
  }

  appendLocal(pageId: string, row: Record<string, unknown>): Table | null {
    const base = this._serverTables[pageId];
    if (!base) return null;
    this.pushUndo(pageId);
    const appended = [...(this._appendedRows[pageId] ?? []), row];
    this._appendedRows = { ...this._appendedRows, [pageId]: appended };
    this.rematerialize(pageId);
    return this._materializedTables[pageId] ?? null;
  }

  deleteLocal(pageId: string, rowIndex: number): void {
    const base = this._serverTables[pageId];
    if (!base) return;
    this.pushUndo(pageId);

    const baseRows = base.numRows;
    if (rowIndex < baseRows) {
      // Deleting a server row — track by index and ID
      const deleted = new Set(this._deletedIndices[pageId] ?? []);
      deleted.add(rowIndex);
      this._deletedIndices = { ...this._deletedIndices, [pageId]: deleted };

      const id = String(base.getChild("id")?.get(rowIndex) ?? "");
      if (id) {
        const deletedIds = new Set(this._deletedIds[pageId] ?? []);
        deletedIds.add(id);
        this._deletedIds = { ...this._deletedIds, [pageId]: deletedIds };
      }

      // Remove any field overrides for this row
      const fields = this._fieldOverrides[pageId];
      if (fields) {
        fields.delete(rowIndex);
        this._fieldOverrides = { ...this._fieldOverrides, [pageId]: fields };
      }
    } else {
      // Deleting an appended row
      const appendedIndex = rowIndex - baseRows;
      const appended = [...(this._appendedRows[pageId] ?? [])];
      // Adjust for already-deleted base rows
      const deleted = this._deletedIndices[pageId] ?? new Set();
      let actualAppendedIdx = appendedIndex;
      for (const d of deleted) {
        if (d <= rowIndex) actualAppendedIdx++;
      }
      actualAppendedIdx = rowIndex - baseRows + deleted.size;
      if (actualAppendedIdx >= 0 && actualAppendedIdx < appended.length) {
        appended.splice(actualAppendedIdx, 1);
        this._appendedRows = { ...this._appendedRows, [pageId]: appended };
      }
    }

    this.rematerialize(pageId);
  }

  // ── Undo / Redo (swap overlay snapshots — no table involved) ──

  get canUndo(): boolean {
    return Object.values(this._undoStack).some((s) => s.length > 0);
  }

  get canRedo(): boolean {
    return Object.values(this._redoStack).some((s) => s.length > 0);
  }

  undo(pageId: string): Table | null {
    const stack = this._undoStack[pageId];
    if (!stack || stack.length === 0) return null;

    // Save current state to redo
    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);
    const current = cloneSnapshot(fields, appended, deleted, deletedIds);
    const redo = this._redoStack[pageId] ?? [];
    redo.push(current);
    this._redoStack = { ...this._redoStack, [pageId]: redo };

    // Pop previous state
    const prev = stack.pop()!;
    this._undoStack = { ...this._undoStack, [pageId]: stack };
    this._fieldOverrides = {
      ...this._fieldOverrides,
      [pageId]: prev.fieldOverrides,
    };
    this._appendedRows = {
      ...this._appendedRows,
      [pageId]: prev.appendedRows,
    };
    this._deletedIndices = {
      ...this._deletedIndices,
      [pageId]: prev.deletedIndices,
    };
    this._deletedIds = { ...this._deletedIds, [pageId]: prev.deletedIds };

    this.rematerialize(pageId);
    return this._materializedTables[pageId] ?? null;
  }

  redo(pageId: string): Table | null {
    const stack = this._redoStack[pageId];
    if (!stack || stack.length === 0) return null;

    // Save current to undo
    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);
    const current = cloneSnapshot(fields, appended, deleted, deletedIds);
    const undo = this._undoStack[pageId] ?? [];
    undo.push(current);
    this._undoStack = { ...this._undoStack, [pageId]: undo };

    // Pop next state
    const next = stack.pop()!;
    this._redoStack = { ...this._redoStack, [pageId]: stack };
    this._fieldOverrides = {
      ...this._fieldOverrides,
      [pageId]: next.fieldOverrides,
    };
    this._appendedRows = {
      ...this._appendedRows,
      [pageId]: next.appendedRows,
    };
    this._deletedIndices = {
      ...this._deletedIndices,
      [pageId]: next.deletedIndices,
    };
    this._deletedIds = { ...this._deletedIds, [pageId]: next.deletedIds };

    this.rematerialize(pageId);
    return this._materializedTables[pageId] ?? null;
  }

  // ── Save (delta only — builds table from overlays, not full base) ──

  async save(pageId: string): Promise<Table> {
    const base = this._serverTables[pageId];
    if (!base) throw new Error("No table to save");

    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);

    // Build delta: only modified + appended rows
    const dirtyBaseIndices = [...fields.keys()].filter(
      (i) => !deleted.has(i),
    );
    const hasChanges = dirtyBaseIndices.length > 0 || appended.length > 0 ||
      deletedIds.size > 0;

    let ipc: Uint8Array;
    let method: string;

    if (hasChanges && (dirtyBaseIndices.length > 0 || appended.length > 0)) {
      // Build delta table: modified base rows + appended rows
      const materialized = this._materializedTables[pageId];
      if (!materialized) throw new Error("No materialized table");

      // Find indices of dirty rows in the materialized table
      // Materialized = base rows (minus deleted, with overrides) + appended
      const matBaseCount = base.numRows - deleted.size;
      const matIndices: number[] = [];

      // Map base dirty indices to materialized indices (accounting for deleted rows before them)
      for (const baseIdx of dirtyBaseIndices) {
        let matIdx = baseIdx;
        for (const d of deleted) {
          if (d < baseIdx) matIdx--;
        }
        matIndices.push(matIdx);
      }

      // Appended rows are at the end of materialized table
      for (let a = 0; a < appended.length; a++) {
        matIndices.push(matBaseCount + a);
      }

      const delta = extractRowsWithOverlays(
        materialized,
        matIndices,
        new Map(),
      );
      ipc = tableToIPC(delta, "stream");
      method = "PATCH";
    } else if (deletedIds.size > 0) {
      ipc = new Uint8Array(0);
      method = "PATCH";
    } else {
      // No changes — shouldn't happen but fallback to full table
      const materialized = this._materializedTables[pageId];
      if (!materialized) throw new Error("No materialized table");
      ipc = tableToIPC(materialized, "stream");
      method = "POST";
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/vnd.apache.arrow.stream",
    };
    const loadedVersion = this._versions[pageId];
    if (loadedVersion) headers["If-Match"] = loadedVersion;
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

    const newVersion = res.headers.get("ETag") ?? "";
    this._versions = { ...this._versions, [pageId]: newVersion };

    const fresh = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
    this._serverTables = { ...this._serverTables, [pageId]: fresh };
    this._materializedTables = {
      ...this._materializedTables,
      [pageId]: fresh,
    };
    this.clearOverlays(pageId);
    return fresh;
  }

  private clearOverlays(pageId: string): void {
    this._fieldOverrides = {
      ...this._fieldOverrides,
      [pageId]: new Map(),
    };
    this._appendedRows = { ...this._appendedRows, [pageId]: [] };
    this._deletedIndices = {
      ...this._deletedIndices,
      [pageId]: new Set(),
    };
    this._deletedIds = { ...this._deletedIds, [pageId]: new Set() };
    this._undoStack = { ...this._undoStack, [pageId]: [] };
    this._redoStack = { ...this._redoStack, [pageId]: [] };
    this._dirty = { ...this._dirty, [pageId]: false };
  }
}

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

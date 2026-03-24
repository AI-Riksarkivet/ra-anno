import {
  DataType,
  Schema,
  type Table,
  Table as ArrowTable,
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
} from "apache-arrow";

// ── Helpers ──

/** Check if a field is a List type (e.g. polygon: List<Float32>) */
function isListField(field: { type: DataType }): boolean {
  return DataType.isList(field.type);
}

/** Convert Arrow List element to plain JS array */
function arrowListToArray(val: unknown): number[] | null {
  if (!val || typeof val !== "object") return null;
  const v = val as { length: number; get: (i: number) => number };
  if (!v.length || v.length === 0) return null;
  const arr = new Array(v.length);
  for (let j = 0; j < v.length; j++) arr[j] = v.get(j);
  return arr;
}

/** Read a column value, converting List types to plain arrays */
function readColumnValue(
  col: import("apache-arrow").Vector,
  i: number,
  isList: boolean,
): unknown {
  if (isList) return arrowListToArray(col.get(i));
  return col.get(i);
}

/** Build full table from Arrow base + overlays */
function materializeTable(
  base: Table,
  fieldOverrides: Map<number, Map<string, unknown>>,
  appendedRows: Record<string, unknown>[],
  deletedIndices: Set<number>,
): Table {
  const n = base.numRows + appendedRows.length - deletedIndices.size;
  const cols: Record<string, unknown[]> = {};
  // Pre-check which fields are List type (avoid per-row string comparison)
  const listFlags = base.schema.fields.map((f) => isListField(f));

  for (const field of base.schema.fields) {
    cols[field.name] = new Array(n);
  }

  let dst = 0;
  for (let i = 0; i < base.numRows; i++) {
    if (deletedIndices.has(i)) continue;
    const rowOverrides = fieldOverrides.get(i);
    for (let f = 0; f < base.schema.fields.length; f++) {
      const field = base.schema.fields[f];
      const override = rowOverrides?.get(field.name);
      if (override !== undefined) {
        cols[field.name][dst] = override;
      } else {
        cols[field.name][dst] = readColumnValue(
          base.getChild(field.name)!,
          i,
          listFlags[f],
        );
      }
    }
    dst++;
  }
  for (const row of appendedRows) {
    for (const field of base.schema.fields) {
      cols[field.name][dst] = row[field.name] ?? null;
    }
    dst++;
  }

  const raw = tableFromArrays(cols);
  if (base.schema.metadata.size > 0) {
    return new ArrowTable(
      new Schema(raw.schema.fields, base.schema.metadata),
      raw.batches,
    );
  }
  return raw;
}

/** Extract specific rows from a materialized table for delta save */
function extractRows(table: Table, indices: number[]): Table {
  if (indices.length === 0) return tableFromArrays({});
  const listFlags = table.schema.fields.map((f) => isListField(f));
  const cols: Record<string, unknown[]> = {};
  for (let f = 0; f < table.schema.fields.length; f++) {
    const field = table.schema.fields[f];
    const col = table.getChild(field.name)!;
    const arr: unknown[] = new Array(indices.length);
    for (let j = 0; j < indices.length; j++) {
      arr[j] = readColumnValue(col, indices[j], listFlags[f]);
    }
    cols[field.name] = arr;
  }
  return tableFromArrays(cols);
}

// ── Undo snapshot ──

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
    fieldOverrides: new Map([...fo].map(([k, v]) => [k, new Map(v)])),
    appendedRows: ar.map((r) => ({ ...r })),
    deletedIndices: new Set(di),
    deletedIds: new Set(dids),
  };
}

// ── Store ──

class AnnotationStore {
  private _serverTables = $state.raw<Record<string, Table>>({});
  private _fieldOverrides = $state<
    Record<string, Map<number, Map<string, unknown>>>
  >({});
  private _appendedRows = $state<Record<string, Record<string, unknown>[]>>(
    {},
  );
  private _deletedIndices = $state<Record<string, Set<number>>>({});
  private _deletedIds = $state<Record<string, Set<string>>>({});
  private _undoStack = $state<Record<string, UndoSnapshot[]>>({});
  private _redoStack = $state<Record<string, UndoSnapshot[]>>({});
  private _versions = $state<Record<string, string>>({});
  private _dirty = $state<Record<string, boolean>>({});
  private _loading = $state<Record<string, boolean>>({});
  private _materializedTables = $state.raw<Record<string, Table>>({});
  private _structuralVersion = $state<Record<string, number>>({});

  table(pageId: string): Table | null {
    return this._materializedTables[pageId] ?? null;
  }

  serverTable(pageId: string): Table | null {
    return this._serverTables[pageId] ?? null;
  }

  structuralVersion(pageId: string): number {
    return this._structuralVersion[pageId] ?? 0;
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

  get canUndo(): boolean {
    return Object.values(this._undoStack).some((s) => s.length > 0);
  }

  get canRedo(): boolean {
    return Object.values(this._redoStack).some((s) => s.length > 0);
  }

  // ── Private helpers ──

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
    this._redoStack = { ...this._redoStack, [pageId]: [] };
  }

  private bumpStructural(pageId: string): void {
    const v = this._structuralVersion[pageId] ?? 0;
    this._structuralVersion = {
      ...this._structuralVersion,
      [pageId]: v + 1,
    };
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

  private applyUndoSnapshot(pageId: string, snapshot: UndoSnapshot): void {
    this._fieldOverrides = {
      ...this._fieldOverrides,
      [pageId]: snapshot.fieldOverrides,
    };
    this._appendedRows = {
      ...this._appendedRows,
      [pageId]: snapshot.appendedRows,
    };
    this._deletedIndices = {
      ...this._deletedIndices,
      [pageId]: snapshot.deletedIndices,
    };
    this._deletedIds = {
      ...this._deletedIds,
      [pageId]: snapshot.deletedIds,
    };
    this.bumpStructural(pageId);
    this.rematerialize(pageId);
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
    this.bumpStructural(pageId);
  }

  // ── Load ──

  async load(pageId: string): Promise<Table> {
    const cached = this._serverTables[pageId];
    if (cached) return this._materializedTables[pageId] ?? cached;

    this._loading = { ...this._loading, [pageId]: true };

    const res = await fetch(`/api/annotations/${pageId}`);
    if (!res.ok) {
      this._loading = { ...this._loading, [pageId]: false };
      // No annotations — create empty table
      const empty = tableFromArrays({
        id: [] as string[],
        page_id: [] as string[],
        x: new Float32Array(0),
        y: new Float32Array(0),
        width: new Float32Array(0),
        height: new Float32Array(0),
        polygon: [] as (number[] | null)[],
        text: [] as string[],
        label: [] as string[],
        confidence: new Float32Array(0),
        source: [] as string[],
        status: [] as string[],
        reviewer: [] as string[],
        group: [] as string[],
        metadata: [] as string[],
      });
      this._serverTables = { ...this._serverTables, [pageId]: empty };
      this._materializedTables = {
        ...this._materializedTables,
        [pageId]: empty,
      };
      return empty;
    }

    const etag = res.headers.get("ETag") ?? "";
    this._versions = { ...this._versions, [pageId]: etag };

    // Parse Arrow IPC — zero-copy for primitive columns
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

    // Streaming: parse progressively
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
      } catch {
        /* incomplete stream */
      }
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

  // ── Edits ──

  /** Field edit — O(1) overlay, rematerializes for sidebar but does NOT bump structural */
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
    this.rematerialize(pageId); // sidebar needs updated table
    // NOTE: no bumpStructural — Pixi uses setFieldOverride for rendering changes
  }

  /** Batch field edit — same as updateLocal but for multiple rows */
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
    // NOTE: no bumpStructural
  }

  /** Append row — structural change, bumps version */
  appendLocal(pageId: string, row: Record<string, unknown>): Table | null {
    const base = this._serverTables[pageId];
    if (!base) return null;
    this.pushUndo(pageId);
    const appended = [...(this._appendedRows[pageId] ?? []), row];
    this._appendedRows = { ...this._appendedRows, [pageId]: appended };
    this.bumpStructural(pageId);
    this.rematerialize(pageId);
    return this._materializedTables[pageId] ?? null;
  }

  /** Delete row — structural change, bumps version */
  deleteLocal(pageId: string, rowIndex: number): void {
    const base = this._serverTables[pageId];
    if (!base) return;
    this.pushUndo(pageId);

    const baseRows = base.numRows;
    if (rowIndex < baseRows) {
      const deleted = new Set(this._deletedIndices[pageId] ?? []);
      deleted.add(rowIndex);
      this._deletedIndices = { ...this._deletedIndices, [pageId]: deleted };

      const id = String(base.getChild("id")?.get(rowIndex) ?? "");
      if (id) {
        const deletedIds = new Set(this._deletedIds[pageId] ?? []);
        deletedIds.add(id);
        this._deletedIds = { ...this._deletedIds, [pageId]: deletedIds };
      }

      const fields = this._fieldOverrides[pageId];
      if (fields) {
        fields.delete(rowIndex);
        this._fieldOverrides = { ...this._fieldOverrides, [pageId]: fields };
      }
    } else {
      const appended = [...(this._appendedRows[pageId] ?? [])];
      const deleted = this._deletedIndices[pageId] ?? new Set();
      const actualAppendedIdx = rowIndex - baseRows + deleted.size;
      if (actualAppendedIdx >= 0 && actualAppendedIdx < appended.length) {
        appended.splice(actualAppendedIdx, 1);
        this._appendedRows = { ...this._appendedRows, [pageId]: appended };
      }
    }

    this.bumpStructural(pageId);
    this.rematerialize(pageId);
  }

  // ── Undo / Redo ──

  undo(pageId: string): Table | null {
    const stack = this._undoStack[pageId];
    if (!stack || stack.length === 0) return null;

    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);
    const current = cloneSnapshot(fields, appended, deleted, deletedIds);
    const redo = this._redoStack[pageId] ?? [];
    redo.push(current);
    this._redoStack = { ...this._redoStack, [pageId]: redo };

    const prev = stack.pop()!;
    this._undoStack = { ...this._undoStack, [pageId]: stack };
    this.applyUndoSnapshot(pageId, prev);
    return this._materializedTables[pageId] ?? null;
  }

  redo(pageId: string): Table | null {
    const stack = this._redoStack[pageId];
    if (!stack || stack.length === 0) return null;

    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);
    const current = cloneSnapshot(fields, appended, deleted, deletedIds);
    const undo = this._undoStack[pageId] ?? [];
    undo.push(current);
    this._undoStack = { ...this._undoStack, [pageId]: undo };

    const next = stack.pop()!;
    this._redoStack = { ...this._redoStack, [pageId]: stack };
    this.applyUndoSnapshot(pageId, next);
    return this._materializedTables[pageId] ?? null;
  }

  // ── Save ──

  async save(pageId: string): Promise<Table> {
    const base = this._serverTables[pageId];
    if (!base) throw new Error("No table to save");

    const { fields, appended, deleted, deletedIds } = this.getOverlays(pageId);
    const dirtyBaseIndices = [...fields.keys()].filter(
      (i) => !deleted.has(i),
    );
    const hasChanges = dirtyBaseIndices.length > 0 || appended.length > 0 ||
      deletedIds.size > 0;

    let ipc: Uint8Array;
    let method: string;

    if (hasChanges && (dirtyBaseIndices.length > 0 || appended.length > 0)) {
      const materialized = this._materializedTables[pageId];
      if (!materialized) throw new Error("No materialized table");

      const matBaseCount = base.numRows - deleted.size;
      const matIndices: number[] = [];
      for (const baseIdx of dirtyBaseIndices) {
        let matIdx = baseIdx;
        for (const d of deleted) {
          if (d < baseIdx) matIdx--;
        }
        matIndices.push(matIdx);
      }
      for (let a = 0; a < appended.length; a++) {
        matIndices.push(matBaseCount + a);
      }

      const delta = extractRows(materialized, matIndices);
      ipc = tableToIPC(delta, "stream");
      method = "PATCH";
    } else if (deletedIds.size > 0) {
      ipc = new Uint8Array(0);
      method = "PATCH";
    } else {
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

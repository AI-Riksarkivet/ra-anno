import type { Table } from "apache-arrow";
import { AnnotationStore } from "$lib/engine/store/AnnotationStore.js";
import { httpAnnotationTransport } from "./httpAnnotationTransport.js";

/**
 * Thin Svelte-5 runes adapter over the framework-agnostic engine `AnnotationStore`.
 * The engine store owns all state + logic and emits "structural" / "field" change
 * signals; this adapter mirrors them into two `$state` ticks so reactive reads
 * re-run. The structural/field split is preserved: field edits bump only the field
 * tick (sidebar reacts; Pixi does NOT re-sync), structural changes bump the
 * structural tick (Pixi re-syncs). Public API is identical to the old runes store.
 */
class AnnotationStoreAdapter {
  #store = new AnnotationStore(httpAnnotationTransport());
  #structuralTick = $state(0);
  #fieldTick = $state(0);

  constructor() {
    this.#store.on((kind) => {
      if (kind === "field") this.#fieldTick++;
      else this.#structuralTick++;
    });
  }

  // ── Reactive reads (touch the relevant tick, then delegate) ──

  table(pageId: string): Table | null {
    void this.#structuralTick;
    return this.#store.table(pageId);
  }

  fieldVersion(pageId: string): number {
    void this.#fieldTick;
    return this.#store.fieldVersion(pageId);
  }

  getFieldValue(pageId: string, rowIndex: number, field: string): unknown {
    void this.#fieldTick;
    void this.#structuralTick;
    return this.#store.getFieldValue(pageId, rowIndex, field);
  }

  serverTable(pageId: string): Table | null {
    void this.#structuralTick;
    return this.#store.serverTable(pageId);
  }

  structuralVersion(pageId: string): number {
    void this.#structuralTick;
    return this.#store.structuralVersion(pageId);
  }

  isDirty(pageId: string): boolean {
    void this.#structuralTick;
    void this.#fieldTick;
    return this.#store.isDirty(pageId);
  }

  isLoading(pageId: string): boolean {
    void this.#structuralTick;
    return this.#store.isLoading(pageId);
  }

  version(pageId: string): string | null {
    void this.#structuralTick;
    return this.#store.version(pageId);
  }

  get canUndo(): boolean {
    void this.#structuralTick;
    void this.#fieldTick;
    return this.#store.canUndo;
  }

  get canRedo(): boolean {
    void this.#structuralTick;
    void this.#fieldTick;
    return this.#store.canRedo;
  }

  // ── Mutations (pure delegates — the engine store emits → ticks bump) ──

  load(pageId: string): Promise<Table> {
    return this.#store.load(pageId);
  }

  updateLocal(
    pageId: string,
    rowIndex: number,
    updates: Record<string, unknown>,
  ): void {
    this.#store.updateLocal(pageId, rowIndex, updates);
  }

  batchUpdateLocal(
    pageId: string,
    updatesMap: Map<number, Record<string, unknown>>,
  ): void {
    this.#store.batchUpdateLocal(pageId, updatesMap);
  }

  appendLocal(pageId: string, row: Record<string, unknown>): Table | null {
    return this.#store.appendLocal(pageId, row);
  }

  /** Append many rows in one batch — O(appended). For bulk / streamed inference. */
  appendManyLocal(
    pageId: string,
    rows: Record<string, unknown>[],
  ): Table | null {
    return this.#store.appendManyLocal(pageId, rows);
  }

  deleteLocal(pageId: string, rowIndex: number): void {
    this.#store.deleteLocal(pageId, rowIndex);
  }

  undo(pageId: string): Table | null {
    return this.#store.undo(pageId);
  }

  redo(pageId: string): Table | null {
    return this.#store.redo(pageId);
  }

  save(pageId: string): Promise<Table> {
    return this.#store.save(pageId);
  }
}

export const annotationStore = new AnnotationStoreAdapter();

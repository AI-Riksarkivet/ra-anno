import { LayerStore as CoreLayerStore } from "$lib/engine/store/LayerStore.js";

/** Context key for dependency injection — use with setContext/getContext */
export const LAYER_CTX = Symbol("layer-store");

/**
 * Thin Svelte-5 runes adapter over the framework-agnostic engine `LayerStore`.
 * The engine store owns the logic and emits on change; this adapter mirrors that
 * into a `$state` tick so reactive reads of groupByColumn/hiddenGroups/groupColors
 * re-run. Public API is identical to the old runes store (read fields, call methods).
 */
export class LayerStore {
  #core = new CoreLayerStore();
  #tick = $state(0);

  constructor() {
    this.#core.on(() => this.#tick++);
  }

  get groupByColumn(): string {
    void this.#tick;
    return this.#core.groupByColumn;
  }

  get hiddenGroups(): Set<string> {
    void this.#tick;
    return this.#core.hiddenGroups;
  }

  get groupColors(): Map<string, number> {
    void this.#tick;
    return this.#core.groupColors;
  }

  toggleVisibility(group: string): void {
    this.#core.toggleVisibility(group);
  }

  setColor(group: string, hex: number): void {
    this.#core.setColor(group, hex);
  }

  setGroupBy(column: string): void {
    this.#core.setGroupBy(column);
  }

  isHidden(group: string): boolean {
    void this.#tick;
    return this.#core.isHidden(group);
  }

  getColor(group: string): number | undefined {
    void this.#tick;
    return this.#core.getColor(group);
  }
}

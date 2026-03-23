/** Context key for dependency injection — use with setContext/getContext */
export const LAYER_CTX = Symbol("layer-store");

export class LayerStore {
  groupByColumn = $state("label");
  hiddenGroups = $state(new Set<string>());
  groupColors = $state(new Map<string, number>());

  toggleVisibility(group: string): void {
    const next = new Set(this.hiddenGroups);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    this.hiddenGroups = next;
  }

  setColor(group: string, hex: number): void {
    const next = new Map(this.groupColors);
    next.set(group, hex);
    this.groupColors = next;
  }

  setGroupBy(column: string): void {
    this.groupByColumn = column;
    this.hiddenGroups = new Set();
    this.groupColors = new Map();
  }

  isHidden(group: string): boolean {
    return this.hiddenGroups.has(group);
  }

  getColor(group: string): number | undefined {
    return this.groupColors.get(group);
  }
}

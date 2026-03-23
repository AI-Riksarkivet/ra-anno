import { Application, Container, Graphics } from "pixi.js";
import type { Table } from "apache-arrow";
import type { ViewportBounds } from "./types.js";
import { isAxisAlignedRect, pointInPolygon } from "./interaction/geometry.js";

/** Default color function — consumers can override */
const DEFAULT_COLOR = 0x8b5cf6; // purple

/** Function that maps a status string to a hex color */
export type ColorFn = (status: string) => number;

/** Visual style for annotation rendering */
export interface AnnotationStyle {
  fillAlpha: number;
  strokeWidth: number;
  strokeAlpha: number;
}

/** Layer configuration passed from the UI store */
export interface LayerConfig {
  hiddenGroups: Set<string>;
  groupByColumn: string;
  groupColors: Map<string, number>;
}

const DEFAULT_STYLE: AnnotationStyle = {
  fillAlpha: 0.08,
  strokeWidth: 1.5,
  strokeAlpha: 0.8,
};

export class ArrowDataPlugin {
  private app: Application;
  private container: Container;
  private colorFn: ColorFn;
  private style: AnnotationStyle;
  private dirty = false;

  // Pixi-native: one Container per group → toggle .visible for instant show/hide
  private groupContainers = new Map<string, Container>();

  // Highlight layers (always on top)
  private highlightGraphics: Graphics;
  private hoverGraphics: Graphics;

  // ── Arrow column cache ──
  // Only re-materialized when the Table reference changes (tracked via cachedTable).
  // Float32 columns are zero-copy views into the Arrow buffer — no allocation.
  // String columns (status, group-by) are materialized once as string[].
  private cachedTable: Table | null = null;
  private table: Table | null = null;
  private numRows = 0;
  private xArr: Float32Array = new Float32Array(0);
  private yArr: Float32Array = new Float32Array(0);
  private wArr: Float32Array = new Float32Array(0);
  private hArr: Float32Array = new Float32Array(0);
  private polygonCol: import("apache-arrow").Vector | null = null;
  private statusStr: string[] = []; // materialized once per table load

  // ── Group-by column cache ──
  // Re-materialized when table OR groupByColumn changes.
  private cachedGroupByCol = "";
  private groupByStr: string[] = []; // materialized once per column switch

  // ── Hidden mask ──
  // Reused allocation — only grows, never shrinks (avoids GC churn).
  private hiddenMask: Uint8Array = new Uint8Array(0);

  // Dirty overlay — local edits that override Arrow table values
  private dirtyOverrides = new Map<number, {
    x: number;
    y: number;
    w: number;
    h: number;
    polygon: number[];
  }>();

  // Layer filtering
  private hiddenGroups: Set<string> = new Set();
  private groupByColumn: string = "label";
  private groupColors: Map<string, number> = new Map();

  // Viewport culling
  private viewportBounds: ViewportBounds | null = null;

  constructor(
    app: Application,
    colorFn?: ColorFn,
    style?: Partial<AnnotationStyle>,
  ) {
    this.app = app;
    this.colorFn = colorFn ?? (() => DEFAULT_COLOR);
    this.style = { ...DEFAULT_STYLE, ...style };
    this.container = new Container();
    this.container.label = "annotations";
    this.container.cullable = true;
    app.stage.addChild(this.container);

    this.hoverGraphics = new Graphics();
    this.hoverGraphics.label = "hover";
    this.container.addChild(this.hoverGraphics);

    this.highlightGraphics = new Graphics();
    this.highlightGraphics.label = "highlight";
    this.container.addChild(this.highlightGraphics);
  }

  load(table: Table): void {
    this.table = table;
    this.dirty = true;
  }

  /** Update visual style and re-render */
  setStyle(style: Partial<AnnotationStyle>): void {
    this.style = { ...this.style, ...style };
    this.dirty = true;
  }

  /** Set a dirty override for a specific row (local edit, no table rebuild) */
  setOverride(
    index: number,
    geo: { x: number; y: number; w: number; h: number; polygon: number[] },
  ): void {
    this.dirtyOverrides.set(index, geo);
    this.dirty = true;
  }

  /** Get all dirty overrides (for applying to Arrow table on save) */
  getDirtyOverrides(): ReadonlyMap<
    number,
    { x: number; y: number; w: number; h: number; polygon: number[] }
  > {
    return this.dirtyOverrides;
  }

  /** Clear all dirty overrides (after save) */
  clearOverrides(): void {
    this.dirtyOverrides.clear();
  }

  /** Adjust override indices after a row is deleted (shifts higher indices down) */
  adjustOverridesForDelete(deletedIndex: number): void {
    const updated = new Map<
      number,
      { x: number; y: number; w: number; h: number; polygon: number[] }
    >();
    for (const [idx, geo] of this.dirtyOverrides) {
      if (idx < deletedIndex) updated.set(idx, geo);
      else if (idx > deletedIndex) updated.set(idx - 1, geo);
    }
    this.dirtyOverrides = updated;
  }

  /** Check if there are unsaved geometry edits */
  hasDirtyOverrides(): boolean {
    return this.dirtyOverrides.size > 0;
  }

  /** Update viewport bounds for culling */
  setViewport(bounds: ViewportBounds): void {
    this.viewportBounds = bounds;
  }

  /** Update all layer filtering state — triggers full rebuild on next sync */
  setLayerConfig(config: LayerConfig): void {
    this.hiddenGroups = config.hiddenGroups;
    this.groupByColumn = config.groupByColumn;
    this.groupColors = config.groupColors;
    this.dirty = true;
  }

  /**
   * Fast path: toggle a single group's visibility via Pixi Container.visible.
   * No full sync, no allocation — just flips the flag and re-renders.
   */
  setGroupVisible(group: string, visible: boolean): boolean {
    const c = this.groupContainers.get(group);
    if (!c) return false;
    c.visible = visible;
    // Update hiddenMask using pre-cached string[] — no String() allocation
    for (let i = 0; i < this.numRows; i++) {
      if (this.groupByStr[i] === group) {
        this.hiddenMask[i] = visible ? 0 : 1;
      }
    }
    this.app.render();
    return true;
  }

  sync(): void {
    if (!this.table || !this.dirty) return;
    this.dirty = false;

    const table = this.table;
    this.numRows = table.numRows;
    const numRows = this.numRows;

    // ── Phase 1: Cache Arrow columns ──
    // Only re-materialize when the Table reference changes.
    // Float32 columns → zero-copy views (no allocation)
    // String columns → materialized once into reusable string[]
    if (table !== this.cachedTable) {
      this.cachedTable = table;
      this.xArr = table.getChild("x")!.toArray() as Float32Array;
      this.yArr = table.getChild("y")!.toArray() as Float32Array;
      this.wArr = table.getChild("width")!.toArray() as Float32Array;
      this.hArr = table.getChild("height")!.toArray() as Float32Array;
      this.polygonCol = table.getChild("polygon") ?? null;

      // Materialize status strings once — reused until table changes
      const statusCol = table.getChild("status");
      this.statusStr = new Array(numRows);
      for (let i = 0; i < numRows; i++) {
        this.statusStr[i] = String(statusCol?.get(i) ?? "prediction");
      }

      // Force group-by column re-cache too
      this.cachedGroupByCol = "";
    }

    // ── Phase 2: Cache group-by column ──
    // Only re-materialize when column name changes (or table changed above).
    if (this.groupByColumn !== this.cachedGroupByCol) {
      this.cachedGroupByCol = this.groupByColumn;
      const col = table.getChild(this.groupByColumn);
      this.groupByStr = new Array(numRows);
      for (let i = 0; i < numRows; i++) {
        this.groupByStr[i] = String(col?.get(i) ?? "");
      }
    }

    // ── Phase 3: Compute hidden mask ──
    // Reuse allocation — only grow, never shrink
    if (this.hiddenMask.length < numRows) {
      this.hiddenMask = new Uint8Array(numRows);
    } else {
      this.hiddenMask.fill(0, 0, numRows);
    }
    if (this.hiddenGroups.size > 0) {
      for (let i = 0; i < numRows; i++) {
        if (this.hiddenGroups.has(this.groupByStr[i])) {
          this.hiddenMask[i] = 1;
        }
      }
    }

    // ── Phase 4: Build per-group, per-color row indices ──
    const vp = this.viewportBounds;
    const grouped = new Map<string, Map<number, number[]>>();

    for (let i = 0; i < numRows; i++) {
      // Viewport culling
      if (vp) {
        const ovr = this.dirtyOverrides.get(i);
        const ax = ovr ? ovr.x : this.xArr[i];
        const ay = ovr ? ovr.y : this.yArr[i];
        const aw = ovr ? ovr.w : this.wArr[i];
        const ah = ovr ? ovr.h : this.hArr[i];
        if (
          ax + aw < vp.x ||
          ax > vp.x + vp.width ||
          ay + ah < vp.y ||
          ay > vp.y + vp.height
        ) {
          continue;
        }
      }

      // All lookups are pre-cached string[] — zero allocation in this loop
      const groupVal = this.groupByStr[i];
      const groupColor = this.groupColors.get(groupVal);
      const color = groupColor ?? this.colorFn(this.statusStr[i]);

      let colorMap = grouped.get(groupVal);
      if (!colorMap) {
        colorMap = new Map();
        grouped.set(groupVal, colorMap);
      }
      let rows = colorMap.get(color);
      if (!rows) {
        rows = [];
        colorMap.set(color, rows);
      }
      rows.push(i);
    }

    // ── Phase 5: Reconcile Pixi containers ──
    const activeGroups = new Set(grouped.keys());

    // Remove stale containers
    for (const [name, c] of this.groupContainers) {
      if (!activeGroups.has(name)) {
        c.destroy({ children: true });
        this.groupContainers.delete(name);
      }
    }

    // Create/update containers per group
    for (const [groupName, colorMap] of grouped) {
      let gc = this.groupContainers.get(groupName);
      if (!gc) {
        gc = new Container();
        gc.label = `group:${groupName}`;
        this.groupContainers.set(groupName, gc);
        const insertIdx = Math.max(0, this.container.children.length - 2);
        this.container.addChildAt(gc, insertIdx);
      }

      // Pixi-native visibility — no row iteration needed
      gc.visible = !this.hiddenGroups.has(groupName);

      // Clear old Graphics from this container
      for (const child of [...gc.children]) {
        child.destroy();
      }
      gc.removeChildren();

      // Create Graphics per color within the group container
      for (const [color, rows] of colorMap) {
        const g = new Graphics();
        for (const i of rows) {
          this.drawAnnotation(g, i);
        }
        g.fill({ color, alpha: this.style.fillAlpha });
        g.stroke({
          color,
          width: this.style.strokeWidth,
          alpha: this.style.strokeAlpha,
        });
        gc.addChild(g);
      }
    }

    this.highlightGraphics.clear();
    this.app.render();
  }

  /** Draw a single annotation shape into a Graphics object */
  private drawAnnotation(g: Graphics, i: number): void {
    const override = this.dirtyOverrides.get(i);
    if (override) {
      g.poly(override.polygon, true);
    } else {
      const poly = this.getPolygonSlice(i);
      if (poly && poly.length >= 6) {
        g.poly(poly, true);
      } else {
        g.rect(this.xArr[i], this.yArr[i], this.wArr[i], this.hArr[i]);
      }
    }
  }

  /** Get geometry for a single annotation — checks dirty overlay first */
  getGeometry(index: number): {
    x: number;
    y: number;
    w: number;
    h: number;
    polygon: number[] | null;
  } {
    const override = this.dirtyOverrides.get(index);
    if (override) {
      return {
        x: override.x,
        y: override.y,
        w: override.w,
        h: override.h,
        polygon: override.polygon,
      };
    }
    return {
      x: this.xArr[index],
      y: this.yArr[index],
      w: this.wArr[index],
      h: this.hArr[index],
      polygon: this.getPolygonSlice(index),
    };
  }

  /** Light hover highlight (before clicking) */
  hover(index: number | null): void {
    this.hoverGraphics.clear();
    if (index === null || !this.table) return;

    const geo = this.getGeometry(index);
    if (geo.polygon && geo.polygon.length >= 6) {
      this.hoverGraphics.poly(geo.polygon, true);
    } else {
      this.hoverGraphics.rect(geo.x, geo.y, geo.w, geo.h);
    }
    this.hoverGraphics.fill({ color: 0x3b82f6, alpha: 0.05 });
    this.hoverGraphics.stroke({ color: 0x3b82f6, width: 1, alpha: 0.6 });
    this.app.render();
  }

  /** Selection highlight */
  highlight(index: number | null): void {
    this.highlightGraphics.clear();
    if (index === null || !this.table) return;

    const geo = this.getGeometry(index);
    if (geo.polygon && geo.polygon.length >= 6) {
      this.highlightGraphics.poly(geo.polygon, true);
    } else {
      this.highlightGraphics.rect(geo.x, geo.y, geo.w, geo.h);
    }
    this.highlightGraphics.fill({ color: 0x3b82f6, alpha: 0.06 });
    this.highlightGraphics.stroke({ color: 0x3b82f6, width: 1.5 });
    this.app.render();
  }

  /** Smallest visible annotation at point (used for hover + normal click) */
  getAnnotationAtPoint(x: number, y: number): number | null {
    const hits = this.getAllAnnotationsAtPoint(x, y);
    return hits.length > 0 ? hits[0] : null;
  }

  /** All visible annotations at point, sorted by area ascending (smallest first) */
  getAllAnnotationsAtPoint(x: number, y: number): number[] {
    if (!this.table) return [];

    const hits: { index: number; area: number }[] = [];

    for (let i = 0; i < this.numRows; i++) {
      if (this.hiddenMask[i]) continue;

      const override = this.dirtyOverrides.get(i);
      const ax = override ? override.x : this.xArr[i];
      const ay = override ? override.y : this.yArr[i];
      const aw = override ? override.w : this.wArr[i];
      const ah = override ? override.h : this.hArr[i];

      if (
        x >= ax &&
        x <= ax + aw &&
        y >= ay &&
        y <= ay + ah
      ) {
        const poly = override?.polygon ?? this.getPolygonSlice(i);
        if (poly && poly.length >= 6 && !isAxisAlignedRect(poly)) {
          if (!pointInPolygon(x, y, poly)) continue;
        }

        hits.push({ index: i, area: aw * ah });
      }
    }

    hits.sort((a, b) => a.area - b.area);
    return hits.map((h) => h.index);
  }

  destroy(): void {
    for (const [, c] of this.groupContainers) {
      c.destroy({ children: true });
    }
    this.groupContainers.clear();
    this.hoverGraphics.destroy();
    this.highlightGraphics.destroy();
    this.container.destroy({ children: true });
  }

  /** Get polygon vertices for row i as a plain number array */
  getPolygonSlice(i: number): number[] | null {
    if (!this.polygonCol) return null;
    const val = this.polygonCol.get(i);
    if (!val || val.length === 0) return null;
    const arr = new Array(val.length);
    for (let j = 0; j < val.length; j++) {
      arr[j] = val.get(j);
    }
    return arr;
  }
}

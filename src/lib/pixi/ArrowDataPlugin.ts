import { Application, Container, Graphics } from "pixi.js";
import type { Table } from "apache-arrow";
import { STATUS_COLORS, statusColor } from "$lib/utils/color.js";
import type { ViewportBounds } from "./types.js";

export class ArrowDataPlugin {
  private app: Application;
  private container: Container;
  private table: Table | null = null;
  private dirty = false;

  // Batch rendering: one Graphics per status color (5 draw calls, not N)
  private batchGraphics = new Map<number, Graphics>();

  // Highlight layers
  private highlightGraphics: Graphics;
  private hoverGraphics: Graphics;

  // Cached geometry columns (zero-copy Float32Array views)
  private xArr: Float32Array = new Float32Array(0);
  private yArr: Float32Array = new Float32Array(0);
  private wArr: Float32Array = new Float32Array(0);
  private hArr: Float32Array = new Float32Array(0);

  // Cached polygon column for .get(i) access
  private polygonCol: import("apache-arrow").Vector | null = null;

  // Viewport culling
  private viewportBounds: ViewportBounds | null = null;

  constructor(app: Application) {
    this.app = app;
    this.container = new Container();
    this.container.label = "annotations";
    this.container.cullable = true;
    app.stage.addChild(this.container);

    for (const color of Object.values(STATUS_COLORS)) {
      const g = new Graphics();
      this.batchGraphics.set(color, g);
      this.container.addChild(g);
    }

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

  /** Update viewport bounds for culling */
  setViewport(bounds: ViewportBounds): void {
    this.viewportBounds = bounds;
  }

  sync(): void {
    if (!this.table || !this.dirty) return;
    this.dirty = false;

    const table = this.table;
    const numRows = table.numRows;

    // Cache zero-copy Float32Array views
    this.xArr = table.getChild("x")!.toArray() as Float32Array;
    this.yArr = table.getChild("y")!.toArray() as Float32Array;
    this.wArr = table.getChild("width")!.toArray() as Float32Array;
    this.hArr = table.getChild("height")!.toArray() as Float32Array;

    // Cache polygon column reference for .get(i) access
    this.polygonCol = table.getChild("polygon") ?? null;

    // Pre-batch: convert status column once, group by color
    const statusArr = table.getChild("status")?.toArray();
    const colorGroups = new Map<number, number[]>();
    for (const color of this.batchGraphics.keys()) {
      colorGroups.set(color, []);
    }

    const vp = this.viewportBounds;

    for (let i = 0; i < numRows; i++) {
      // Viewport culling: skip annotations entirely outside visible area
      if (vp) {
        const ax = this.xArr[i];
        const ay = this.yArr[i];
        const aw = this.wArr[i];
        const ah = this.hArr[i];
        if (
          ax + aw < vp.x ||
          ax > vp.x + vp.width ||
          ay + ah < vp.y ||
          ay > vp.y + vp.height
        ) {
          continue; // off-screen, skip
        }
      }

      const status = statusArr?.[i] ?? "prediction";
      const color = statusColor(String(status));
      let group = colorGroups.get(color);
      if (!group) {
        group = [];
        colorGroups.set(color, group);
      }
      group.push(i);
    }

    // Batch render
    for (const [color, g] of this.batchGraphics) {
      g.clear();
      const rows = colorGroups.get(color);
      if (!rows || rows.length === 0) continue;

      for (const i of rows) {
        const poly = this.getPolygonSlice(i);
        if (poly && poly.length >= 6) {
          g.poly(poly, true);
        } else {
          g.rect(this.xArr[i], this.yArr[i], this.wArr[i], this.hArr[i]);
        }
      }

      g.fill({ color, alpha: 0.15 });
      g.stroke({ color, width: 2 });
    }

    this.highlightGraphics.clear();
  }

  /** Get geometry for a single annotation by row index */
  getGeometry(index: number): {
    x: number;
    y: number;
    w: number;
    h: number;
    polygon: Float64Array | Float32Array | null;
  } {
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

    const poly = this.getPolygonSlice(index);
    if (poly && poly.length >= 6) {
      this.hoverGraphics.poly(poly, true);
    } else {
      this.hoverGraphics.rect(
        this.xArr[index],
        this.yArr[index],
        this.wArr[index],
        this.hArr[index],
      );
    }
    this.hoverGraphics.fill({ color: 0x3b82f6, alpha: 0.08 });
    this.hoverGraphics.stroke({ color: 0x3b82f6, width: 1.5 });
  }

  /** Strong selection highlight */
  highlight(index: number | null): void {
    this.highlightGraphics.clear();
    if (index === null || !this.table) return;

    const poly = this.getPolygonSlice(index);
    if (poly && poly.length >= 6) {
      this.highlightGraphics.poly(poly, true);
    } else {
      this.highlightGraphics.rect(
        this.xArr[index],
        this.yArr[index],
        this.wArr[index],
        this.hArr[index],
      );
    }

    this.highlightGraphics.stroke({ color: 0xffffff, width: 4 });
    this.highlightGraphics.stroke({ color: 0x000000, width: 2 });
  }

  getAnnotationAtPoint(x: number, y: number): number | null {
    if (!this.table) return null;

    for (let i = this.table.numRows - 1; i >= 0; i--) {
      if (
        x >= this.xArr[i] &&
        x <= this.xArr[i] + this.wArr[i] &&
        y >= this.yArr[i] &&
        y <= this.yArr[i] + this.hArr[i]
      ) {
        return i;
      }
    }
    return null;
  }

  destroy(): void {
    for (const g of this.batchGraphics.values()) {
      g.destroy();
    }
    this.batchGraphics.clear();
    this.hoverGraphics.destroy();
    this.highlightGraphics.destroy();
    this.container.destroy({ children: true });
  }

  /** Get polygon vertices for row i as a plain number array */
  getPolygonSlice(i: number): number[] | null {
    if (!this.polygonCol) return null;
    const val = this.polygonCol.get(i);
    if (!val || val.length === 0) return null;
    // Arrow Vector doesn't support bracket indexing — convert to plain array
    const arr = new Array(val.length);
    for (let j = 0; j < val.length; j++) {
      arr[j] = val.get(j);
    }
    return arr;
  }
}

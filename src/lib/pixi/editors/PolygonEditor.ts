import { Graphics } from "pixi.js";
import {
  boundsFromPolygon,
  distance,
  pointInPolygon,
} from "../interaction/geometry.js";
import {
  type Editor,
  type GeometryUpdate,
  HANDLE_FILL,
  type HandleId,
  HIT_THRESHOLD_PX,
  type InteractionContext,
  MIDPOINT_FILL,
  MIDPOINT_STROKE,
  STROKE_COLOR,
  VERTEX_SIZE_PX,
} from "../interaction/types.js";

const MIDPOINT_SIZE_PX = 2;
const MIN_VERTICES = 3;

export class PolygonEditor implements Editor {
  private ctx: InteractionContext;
  private handles: Graphics;
  private _attached = false;
  private _dragging = false;
  private index = -1;
  private points: number[] = [];

  // Drag state — typed, not stringly
  private dragTarget: HandleId | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private origPoints: number[] = [];

  onChange?: (index: number, updates: GeometryUpdate) => void;

  constructor(ctx: InteractionContext) {
    this.ctx = ctx;
    this.handles = new Graphics();
    this.handles.label = "polygon-editor-handles";
    ctx.app.stage.addChild(this.handles);
  }

  attach(
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    polygon: ArrayLike<number> | null,
  ): void {
    this.index = index;
    this.points = polygon
      ? Array.from(polygon)
      : [x, y, x + w, y, x + w, y + h, x, y + h];
    this._attached = true;
    this.renderHandles();
  }

  detach(): void {
    this._attached = false;
    this._dragging = false;
    this.dragTarget = null;
    this.handles.clear();
  }

  isAttached(): boolean {
    return this._attached;
  }

  hitTestHandle(x: number, y: number): HandleId | null {
    if (!this._attached) return null;

    const threshold = HIT_THRESHOLD_PX / this.ctx.getViewportScale();

    // Test vertices first
    const n = this.points.length / 2;
    for (let i = 0; i < n; i++) {
      if (
        distance(x, y, this.points[i * 2], this.points[i * 2 + 1]) < threshold
      ) {
        this.ctx.setCursor("move");
        return { type: "vertex", index: i };
      }
    }

    // Test midpoints
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mx = (this.points[i * 2] + this.points[j * 2]) / 2;
      const my = (this.points[i * 2 + 1] + this.points[j * 2 + 1]) / 2;
      if (distance(x, y, mx, my) < threshold) {
        this.ctx.setCursor("copy");
        return { type: "midpoint", fromIndex: i, toIndex: j };
      }
    }

    // Test body
    if (pointInPolygon(x, y, this.points)) {
      this.ctx.setCursor("move");
      return { type: "body" };
    }

    return null;
  }

  startDrag(handle: HandleId, x: number, y: number): void {
    this.dragStartX = x;
    this.dragStartY = y;
    this.origPoints = [...this.points];
    this._dragging = true;

    if (handle.type === "midpoint") {
      // Insert a new vertex at the midpoint, then drag it
      const mx =
        (this.points[handle.fromIndex * 2] + this.points[handle.toIndex * 2]) /
        2;
      const my = (this.points[handle.fromIndex * 2 + 1] +
        this.points[handle.toIndex * 2 + 1]) / 2;
      const insertAt = (handle.fromIndex + 1) * 2;
      this.points.splice(insertAt, 0, mx, my);
      this.origPoints = [...this.points];
      this.dragTarget = { type: "vertex", index: handle.fromIndex + 1 };
    } else {
      this.dragTarget = handle;
    }
  }

  drag(x: number, y: number): void {
    if (!this._dragging || !this.dragTarget) return;

    const dx = x - this.dragStartX;
    const dy = y - this.dragStartY;

    if (this.dragTarget.type === "body") {
      for (let i = 0; i < this.points.length; i += 2) {
        this.points[i] = this.origPoints[i] + dx;
        this.points[i + 1] = this.origPoints[i + 1] + dy;
      }
    } else if (this.dragTarget.type === "vertex") {
      const vi = this.dragTarget.index * 2;
      this.points[vi] = this.origPoints[vi] + dx;
      this.points[vi + 1] = this.origPoints[vi + 1] + dy;
    }

    this.renderHandles();
    // Visual update only — Arrow table updated on endDrag via getGeometry()
  }

  endDrag(): void {
    this._dragging = false;
    this.dragTarget = null;
    this.ctx.setCursor("grab");
  }

  isDragging(): boolean {
    return this._dragging;
  }

  getGeometry(): GeometryUpdate | null {
    if (!this._attached) return null;
    const bounds = boundsFromPolygon(this.points);
    return {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      polygon: [...this.points],
    };
  }

  deleteVertex(vertexIdx: number): boolean {
    if (this.points.length / 2 <= MIN_VERTICES) return false;
    this.points.splice(vertexIdx * 2, 2);
    this.renderHandles();
    return true;
  }

  renderHandles(): void {
    if (!this._attached) return;

    this.handles.clear();
    const scale = this.ctx.getViewportScale();
    const vr = VERTEX_SIZE_PX / scale;
    const mr = MIDPOINT_SIZE_PX / scale;
    const strokeW = 1.5 / scale;

    // Polygon outline
    this.handles.poly(this.points, true);
    this.handles.stroke({ color: STROKE_COLOR, width: 2 / scale });

    const n = this.points.length / 2;

    // Midpoint handles
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mx = (this.points[i * 2] + this.points[j * 2]) / 2;
      const my = (this.points[i * 2 + 1] + this.points[j * 2 + 1]) / 2;
      this.handles.circle(mx, my, mr);
      this.handles.fill({ color: MIDPOINT_FILL });
      this.handles.stroke({ color: MIDPOINT_STROKE, width: strokeW });
    }

    // Vertex handles
    for (let i = 0; i < n; i++) {
      this.handles.circle(this.points[i * 2], this.points[i * 2 + 1], vr);
      this.handles.fill({ color: HANDLE_FILL });
      this.handles.stroke({ color: STROKE_COLOR, width: strokeW });
    }
  }

  destroy(): void {
    this.handles.destroy();
  }

  private emitChange(): void {
    const bounds = boundsFromPolygon(this.points);
    this.onChange?.(this.index, {
      x: bounds.x,
      y: bounds.y,
      w: bounds.w,
      h: bounds.h,
      polygon: [...this.points],
    });
  }
}

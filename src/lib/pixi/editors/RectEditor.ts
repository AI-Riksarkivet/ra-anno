import { Graphics } from "pixi.js";
import {
  handleCursor,
  type HandlePosition,
  hitTestHandles,
  rectHandles,
  resizeByHandle,
} from "../interaction/geometry.js";
import {
  type Editor,
  type GeometryUpdate,
  HANDLE_FILL,
  HANDLE_SIZE_PX,
  type HandleId,
  HIT_THRESHOLD_PX,
  type InteractionContext,
  STROKE_COLOR,
} from "../interaction/types.js";

export class RectEditor implements Editor {
  private ctx: InteractionContext;
  private handles: Graphics;
  private _attached = false;
  private _dragging = false;
  private index = -1;

  private cx = 0;
  private cy = 0;
  private cw = 0;
  private ch = 0;

  private dragHandle: HandlePosition = "body";
  private dragStartX = 0;
  private dragStartY = 0;
  private origX = 0;
  private origY = 0;
  private origW = 0;
  private origH = 0;

  onChange?: (index: number, updates: GeometryUpdate) => void;

  constructor(ctx: InteractionContext) {
    this.ctx = ctx;
    this.handles = new Graphics();
    this.handles.label = "rect-editor-handles";
    ctx.app.stage.addChild(this.handles);
  }

  attach(
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    _polygon: ArrayLike<number> | null,
  ): void {
    this.index = index;
    this.cx = x;
    this.cy = y;
    this.cw = w;
    this.ch = h;
    this._attached = true;
    this.renderHandles();
  }

  detach(): void {
    this._attached = false;
    this._dragging = false;
    this.handles.clear();
  }

  isAttached(): boolean {
    return this._attached;
  }

  hitTestHandle(x: number, y: number): HandleId | null {
    if (!this._attached) return null;

    const threshold = HIT_THRESHOLD_PX / this.ctx.getViewportScale();
    const hList = rectHandles(this.cx, this.cy, this.cw, this.ch);
    const hit = hitTestHandles(x, y, hList, threshold);

    if (hit) {
      this.ctx.setCursor(handleCursor(hit));
      return { type: "rect", position: hit };
    }

    if (
      x >= this.cx && x <= this.cx + this.cw &&
      y >= this.cy && y <= this.cy + this.ch
    ) {
      this.ctx.setCursor("move");
      return { type: "body" };
    }

    return null;
  }

  startDrag(handle: HandleId, x: number, y: number): void {
    this.dragHandle = handle.type === "rect" ? handle.position : "body";
    this.dragStartX = x;
    this.dragStartY = y;
    this.origX = this.cx;
    this.origY = this.cy;
    this.origW = this.cw;
    this.origH = this.ch;
    this._dragging = true;
  }

  drag(x: number, y: number): void {
    if (!this._dragging) return;

    const dx = x - this.dragStartX;
    const dy = y - this.dragStartY;
    const { shift } = this.ctx.getModifiers();

    const r = resizeByHandle(
      this.origX,
      this.origY,
      this.origW,
      this.origH,
      this.dragHandle,
      dx,
      dy,
      shift,
    );

    this.cx = r.x;
    this.cy = r.y;
    this.cw = r.w;
    this.ch = r.h;

    this.renderHandles();
    // Visual update only — Arrow table updated on endDrag via getGeometry()
  }

  endDrag(): void {
    this._dragging = false;
    this.ctx.setCursor("grab");
  }

  isDragging(): boolean {
    return this._dragging;
  }

  getGeometry(): GeometryUpdate | null {
    if (!this._attached) return null;
    return {
      x: this.cx,
      y: this.cy,
      w: this.cw,
      h: this.ch,
      polygon: [
        this.cx,
        this.cy,
        this.cx + this.cw,
        this.cy,
        this.cx + this.cw,
        this.cy + this.ch,
        this.cx,
        this.cy + this.ch,
      ],
    };
  }

  renderHandles(): void {
    if (!this._attached) return;

    this.handles.clear();
    const scale = this.ctx.getViewportScale();
    const s = HANDLE_SIZE_PX / scale;
    const strokeW = 1.5 / scale;

    this.handles.rect(this.cx, this.cy, this.cw, this.ch);
    this.handles.stroke({ color: STROKE_COLOR, width: 2 / scale });

    const hList = rectHandles(this.cx, this.cy, this.cw, this.ch);
    for (const h of hList) {
      this.handles.rect(h.x - s / 2, h.y - s / 2, s, s);
      this.handles.fill({ color: HANDLE_FILL });
      this.handles.stroke({ color: STROKE_COLOR, width: strokeW });
    }

    this.ctx.requestRender();
  }

  destroy(): void {
    this.handles.destroy();
  }
}

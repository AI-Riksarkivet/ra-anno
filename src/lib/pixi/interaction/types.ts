import type { Application, Graphics } from "pixi.js";
import type { HandlePosition } from "./geometry.js";

// --- Shared constants ---

export const HANDLE_SIZE_PX = 4;
export const VERTEX_SIZE_PX = 3;
export const HIT_THRESHOLD_PX = 8;
export const SNAP_THRESHOLD_PX = 12;
export const STROKE_COLOR = 0x3b82f6;
export const HANDLE_FILL = 0xffffff;
export const MIDPOINT_FILL = 0xd4d4d8;
export const MIDPOINT_STROKE = 0xa1a1aa;

// --- Handle identifier (typed, not stringly) ---

export type HandleId =
  | { type: "rect"; position: HandlePosition }
  | { type: "vertex"; index: number }
  | { type: "midpoint"; fromIndex: number; toIndex: number }
  | { type: "body" };

export function handleIdToString(id: HandleId): string {
  switch (id.type) {
    case "rect":
      return id.position;
    case "vertex":
      return `v${id.index}`;
    case "midpoint":
      return `m${id.fromIndex}_${id.toIndex}`;
    case "body":
      return "body";
  }
}

// --- Shapes ---

export interface CommitShape {
  type: "rect" | "polygon";
  x: number;
  y: number;
  width: number;
  height: number;
  polygon: number[] | null;
}

export interface GeometryUpdate {
  x: number;
  y: number;
  w: number;
  h: number;
  polygon: number[] | null;
}

// --- Context ---

export interface InteractionContext {
  app: Application;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getViewportScale: () => number;
  getModifiers: () => Modifiers;
  setCursor: (cursor: string) => void;
}

export interface Modifiers {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
}

// --- Interfaces ---

export interface Tool {
  readonly name: string;
  readonly preview: Graphics;

  onPointerDown(x: number, y: number): boolean;
  onPointerMove(x: number, y: number): void;
  onPointerUp(x: number, y: number): void;
  onDoubleClick(x: number, y: number): void;
  onKeyDown(key: string): void;
  cancel(): void;
  destroy(): void;

  onCommit?: (shape: CommitShape) => void;
}

export interface Editor {
  attach(
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    polygon: ArrayLike<number> | null,
  ): void;
  detach(): void;
  isAttached(): boolean;

  hitTestHandle(x: number, y: number): HandleId | null;
  startDrag(handle: HandleId, x: number, y: number): void;
  drag(x: number, y: number): void;
  endDrag(): void;
  isDragging(): boolean;

  /** Get the current edited geometry (call after endDrag to commit) */
  getGeometry(): GeometryUpdate | null;

  renderHandles(): void;
  destroy(): void;

  onChange?: (index: number, updates: GeometryUpdate) => void;
}

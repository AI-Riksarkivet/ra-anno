/**
 * Pure geometry functions — no PixiJS, no DOM, testable with Vitest.
 */

export type HandlePosition =
  | "nw"
  | "n"
  | "ne"
  | "w"
  | "e"
  | "sw"
  | "s"
  | "se"
  | "body";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute rect from origin + cursor, applying Shift (square) and Ctrl (center) */
export function computeRect(
  ox: number,
  oy: number,
  cx: number,
  cy: number,
  shift: boolean,
  ctrl: boolean,
): Rect {
  if (ctrl) {
    // Draw from center: origin is center, cursor defines half-size
    let hw = Math.abs(cx - ox);
    let hh = Math.abs(cy - oy);
    if (shift) {
      hw = Math.max(hw, hh);
      hh = hw;
    }
    return { x: ox - hw, y: oy - hh, w: hw * 2, h: hh * 2 };
  }

  let w = Math.abs(cx - ox);
  let h = Math.abs(cy - oy);
  if (shift) {
    w = Math.max(w, h);
    h = w;
  }
  const x = cx < ox ? ox - w : ox;
  const y = cy < oy ? oy - h : oy;
  return { x, y, w, h };
}

/** Bounding box from flat polygon points [x0,y0,x1,y1,...] */
export function boundsFromPolygon(points: ArrayLike<number>): Rect {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxX = Math.max(maxX, points[i]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Check if polygon is an axis-aligned rectangle (exactly 4 points, 2 unique x, 2 unique y) */
export function isAxisAlignedRect(points: number[]): boolean {
  if (points.length !== 8) return false;
  const xs = new Set([points[0], points[2], points[4], points[6]]);
  const ys = new Set([points[1], points[3], points[5], points[7]]);
  return xs.size === 2 && ys.size === 2;
}

/** Distance between two points */
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Check if cursor is close enough to snap to target point */
export function snapToPoint(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  threshold: number,
): boolean {
  return distance(cx, cy, tx, ty) < threshold;
}

/** Point-in-polygon test (ray casting algorithm) for flat [x0,y0,x1,y1,...] */
export function pointInPolygon(
  px: number,
  py: number,
  polygon: ArrayLike<number>,
): boolean {
  const n = polygon.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2],
      yi = polygon[i * 2 + 1];
    const xj = polygon[j * 2],
      yj = polygon[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Resize a rect by dragging a named handle. Returns new geometry. */
export function resizeByHandle(
  x: number,
  y: number,
  w: number,
  h: number,
  handle: HandlePosition,
  dx: number,
  dy: number,
  shift: boolean,
): Rect {
  let nx = x,
    ny = y,
    nw = w,
    nh = h;

  switch (handle) {
    case "nw":
      nx += dx;
      ny += dy;
      nw -= dx;
      nh -= dy;
      break;
    case "n":
      ny += dy;
      nh -= dy;
      break;
    case "ne":
      ny += dy;
      nw += dx;
      nh -= dy;
      break;
    case "w":
      nx += dx;
      nw -= dx;
      break;
    case "e":
      nw += dx;
      break;
    case "sw":
      nx += dx;
      nw -= dx;
      nh += dy;
      break;
    case "s":
      nh += dy;
      break;
    case "se":
      nw += dx;
      nh += dy;
      break;
    case "body":
      nx += dx;
      ny += dy;
      break;
  }

  // Prevent negative dimensions (flip)
  if (nw < 0) {
    nx += nw;
    nw = -nw;
  }
  if (nh < 0) {
    ny += nh;
    nh = -nh;
  }

  // Shift: constrain aspect ratio
  if (shift && handle !== "body") {
    const maxDim = Math.max(nw, nh);
    nw = maxDim;
    nh = maxDim;
  }

  return { x: nx, y: ny, w: nw, h: nh };
}

/** Get the 8 handle positions for a rect */
export function rectHandles(
  x: number,
  y: number,
  w: number,
  h: number,
): { pos: HandlePosition; x: number; y: number }[] {
  return [
    { pos: "nw", x, y },
    { pos: "n", x: x + w / 2, y },
    { pos: "ne", x: x + w, y },
    { pos: "w", x, y: y + h / 2 },
    { pos: "e", x: x + w, y: y + h / 2 },
    { pos: "sw", x, y: y + h },
    { pos: "s", x: x + w / 2, y: y + h },
    { pos: "se", x: x + w, y: y + h },
  ];
}

/** CSS cursor for each handle position */
export function handleCursor(handle: HandlePosition): string {
  const cursors: Record<HandlePosition, string> = {
    nw: "nwse-resize",
    n: "ns-resize",
    ne: "nesw-resize",
    w: "ew-resize",
    e: "ew-resize",
    sw: "nesw-resize",
    s: "ns-resize",
    se: "nwse-resize",
    body: "move",
  };
  return cursors[handle];
}

/** Hit test a point against handle positions. Returns handle name or null. */
export function hitTestHandles(
  px: number,
  py: number,
  handles: { pos: HandlePosition; x: number; y: number }[],
  threshold: number,
): HandlePosition | null {
  for (const h of handles) {
    if (distance(px, py, h.x, h.y) < threshold) {
      return h.pos;
    }
  }
  return null;
}

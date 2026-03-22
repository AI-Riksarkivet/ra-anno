# RA Platform — Annotation Editing Refactor Plan

**Goal**: Replace the current monolithic `AnnotationPlugin` with a
well-separated, extensible drawing and editing system inspired by Annotorious's
architecture, adapted for our PixiJS v8 + Arrow stack.

---

## Why build our own instead of using Annotorious

Annotorious is a mature annotation library. We studied its architecture
(Rubberband/Editor separation, StoreObserver, modifier keys, bezier handles) and
adopted the patterns that transfer. But we can't build on top of it because our
stack is fundamentally different:

| Concern            | Annotorious                               | Our stack                                        | Why it matters                                                                                                                                 |
| ------------------ | ----------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rendering**      | SVG overlay on `<img>` or OpenSeadragon   | PixiJS v8 WebGPU                                 | SVG can't batch 5000 annotations — each is a DOM element. PixiJS renders all same-color shapes in 1 GPU draw call                              |
| **Data format**    | JSON objects (W3C Annotation model)       | Apache Arrow IPC (columnar Float32Array)         | We read geometry columns as zero-copy typed array views. Annotorious allocates a JS object per annotation                                      |
| **Data transport** | REST JSON or in-memory                    | Streaming Arrow IPC over HTTP                    | We parse Arrow RecordBatches incrementally — annotations appear as bytes arrive. Annotorious loads all JSON at once                            |
| **Storage**        | Backend-agnostic (user provides adapter)  | LanceDB on S3 via Flight SQL                     | Our API routes stream Arrow IPC from Flight SQL. No JSON serialization layer                                                                   |
| **Scale**          | Hundreds of annotations                   | Hundreds of millions (across pages)              | Annotorious was designed for single-image use. We need viewport culling, batch rendering, and columnar access for pages with 5000+ annotations |
| **Hit testing**    | SVG native (browser does it)              | Manual against cached Float32Array               | We hit-test against the same cached column arrays used for rendering — no separate data structure                                              |
| **Undo/redo**      | JSON diff (ChangeSet with old/new values) | Arrow Table snapshots ($state.raw)               | Arrow Tables are immutable — each undo state is a reference to an existing Table (~5KB). No diff computation needed                            |
| **Reactivity**     | nanostores (Svelte 4 compatible)          | Svelte 5 $state.raw classes                      | Our store triggers $derived → $effect → PixiJS sync automatically. No manual subscribe/unsubscribe                                             |
| **Image loading**  | `<img>` element or OpenSeadragon tiles    | PixiJS Texture from HTMLImageElement             | Images are binary columns in Lance. We fetch via API route, load as texture. Annotorious expects a DOM image                                   |
| **Viewport**       | CSS transform or OpenSeadragon            | PixiJS stage with isRenderGroup (GPU transforms) | Zoom/pan is a GPU matrix multiply, not CSS recalculation                                                                                       |

**The core incompatibility**: Annotorious's rendering layer is SVG. Every
annotation is a `<g>` element with `<rect>`/`<polygon>`/`<ellipse>` children. At
100 annotations this is fine. At 5000 it's unusable — the DOM has 15000+ SVG
elements. Our PixiJS batch renderer draws 5000 annotations in 5 GPU draw calls
using Float32Array column data directly.

**What we took from Annotorious** (design patterns, not code):

- Rubberband → Editor separation (clean state machine lifecycle)
- Modifier key handling (Shift=constrain, Ctrl=center, recalc on keydown)
- Named handles for shape editing ("nw", "se", "vertex-0", "midpoint-0-1")
- Snap-to-close for polygon closing
- StoreObserver concept (we use $effect instead)
- Selection lifecycle tracking (initial state on select, compare on deselect)

**What we do differently** (because of our stack):

- Batch all same-status shapes into 1 Graphics (Rerun-inspired columnar
  rendering)
- Zero-copy Float32Array column access from Arrow Tables
- Streaming fetch with incremental Arrow IPC parsing
- Viewport culling against cached geometry arrays
- Polygon data via Arrow list column valueOffsets/subarray (no .get(i))
- $state.raw for immutable Arrow Table snapshots (no deep proxy overhead)
- WebGPU-accelerated viewport transforms via isRenderGroup

**Problems with current implementation**:

1. `AnnotationPlugin` is a god class — handles drawing, selection, hit testing,
   preview, modifier keys, and state machine all in one 237-line file
2. No resize handles on selected annotations — users can't edit after drawing
3. No modifier keys (Shift=square, Ctrl=center) during drawing
4. No snap-to-close for polygon tool
5. Polygon vertices can't be edited after commit
6. No visual distinction between "drawing preview" and "editing handles"
7. Drawing tool and selection tool fight over the same event stream

---

## Design principles

**Separation of concerns**: Drawing a new shape (RubberbandTool) is separate
from editing an existing shape (ShapeEditor). These are different state machines
with different lifecycles.

**Tool registry**: Tools are registered by name, not hardcoded. Adding a new
shape type (ellipse, line, freehand) means adding one class, not modifying
existing ones.

**Pure geometry functions**: All coordinate math (constrain aspect, draw from
center, point-in-polygon, handle hit testing) lives in pure functions — testable
without PixiJS or DOM.

**Arrow-native**: Shape data stays as Arrow column values (`x`, `y`, `width`,
`height`, `polygon`). No intermediate "Annotation" objects. The editor reads
from and writes to the same columnar format the renderer uses.

**Minimal Graphics objects**: The batch renderer (`ArrowDataPlugin`) handles all
committed annotations. Drawing tools and editors only manage their own temporary
Graphics — preview shapes and handles. No per-annotation Graphics objects.

---

## Architecture

### Current (monolithic)

```
AnnotationPlugin.ts       ← 1 class does everything
  state: idle | drawing-rect | drawing-polygon
  handles: selection, drawing, preview, events
```

### Proposed (separated)

```
src/lib/pixi/
  interaction/
    InteractionManager.ts      ← routes events to active tool/editor
    geometry.ts                ← pure math: constrain, bounds, point-in-poly
    types.ts                   ← shared types for tools/editors

  tools/
    Tool.ts                    ← interface: onPointerDown/Move/Up, preview Graphics
    RectTool.ts                ← draws rectangles (Shift=square, Ctrl=center)
    PolygonTool.ts             ← draws polygons (snap-to-close, vertex preview)
    ToolRegistry.ts            ← register/get tools by name

  editors/
    Editor.ts                  ← interface: attach(index), detach(), handles
    RectEditor.ts              ← 8 handles (4 corners + 4 midpoints), resize/move
    PolygonEditor.ts           ← drag vertices, insert midpoints, delete points
    HandleRenderer.ts          ← draws handles in screen space (constant size)
```

### How it connects

```
PixiCanvas.svelte
  ├── ImagePlugin.ts              ← viewport (unchanged)
  ├── ArrowDataPlugin.ts          ← batch render + highlight (unchanged)
  └── InteractionManager.ts       ← NEW: replaces AnnotationPlugin
        ├── ToolRegistry             ← registered drawing tools
        ├── active tool              ← current RubberbandTool
        └── active editor            ← current ShapeEditor (when selected)
```

---

## Step 1: Pure geometry module

**File**: `src/lib/pixi/interaction/geometry.ts`

No PixiJS imports. No DOM. Pure functions, testable with Vitest.

```ts
// Constrain rect to square (Shift)
export function constrainAspect(
  x: number,
  y: number,
  w: number,
  h: number,
): { x: number; y: number; w: number; h: number };

// Draw rect from center (Ctrl)
export function rectFromCenter(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): { x: number; y: number; w: number; h: number };

// Combine: origin + cursor + modifiers → final rect
export function computeRect(
  origin: [number, number],
  cursor: [number, number],
  shift: boolean,
  ctrl: boolean,
): { x: number; y: number; w: number; h: number };

// Bounding box from polygon points (flat [x0,y0,x1,y1,...])
export function boundsFromPolygon(
  points: number[],
): { x: number; y: number; w: number; h: number };

// Point-in-polygon test (ray casting)
export function pointInPolygon(
  px: number,
  py: number,
  polygon: number[],
): boolean;

// Distance between two points
export function distance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number;

// Snap cursor to first point if close enough
export function snapToClose(
  cursor: [number, number],
  firstPoint: [number, number],
  threshold: number,
): { snapped: boolean; point: [number, number] };

// Resize rect by handle: given handle name + delta, return new geometry
export function resizeByHandle(
  x: number,
  y: number,
  w: number,
  h: number,
  handle: HandlePosition,
  dx: number,
  dy: number,
  shift: boolean,
): { x: number; y: number; w: number; h: number };

// Handle positions for a rect
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
```

**Why first**: Every tool and editor depends on these. Pure functions → write
tests first → build on solid foundation.

---

## Step 2: Tool interface + RectTool

**File**: `src/lib/pixi/tools/Tool.ts`

```ts
export interface ToolContext {
  app: Application;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  getModifiers: () => { shift: boolean; ctrl: boolean; alt: boolean };
}

export interface Tool {
  readonly name: string;
  readonly preview: Graphics; // owned by tool, added to stage

  onPointerDown(x: number, y: number): boolean; // true = consumed event
  onPointerMove(x: number, y: number): void;
  onPointerUp(x: number, y: number): void;
  onDoubleClick(x: number, y: number): void;
  cancel(): void;
  destroy(): void;

  // Fires when a shape is committed
  onCommit?: (shape: CommitShape) => void;
}
```

**File**: `src/lib/pixi/tools/RectTool.ts`

State machine: `idle` → `drawing` → `idle`

```
idle:
  pointerdown → set origin, transition to drawing

drawing:
  pointermove → compute rect from (origin, cursor, shift, ctrl)
                draw preview via Graphics.rect().fill().stroke()
  pointerup   → if rect > minimum size: fire onCommit, clear preview
                else: cancel (accidental click)
  escape      → cancel
```

Modifier keys (evaluated every pointermove):

- **Shift**: constrain to square (`w = h = max(w, h)`)
- **Ctrl**: draw from center (origin = center, not corner)
- **Shift+Ctrl**: square from center

Preview rendering:

```ts
this.preview.clear();
const { x, y, w, h } = computeRect(this.origin, cursor, shift, ctrl);
this.preview.rect(x, y, w, h);
this.preview.fill({ color: 0x3b82f6, alpha: 0.15 });
this.preview.stroke({ color: 0x3b82f6, width: 2 });
// Dashed stroke for preview distinction:
this.preview.stroke({ color: 0x3b82f6, width: 1, dash: [6, 4] });
```

Minimum size check: `w * h > 25` (5x5 pixel area in world coords).

---

## Step 3: PolygonTool

**File**: `src/lib/pixi/tools/PolygonTool.ts`

State machine: `idle` → `drawing` → `idle`

```
idle:
  pointerdown → add first point, transition to drawing

drawing:
  pointerdown → check snapToClose(cursor, firstPoint, threshold)
                if snapped: close polygon, fire onCommit
                else: add point to array
  pointermove → draw preview:
                - solid lines between committed points
                - dashed line from last point to cursor
                - circle at each vertex
                - larger/highlighted circle at first point when closable
  dblclick    → close polygon if >= 3 points, fire onCommit
  escape      → cancel, clear preview
  backspace   → remove last point (undo last vertex)
```

Snap-to-close threshold: `12 pixels / viewport.scale` (constant screen size).

Preview rendering:

```ts
this.preview.clear();

// Committed edges (solid)
if (points.length >= 4) {
  this.preview.poly(points, false);
  this.preview.stroke({ color: 0x3b82f6, width: 2 });
}

// Preview edge to cursor (dashed)
const last = [points[points.length - 2], points[points.length - 1]];
this.preview.moveTo(last[0], last[1]);
this.preview.lineTo(cursor.x, cursor.y);
this.preview.stroke({ color: 0x3b82f6, width: 1, alpha: 0.5 });

// Vertices
for (let i = 0; i < points.length; i += 2) {
  const r = 4 / viewport.scale; // constant screen size
  this.preview.circle(points[i], points[i + 1], r);
  this.preview.fill({ color: 0x3b82f6 });
}

// First point highlight when closable
if (isClosable) {
  const r = 8 / viewport.scale;
  this.preview.circle(points[0], points[1], r);
  this.preview.fill({ color: 0x3b82f6, alpha: 0.3 });
  this.preview.stroke({ color: 0x3b82f6, width: 2 });
}
```

---

## Step 4: Editor interface + RectEditor

**File**: `src/lib/pixi/editors/Editor.ts`

```ts
export interface EditorContext {
  app: Application;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  worldToScreen: (wx: number, wy: number) => { x: number; y: number };
  getViewportScale: () => number;
  getModifiers: () => { shift: boolean; ctrl: boolean; alt: boolean };
}

export interface Editor {
  // Attach to an annotation at rowIndex, reading geometry from Arrow columns
  attach(
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    polygon: Float32Array | Float64Array | null,
  ): void;

  detach(): void;
  isAttached(): boolean;

  // Returns handle name if point is on a handle, null otherwise
  hitTestHandle(x: number, y: number): HandlePosition | null;

  // Start dragging a handle
  startDrag(handle: HandlePosition, x: number, y: number): void;
  drag(x: number, y: number): void;
  endDrag(): void;

  // Render handles (called after viewport change)
  renderHandles(): void;

  destroy(): void;

  // Fires when geometry changes
  onChange?: (
    index: number,
    updates: {
      x: number;
      y: number;
      w: number;
      h: number;
      polygon: number[] | null;
    },
  ) => void;
}
```

**File**: `src/lib/pixi/editors/RectEditor.ts`

8 handles around the selected rectangle:

```
nw -------- n -------- ne
|                       |
w         body          e
|                       |
sw -------- s -------- se
```

Handle rendering (constant screen size, above annotations):

```ts
const handleSize = 8; // pixels, constant regardless of zoom
const s = handleSize / viewportScale;

// Corner handles (filled squares)
for (const [hx, hy] of corners) {
  this.handles.rect(hx - s / 2, hy - s / 2, s, s);
  this.handles.fill({ color: 0xffffff });
  this.handles.stroke({ color: 0x3b82f6, width: 1.5 / viewportScale });
}

// Midpoint handles (filled circles)
for (const [hx, hy] of midpoints) {
  this.handles.circle(hx, hy, s / 2);
  this.handles.fill({ color: 0xffffff });
  this.handles.stroke({ color: 0x3b82f6, width: 1.5 / viewportScale });
}
```

Drag logic:

```ts
drag(x: number, y: number): void {
  const dx = x - this.dragStart.x;
  const dy = y - this.dragStart.y;
  const shift = this.ctx.getModifiers().shift;

  const { x: nx, y: ny, w: nw, h: nh } = resizeByHandle(
    this.origX, this.origY, this.origW, this.origH,
    this.dragHandle, dx, dy, shift
  );

  this.currentX = nx;
  this.currentY = ny;
  this.currentW = nw;
  this.currentH = nh;

  this.renderHandles();
  this.onChange?.(this.index, { x: nx, y: ny, w: nw, h: nh, polygon: null });
}
```

Cursor changes:

```
nw, se → nwse-resize
ne, sw → nesw-resize
n, s   → ns-resize
e, w   → ew-resize
body   → move
```

---

## Step 5: PolygonEditor

**File**: `src/lib/pixi/editors/PolygonEditor.ts`

Vertex handles on each polygon point:

```ts
attach(index, x, y, w, h, polygon):
  - Store polygon points
  - Create handle for each vertex
  - Create midpoint handles between vertices (for insertion)

hitTestHandle(x, y):
  - Check vertex handles first (they're on top)
  - Then midpoint handles
  - Then body (point-in-polygon test)
  - Return: "vertex-0", "vertex-1", "midpoint-0-1", "body", null

drag(x, y):
  if dragging vertex:
    - Move that vertex, recalculate bounds
  if dragging body:
    - Move all vertices by delta
  if dragging midpoint:
    - Insert new vertex at that position
    - Switch drag target to the new vertex

renderHandles():
  - Circle at each vertex (filled white, blue stroke)
  - Smaller circle at each midpoint (gray, only visible on hover)
  - Highlight selected vertices
```

Keyboard actions while polygon is selected:

- **Delete/Backspace** → remove selected vertex (if > 3 remain)
- **Tab** → select next vertex

---

## Step 6: InteractionManager

**File**: `src/lib/pixi/interaction/InteractionManager.ts`

Replaces `AnnotationPlugin`. Routes pointer events to the active tool or editor.

```ts
export class InteractionManager {
  private tools = new Map<string, Tool>();
  private activeTool: Tool | null = null;
  private activeEditor: Editor | null = null;
  private arrowPlugin: ArrowDataPlugin;

  // Modifier key state (updated via keydown/keyup on document)
  private modifiers = { shift: false, ctrl: false, alt: false };

  constructor(app, arrowPlugin) { ... }

  registerTool(tool: Tool): void;
  setActiveTool(name: string): void;
  getActiveTool(): string;

  // Selection management
  select(index: number | null): void;
  getSelectedIndex(): number | null;

  // Callbacks
  onCommit?: (shape: CommitShape) => void;
  onSelect?: (index: number | null) => void;
  onChange?: (index: number, updates: Record<string, unknown>) => void;
}
```

Event routing logic:

```
pointerdown:
  1. If editor is active, check editor handle hit test
     → if hit: start editor drag, consume event
  2. If tool is "select":
     → hit test via arrowPlugin.getAnnotationAtPoint()
     → if hit: select annotation, attach editor
     → if miss: deselect, detach editor
  3. If tool is drawing tool:
     → delegate to activeTool.onPointerDown()

pointermove:
  1. If editor is dragging → editor.drag()
  2. If tool is drawing → tool.onPointerMove()
  3. If idle → update cursor based on hover

pointerup:
  1. If editor is dragging → editor.endDrag()
  2. If tool is drawing → tool.onPointerUp()

keydown/keyup:
  1. Update modifiers (shift, ctrl, alt)
  2. If drawing, recalculate preview with new modifiers
```

---

## Step 7: Wire to PixiCanvas and editor page

**PixiCanvas.svelte** changes:

- Replace `new AnnotationPlugin(app, arrowPlugin)` with
  `new InteractionManager(app, arrowPlugin)`
- Register tools: `manager.registerTool(new RectTool(ctx))`
- Register tools: `manager.registerTool(new PolygonTool(ctx))`

**Editor page** changes:

- `ctx.plugins.annotation` → `ctx.plugins.interaction`
- `onCommit` remains the same interface
- New: `onChange` callback for editor handle drags → `updateLocal()`

---

## Step 8: Handle rendering in screen space

Handles must be constant size regardless of zoom. Since the stage is scaled by
the viewport transform, handle sizes need to be divided by the scale:

```ts
const s = HANDLE_SIZE / this.ctx.getViewportScale();
```

Handles re-render on:

- Viewport change (zoom/pan) → size adjustment
- Drag in progress → position update
- Selection change → show/hide

Use a separate Container for handles, added to the stage AFTER the annotation
container, so handles are always on top.

---

## Step 9: Arrow store integration

When an editor fires `onChange`, the editor page calls:

```ts
manager.onChange = (index, { x, y, w, h, polygon }) => {
  annotationStore.updateLocal(pageId, index, {
    x,
    y,
    width: w,
    height: h,
    polygon,
  });
};
```

This triggers: `$state.raw` update → `$derived` table → `$effect` → `sync()`.

**Debounce consideration**: During a drag, `onChange` fires every pointermove
(~60fps). Each call rebuilds the Arrow table. For 50 annotations this is fine
(~1ms). For 5000+, debounce `updateLocal` to every 3rd frame during drags.

---

## File changes summary

### New files

```
src/lib/pixi/interaction/
  InteractionManager.ts         ← event router, replaces AnnotationPlugin
  geometry.ts                   ← pure math functions
  types.ts                      ← shared types (HandlePosition, CommitShape)

src/lib/pixi/tools/
  Tool.ts                       ← interface
  RectTool.ts                   ← rect drawing with Shift/Ctrl
  PolygonTool.ts                ← polygon with snap-to-close
  ToolRegistry.ts               ← register/lookup by name

src/lib/pixi/editors/
  Editor.ts                     ← interface
  RectEditor.ts                 ← 8-handle resize/move
  PolygonEditor.ts              ← vertex drag/insert/delete
  HandleRenderer.ts             ← screen-space handle drawing
```

### Modified files

```
src/lib/pixi/PixiCanvas.svelte  ← swap AnnotationPlugin → InteractionManager
src/lib/pixi/types.ts           ← add Tool type from interaction/types.ts
src/lib/pixi/index.ts           ← export InteractionManager
src/routes/(app)/datasets/[...]/+page.svelte  ← wire onChange callback
```

### Deleted files

```
src/lib/pixi/AnnotationPlugin.ts  ← replaced by interaction/ + tools/ + editors/
```

---

## Implementation order

```
Step 1: geometry.ts + tests          ← foundation, no PixiJS needed
Step 2: Tool interface + RectTool    ← drawing with modifiers
Step 3: PolygonTool                  ← snap-to-close, vertex preview
Step 4: Editor interface + RectEditor  ← resize handles
Step 5: PolygonEditor                ← vertex editing
Step 6: InteractionManager          ← event routing, replaces AnnotationPlugin
Step 7: Wire to PixiCanvas + page    ← integration
Step 8: Handle rendering polish      ← screen-space sizing, cursors
Step 9: Arrow store integration      ← onChange → updateLocal flow
```

Steps 1-3 (tools) and 4-5 (editors) can be developed in parallel. Step 6
integrates both. Steps 7-9 wire to the app.

---

## Extensibility

Adding a new shape type (e.g. ellipse):

1. Create `EllipseTool.ts` implementing `Tool` interface
2. Create `EllipseEditor.ts` implementing `Editor` interface
3. Add geometry functions to `geometry.ts` (ellipse bounds, hit test)
4. Register: `manager.registerTool(new EllipseTool(ctx))`

No changes to InteractionManager, ArrowDataPlugin, or AnnotationStore. The tool
produces a `CommitShape` with polygon approximation of the ellipse. The editor
reads polygon column and renders handles appropriately.

---

## Performance considerations

- **Drawing preview**: Single Graphics object per tool, cleared and redrawn on
  every pointermove. At 60fps this is fine — Graphics with < 20 shapes is
  trivial for the GPU.

- **Editor handles**: Single Graphics object for all handles. Redrawn on
  viewport change. Handles are in world coordinates but sized in screen pixels
  (divide by scale).

- **onChange during drag**: Each pointermove updates the Arrow table. The
  `$effect` → `sync()` pipeline rebuilds batch Graphics. At 50 annotations and
  60fps, this is ~1ms per frame — imperceptible. At 5000+ annotations, consider
  only syncing every 3rd frame during active drags, or updating the highlight
  only (skip full batch rebuild) and doing a full sync on endDrag.

- **No per-annotation Graphics**: The batch renderer handles all committed
  shapes. Tools and editors only manage their own preview/handle Graphics. Total
  Graphics objects on stage: batch (5) + highlight (1) + preview (1) + handles
  (1) = 8. This is constant regardless of annotation count.

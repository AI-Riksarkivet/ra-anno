# RA Platform — Frontend Implementation Plan

**Companion to**: Architecture v0.8 **Scope**: Browser application — view, then
edit **Stack**: Svelte 5 / SvelteKit 2 / PixiJS v8.17+ / Apache Arrow TS / Deno
(runtime)

---

## Build Philosophy

**View before edit.** Get data on screen first. Every subsequent step builds on
a working visual foundation. No blind data plumbing.

**One new concept per step.** Each step introduces exactly one integration
point. If something breaks, you know what caused it.

**Mock data until real data.** Don't wait for Flight SQL server or vLLM to be
running. Use static Arrow IPC files and local images to develop the frontend.
Swap in real backends later without changing component code.

---

## Step 0: Project Scaffold

### What

SvelteKit 2 project with Deno, TypeScript strict, Tailwind v4, base layout.

### Files

```
ra-platform/
  src/
    routes/
      +layout.svelte          — app shell (sidebar nav, top bar)
      +page.svelte             — redirect to /datasets
      (app)/
        +layout.svelte         — app area layout
    lib/
      types/
        schemas.ts             — Arrow schema definitions (shared)
    app.css                    — Tailwind base
  static/
    mock/                      — mock data for development
  svelte.config.js
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  deno.json
```

### Key decisions

- **Deno** as runtime (your preference, SvelteKit adapter-node works with Deno)
- **Tailwind v4** for styling (you're already using this in ra-hcp)
- **TypeScript strict** — `"strict": true` in tsconfig
- **No component library yet** — start with raw HTML + Tailwind. Add
  shadcn-svelte later if needed for sidebar/toolbar components

### Acceptance criteria

- `deno task dev` starts the dev server
- `/` redirects to `/datasets`
- Layout renders with a sidebar placeholder and main content area
- No errors in console

---

## Step 1: PixiCanvas on Screen

### What

Get PixiJS v8 rendering in a Svelte 5 component. Load and display a static
image. Zoom and pan with mouse/trackpad.

### Why first

Everything else (annotations, drawing, inference) renders ON TOP of this canvas.
If this doesn't work smoothly, nothing else matters.

### Files

```
src/
  lib/
    pixi/
      PixiCanvas.svelte        — thin wrapper, owns Application lifecycle
      ImagePlugin.ts            — loads image URL → PixiJS Sprite, zoom/pan
      types.ts                  — shared PixiJS types (context shape, etc.)
  routes/
    (app)/
      test/
        +page.svelte            — test page: PixiCanvas with a static image
  static/
    mock/
      sample-page.jpg           — one document scan for testing
```

### PixiCanvas.svelte — the spec

```
Responsibilities:
  - Create PixiJS Application with WebGPU preference
  - Provide app + plugins via Svelte context
  - Resize canvas when container resizes
  - Clean up on destroy

Props:
  - width: number ($bindable)
  - height: number ($bindable)
  - children: Snippet (rendered only after app is ready)

Context shape:
  { app: Application, plugins: { image: ImagePlugin } }

Lifecycle:
  onMount:
    1. new Application()
    2. await app.init({ canvas, preference: 'webgpu', ... })
    3. Create ImagePlugin(app)
    4. Set context
    5. Return cleanup function

  cleanup:
    1. plugin.destroy()
    2. app.destroy(true, { children: true })
```

### ImagePlugin.ts — the spec

```
Responsibilities:
  - Load image from URL → PixiJS Sprite
  - Add sprite to stage as the bottom layer
  - Handle zoom (wheel event → stage.scale)
  - Handle pan (drag on stage → stage.position)
  - Fit image to viewport on initial load
  - Expose current viewport bounds (for culling later)

Constructor: (app: Application)

Methods:
  load(url: string): Promise<void>    — load image, fit to viewport
  fitToViewport(): void               — reset zoom/pan to fit image
  getViewportBounds(): Rectangle      — current visible area in image coords
  destroy(): void

State:
  - zoom: number (current scale)
  - panX, panY: number (current offset)
  - imageWidth, imageHeight: number (natural size)

Events (callbacks):
  - onViewportChange?: (bounds: Rectangle) => void
```

### Zoom/pan behavior

```
Mouse wheel:         zoom in/out, centered on cursor position
Click + drag:        pan (when no annotation tool is active)
Pinch (trackpad):    zoom in/out
Double-click:        fit to viewport / toggle zoom
```

### Acceptance criteria

- Canvas renders at full container size
- Static image loads and displays
- Wheel zoom works (smooth, centered on cursor)
- Drag pan works
- Double-click fits image to viewport
- WebGPU used if available (check console: "PixiJS renderer: webgpu")
- Falls back to WebGL gracefully
- No memory leaks on component destroy (navigate away and back)

---

## Step 2: Arrow Data → Polygons on Canvas

### What

Load annotation data from a static Arrow IPC file. Render bboxes and polygons on
top of the image. Color-code by status.

### Why second

This proves the Arrow → PixiJS pipeline works before we connect real backends.
If the rendering is right with mock data, it'll be right with real data.

### Files

```
src/
  lib/
    pixi/
      ArrowDataPlugin.ts       — Arrow Table → PixiJS Graphics
    stores/
      annotations.svelte.ts    — AnnotationStore (load from IPC, local mutations)
    types/
      schemas.ts               — ANNOTATION_SCHEMA definition
  routes/
    (app)/
      test/
        +page.svelte            — updated: PixiCanvas + image + annotations
  static/
    mock/
      sample-annotations.arrow  — static Arrow IPC file with test data
```

### Mock data generation

Create a Python script (or Node script using apache-arrow) that generates a
sample Arrow IPC file:

```
sample-annotations.arrow:
  50 rows
  Columns: id, page_id, x, y, width, height, polygon, text, label,
           confidence, source, status
  Mix of:
    - 30 with polygon (variable vertex counts: 4, 6, 8)
    - 20 with bbox only (polygon = null)
    - Status mix: 10 prediction, 15 draft, 10 reviewed, 10 accepted, 5 rejected
    - Confidence range: 0.3 to 0.99
```

### ArrowDataPlugin.ts — the spec

```
Responsibilities:
  - Accept an Arrow Table (from AnnotationStore)
  - Read float columns as Float32Array (zero-copy view)
  - Read polygon column as list<float32> per row
  - Create PixiJS Graphics objects for each annotation
  - Color-code by status:
      accepted:   0x22c55e (green)
      rejected:   0xef4444 (red)
      reviewed:   0x3b82f6 (blue)
      draft:      0xf59e0b (amber)
      prediction: 0x8b5cf6 (purple)
  - Render polygon if present, else bbox rect
  - Dirty flag: only re-render when data changes
  - Pool Graphics objects (reuse, don't create/destroy)

Constructor: (app: Application)

Methods:
  load(table: Table): void           — set data, mark dirty
  sync(): void                       — rebuild Graphics from Arrow columns
  getAnnotationAtPoint(x, y): number | null  — hit test (for selection later)
  destroy(): void

Performance notes:
  - table.getChild('x').toArray() → Float32Array (view, no copy)
  - table.getChild('polygon').get(i) → Float32Array (per-row access)
  - Graphics.poly(Array.from(verts)) for polygons
  - Graphics.rect(x, y, w, h) for bboxes
  - One Container holds all annotation Graphics
  - Container sits above image layer in stage
```

### AnnotationStore — the spec (view-only for now)

```
Responsibilities:
  - Load Arrow IPC bytes → parse into Arrow Table
  - Cache parsed Tables by pageId
  - Expose table for PixiJS consumption

For Step 2 (view only):
  load(pageId: string): Promise<Table>
    - In mock mode: fetch static .arrow file
    - Later: fetch from /api/annotations/{pageId}
  get(pageId: string): Table | null

For Step 4 (edit, added later):
  appendLocal(), updateLocal(), deleteLocal()
  save(), isDirty()
```

### Svelte 5 wiring — the $effect bridge

```svelte
<!-- test/+page.svelte -->
<script lang="ts">
  import { onMount, getContext } from 'svelte';
  import { annotationStore } from '$lib/stores/annotations.svelte';

  const { app, plugins } = getContext('pixi');
  let table = $state<Table | null>(null);

  onMount(async () => {
    // Load image
    await plugins.image.load('/mock/sample-page.jpg');

    // Load annotations (static Arrow IPC for now)
    table = await annotationStore.load('mock-page-001');
  });

  // Bridge: when table changes, tell PixiJS
  $effect(() => {
    if (table && plugins.arrow) {
      plugins.arrow.load(table);
      plugins.arrow.sync();
    }
  });
</script>
```

### Acceptance criteria

- 50 annotations render on top of the image
- Polygons render as filled/stroked shapes
- Bboxes render as rectangles for annotations without polygons
- Colors match status (visually verify: green, red, blue, amber, purple)
- Zoom/pan works with annotations (they move with the image)
- No visible lag when zooming with 50 annotations
- Annotations don't render when image is not loaded
- Table column access uses Float32Array views (verify: no copy in devtools
  profiler)

---

## Step 3: Real Data via API Routes

### What

Replace static mock files with SvelteKit API routes. First with a mock Flight
SQL response (static Arrow IPC served from the route), then wire to real Flight
SQL.

### Why third

The component code doesn't change. Only the data source behind the store
changes. This proves the architecture: components don't know where data comes
from.

### Files

```
src/
  routes/
    api/
      annotations/[pageId]/
        +server.ts              — GET: return Arrow IPC, POST: accept Arrow IPC
      images/[pageId]/
        +server.ts              — GET: return image bytes
      thumbnails/[datasetId]/
        +server.ts              — GET: paginated thumbnails as Arrow IPC
    (app)/
      datasets/
        +page.svelte            — dataset list
        [datasetId]/
          +page.svelte          — thumbnail grid (FiftyOne replacement)
          [docId]/
            [pageNum]/
              +page.svelte      — annotation view (Label Studio replacement)
              +page.ts          — load() — page shell only
  lib/
    server/
      flight.ts                 — Flight SQL client (gizmosql-client wrapper)
      lance.ts                  — @lancedb/lancedb direct for light ops
      cache.ts                  — LRU cache instances
```

### Phased backend connection

**Phase 3a: Mock backend (static files)**

API routes serve static Arrow IPC files and images from `/static/mock/`. No
Flight SQL, no Lance. Just files. This lets you build all the UI.

```typescript
// api/annotations/[pageId]/+server.ts — mock phase
import { readFileSync } from "fs";

export async function GET({ params }) {
  // Serve static Arrow IPC file
  const ipc = readFileSync(`static/mock/${params.pageId}.arrow`);
  return new Response(ipc, {
    headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
  });
}
```

**Phase 3b: Flight SQL backend (real data)**

Swap the mock implementation for the Flight SQL client. Component code
unchanged.

```typescript
// api/annotations/[pageId]/+server.ts — real phase
import { flight } from "$lib/server/flight";
import { annotationCache } from "$lib/server/cache";

export async function GET({ params, request }) {
  // ETag check, LRU cache, Flight SQL query — as designed in architecture
}
```

**Phase 3c: Image route**

```typescript
// api/images/[pageId]/+server.ts
// Mock: serve from static/mock/
// Real: Flight SQL → Lance image column → raw bytes + Cache-Control: immutable
```

### Dataset browser (thumbnail grid)

```
Phase 3d: Build the dataset browser view
  - Fetch paginated thumbnails as Arrow IPC
  - Extract thumbnail binary → Blob URL → <img>
  - Virtual scroll for millions of images
  - Click thumbnail → navigate to annotation view
  - Filter sidebar: by label, confidence, status (Flight SQL WHERE clauses)
  - Stats panel: aggregates from Flight SQL
```

### Acceptance criteria (Phase 3a)

- API routes serve Arrow IPC and images
- Annotation view loads data from API routes (not static imports)
- Store fetches via fetch(), caches in Map
- ETag header present on responses
- Navigation between pages works (data loads per page)
- Image cached by browser (verify: second load = 0ms in network tab)

### Acceptance criteria (Phase 3b)

- Same visual result as 3a but data comes from Flight SQL → Lance
- LRU cache hit visible in server logs
- ETag revalidation works (304 on unchanged data)

---

## Step 4: Edit Mode — Drawing and Selection

### What

Interactive annotation tools: select, draw rectangle, draw polygon, edit text,
accept/reject. All LOCAL until Save.

### Why fourth

View mode is complete. The data pipeline is proven. Now add interactivity.

### Files

```
src/
  lib/
    pixi/
      AnnotationPlugin.ts      — drawing state machine, selection
      SelectionPlugin.ts       — drag handles, transform on selected annotation
    stores/
      annotations.svelte.ts    — add appendLocal, updateLocal, deleteLocal, save
      tools.svelte.ts          — active tool state
      undo.svelte.ts           — undo/redo stack (Arrow Table snapshots)
    components/
      Toolbar.svelte            — tool buttons, save, undo/redo
      Sidebar.svelte            — annotation detail, review controls
      AnnotationList.svelte     — scrollable list, click-to-select
```

### AnnotationPlugin.ts — the spec

```
State machine:
  idle
    → pointerdown on empty space + rect tool → drawing-rect
    → pointerdown on empty space + polygon tool → drawing-polygon
    → pointerdown on annotation + select tool → selected

  drawing-rect
    → pointermove → update rubber-band preview
    → pointerup → commit shape → appendLocal() → idle

  drawing-polygon
    → click → add vertex to points array
    → pointermove → preview line from last vertex to cursor
    → double-click → close polygon → commit → appendLocal() → idle
    → Escape → cancel → idle

  selected
    → click elsewhere → idle
    → click another annotation → selected (new index)
    → Delete key → deleteLocal() → idle
    → drag annotation → updateLocal(new position) → selected
    → Tab → select next annotation → selected

Constructor: (app: Application, arrowPlugin: ArrowDataPlugin)

Methods:
  setTool(tool: 'select' | 'rect' | 'polygon'): void
  onCommit(cb: (shape) => void): void
  onSelect(cb: (index: number | null) => void): void
  destroy(): void

Hit testing:
  Uses arrowPlugin.getAnnotationAtPoint(x, y) to determine
  which annotation was clicked. Point-in-polygon for polygon
  annotations, bounds check for bboxes.
```

### Sidebar — the spec

```
When an annotation is selected:
  - Text field: editable, updates on blur → updateLocal()
  - Label dropdown: select from predefined labels → updateLocal()
  - Confidence: display only (model-generated)
  - Source: display only ("manual" or "model:xxx")
  - Status: display with action buttons
    - [Accept] → updateLocal(status: 'accepted')
    - [Reject] → updateLocal(status: 'rejected') + comment field
    - [Reset] → updateLocal(status: 'draft')
  - Delete button → deleteLocal()

When nothing selected:
  - Page stats: total, by status, avg confidence
  - Annotation list: scrollable, click to select
    Sorted by: position (top-to-bottom), confidence, status
```

### Undo/Redo — the spec

```
Arrow Tables are immutable. Each mutation creates a new Table.
The old Table reference is still valid.

Stack:
  undoStack: Table[]     — previous states
  redoStack: Table[]     — states after undo

On any local mutation:
  push current table to undoStack
  clear redoStack

Undo:
  pop undoStack → set as current table → push current to redoStack

Redo:
  pop redoStack → set as current table → push current to undoStack

Memory: ~5KB per Table × 50 levels = ~250KB. Trivial.
```

### Save flow

```
User clicks Save:
  1. annotationStore.save(pageId) — POST Arrow IPC to API route
  2. API route: DoPut to Flight SQL → Lance
  3. API route: invalidate LRU, re-query, return fresh IPC
  4. Browser: replace local Table with fresh data
  5. Clear dirty flag, clear undo stack
  6. Show success toast

Unsaved changes:
  - Dirty indicator in toolbar (dot or "unsaved changes" text)
  - beforeunload handler: warn if dirty
  - Auto-save timer (optional, configurable, default: off)
```

### Acceptance criteria

- Rectangle tool: draw bbox, appears immediately on canvas
- Polygon tool: click to add vertices, double-click to close
- Select tool: click annotation to select, sidebar shows details
- Selected annotation has visual highlight (thicker stroke, handles)
- Text editing in sidebar updates annotation (local only)
- Accept/reject buttons update status, color changes on canvas
- Delete removes annotation from canvas
- Undo/redo work for all operations
- Save button sends Arrow IPC to API route
- Dirty indicator shows when unsaved changes exist
- Tab cycles through annotations
- Escape cancels drawing / deselects
- All edits are LOCAL until Save — verify with network tab

---

## Step 5: Inference Integration

### What

Run models on the current page. Local (transformers.js, small models) and remote
(vLLM, streaming). Results appear incrementally, local-only until Save.

### Files

```
src/
  lib/
    pixi/
      InferencePlugin.ts       — routes to local worker or remote vLLM
    workers/
      inference.worker.ts      — transformers.js, WebGPU, Arrow IPC out
    components/
      InferencePanel.svelte    — model picker, progress, results preview
  routes/
    api/
      inference/[pageId]/
        +server.ts             — proxy to vLLM, SSE streaming
```

### InferencePlugin.ts — the spec

```
Constructor: (app: Application, annotationStore: AnnotationStore)

Methods:
  runLocal(model: string, imageRegion: ImageBitmap): Promise<void>
    - Post ImageBitmap to Web Worker (Transferable)
    - Worker runs transformers.js pipeline (device: 'webgpu', dtype: 'q4')
    - Worker returns Arrow IPC bytes (Transferable)
    - Parse → annotationStore.appendLocal() → arrowPlugin.sync()
    - All results LOCAL

  runRemote(model: string, task: string, pageId: string): Promise<void>
    - POST to /api/inference/{pageId} with { model, task, stream: true }
    - Read SSE stream
    - Each event: decode Arrow IPC → appendLocal() → sync()
    - On done: inference complete, user reviews
    - All results LOCAL until Save

  runRemoteSimple(model: string, task: string, pageId: string): Promise<void>
    - Non-streaming fallback
    - POST, wait for full response, appendLocal all at once

  cancel(): void
    - Abort fetch / terminate worker
    - Keep whatever results arrived so far (user can review them)

State:
  running: boolean
  progress: number (0-1, from vLLM streaming or worker progress)
  model: string (currently running)
```

### inference.worker.ts — the spec

```
Models cached in worker scope (Map<string, Pipeline>)
First load: download model from HuggingFace Hub (~50-200MB)
Subsequent: use cached pipeline

Input:  { image: ImageBitmap, model: string }
Output: { ipc: ArrayBuffer } (Arrow IPC, Transferable)
Error:  { error: string }

Pipeline creation:
  await pipeline('object-detection', model, {
    device: 'webgpu',
    dtype: 'q4',
  });

Progress: post { progress: number } messages during model download
```

### SSE inference route — the spec

```
POST /api/inference/[pageId]
  Body: { model, task, stream: boolean }

  1. Read image from Lance pages table (via Flight SQL, cached)
  2. Call vLLM with stream: true
  3. Pipe vLLM's streaming response as SSE events
  4. Each event: Arrow IPC bytes (base64 encoded in SSE data field)
  5. Final event: { event: 'done' }

  Does NOT write to Lance. Browser holds results locally.
```

### InferencePanel.svelte — the spec

```
UI:
  - Model dropdown (grouped by task type):
      Local models:  layout-detection-q4, line-segmentation-q4
      Remote models: trocr-v2, dit-layout, [custom models]
  - Task type (auto-selected based on model):
      HTR, classification, autolabeling, segmentation, layout
  - [Run] button → starts inference
  - Progress bar (model loading + inference progress)
  - Results count: "47 annotations found"
  - [Accept All] → updateLocal(status: 'accepted') for all new
  - [Reject All] → deleteLocal() for all new
  - [Keep] → user reviews individually in sidebar
  - [Cancel] → stop inference, keep partial results
```

### Acceptance criteria

- Local inference: select model, run, annotations appear on canvas
- Remote inference: annotations stream in as vLLM produces them
- Progress bar shows model loading and inference progress
- Cancel stops inference, keeps partial results
- All results are LOCAL (verify: no POST to save endpoint)
- Accept All / Reject All work on inference results
- User can run inference, review results, then Save
- User can run inference, discard results (navigate away without saving)
- WebGPU used for local inference (check console)

---

## Step 6: Polish and Production

### What

The things that make it usable, not just functional.

### Items

```
Keyboard shortcuts:
  - Enter: accept selected annotation
  - Backspace: reject selected annotation
  - Tab: next annotation
  - Shift+Tab: previous annotation
  - →: next page
  - ←: previous page
  - Ctrl+Z: undo
  - Ctrl+Shift+Z: redo
  - Ctrl+S: save
  - Escape: cancel drawing / deselect
  - 1: select tool
  - 2: rectangle tool
  - 3: polygon tool

Performance:
  - Virtual scroll for dataset browser (millions of images)
  - Graphics pooling in ArrowDataPlugin (reuse, don't create/destroy)
  - Viewport culling: don't render annotations outside visible area
  - Image preloading: fetch next/prev page image in background

UX:
  - Loading states (skeleton for sidebar, spinner for canvas)
  - Error handling (network failures, Flight SQL errors)
  - Toast notifications (save success, inference complete)
  - Dirty indicator (unsaved changes warning)
  - Responsive layout (sidebar collapsible)

Data:
  - Lance scalar indices on page_id, dataset_id, status, label
  - Annotation import from Label Studio format
  - Export to common formats (COCO, ALTO) — from Lance queries
```

---

## File Tree — Complete

```
ra-platform/
  src/
    routes/
      +layout.svelte
      +page.svelte
      (app)/
        +layout.svelte
        datasets/
          +page.svelte                          — dataset list
          [datasetId]/
            +page.svelte                        — thumbnail grid
            [docId]/
              [pageNum]/
                +page.svelte                    — annotation view
                +page.ts                        — load (page shell only)
      api/
        annotations/[pageId]/+server.ts         — Arrow IPC GET/POST
        images/[pageId]/+server.ts              — image bytes
        thumbnails/[datasetId]/+server.ts       — paginated thumbnails
        inference/[pageId]/+server.ts           — vLLM proxy + SSE
        datasets/+server.ts                     — dataset list
        datasets/[datasetId]/stats/+server.ts   — aggregates

    lib/
      pixi/
        PixiCanvas.svelte                       — Step 1
        ImagePlugin.ts                          — Step 1
        ArrowDataPlugin.ts                      — Step 2
        AnnotationPlugin.ts                     — Step 4
        SelectionPlugin.ts                      — Step 4
        InferencePlugin.ts                      — Step 5
        types.ts

      stores/
        annotations.svelte.ts                   — Step 2 (view), Step 4 (edit)
        tools.svelte.ts                         — Step 4
        viewport.svelte.ts                      — Step 1
        undo.svelte.ts                          — Step 4
        dataset.svelte.ts                       — Step 3

      workers/
        inference.worker.ts                     — Step 5

      server/
        flight.ts                               — Step 3b
        lance.ts                                — Step 3b
        cache.ts                                — Step 3b

      components/
        Toolbar.svelte                          — Step 4
        Sidebar.svelte                          — Step 4
        AnnotationList.svelte                   — Step 4
        InferencePanel.svelte                   — Step 5
        DatasetGrid.svelte                      — Step 3d
        ThumbnailCard.svelte                    — Step 3d
        PageNavigator.svelte                    — Step 3
        StatusBadge.svelte                      — Step 2

      types/
        schemas.ts                              — Step 0

      utils/
        arrow.ts                                — Arrow helpers (column access, table mutation)
        color.ts                                — status → color mapping

    app.css

  static/
    mock/
      sample-page.jpg
      sample-annotations.arrow

  deno.json
  svelte.config.js
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json
```

---

## Progress & Updated Plan

### Completed

| Step | Description | Status |
|------|-------------|--------|
| 0 | Project scaffold (SvelteKit 2 + Deno + Tailwind v4 + shadcn-svelte) | **DONE** |
| 1 | PixiCanvas + image + zoom/pan (WebGPU, isRenderGroup) | **DONE** |
| 2 | Arrow data → polygons (batch rendering, zero-copy, viewport culling) | **DONE** |
| 3a | Mock API routes (Arrow IPC streaming GET/POST) | **DONE** |
| 4 | Drawing tools + selection + edit | **DONE** |
| 4b | Annotation editing refactor (Tool/Editor separation) | **DONE** |
| 4c | OpenCV.js tools (Intelligent Scissors + Magnetic Cursor) | **DONE** (code ready, needs image init wiring) |
| 4d | Multi-select (Ctrl+click) | **DONE** |
| 4e | Hover highlight, editable text/label, keyboard shortcuts dialog | **DONE** |

### Remaining

| Step | Description | Effort | Depends on | Runs where |
|------|-------------|--------|------------|------------|
| **3b** | Flight SQL backend (real Lance data) | 1-2 days | Flight SQL server running | Server |
| **3c** | Image route (Lance binary columns) | 0.5 day | Step 3b | Server |
| **3d** | Dataset browser (thumbnail grid, virtual scroll) | 2-3 days | Step 3a (mock) or 3c (real) | Browser |
| **5a** | SAM segmentation (transformers.js, WebGPU) | 1-2 days | Step 4 | **Browser** (no server) |
| **5b** | HTR / text recognition (transformers.js, WebGPU) | 1 day | Step 4 | **Browser** (no server) |
| **5c** | Remote inference (vLLM, SSE streaming) | 1-2 days | vLLM running | Server + Browser |
| **6a** | Loading states, skeletons, error handling | 1 day | Any | Browser |
| **6b** | Export to ALTO/COCO format | 1 day | Step 4 | Browser + Server |
| **6c** | Image preloading (next/prev page) | 0.5 day | Step 3d | Browser |
| **6d** | Multi-page navigation (arrow keys) | 0.5 day | Step 3d | Browser |
| **6e** | Arrow polygon zero-copy (direct buffer slice instead of .get(i)) | 0.5 day | Step 3b (proper RecordBatches) | Browser |
| **6f** | Spatial index for hit testing (Flatbush on annotation bboxes) | 0.5 day | 5000+ annotations per page | Browser |
| **6g** | Incremental table mutations (avoid full column rebuild) | 1 day | Editing feels slow at scale | Browser |
| **6h** | Streaming Arrow IPC fetch (when Flight SQL sends proper RecordBatches) | 0.5 day | Step 3b | Browser |
| **6i** | Wire OpenCV.js tools (initWithImage on page load) | 0.5 day | Step 4c | Browser |

### What runs where (updated)

```
Browser (no server needed):
  ├── PixiJS v8 (WebGPU)           → rendering               ✅ DONE
  ├── Apache Arrow v21             → columnar data            ✅ DONE
  ├── OpenCV.js (WASM)             → Scissors, Magnetic       ✅ DONE
  ├── transformers.js (WebGPU)     → SAM, TrOCR              ← Step 5a/5b
  └── Svelte 5 / SvelteKit 2      → UI framework             ✅ DONE

Server (needs backend):
  ├── Flight SQL → Lance on S3     → annotation/image data    ← Step 3b
  └── vLLM                         → heavy GPU inference       ← Step 5c
```

### What blocks what (updated)

```
DONE ──→ Step 3d (dataset browser, can use mock data)
   │
   ├──→ Step 5a (SAM via transformers.js, browser-only)
   ├──→ Step 5b (HTR via transformers.js, browser-only)
   │
   ├──→ Step 3b ──→ Step 3c (needs Flight SQL server)
   │                   │
   │                   └──→ Step 3d (with real data)
   │
   └──→ Step 5c (needs vLLM server)

Step 6a-6d can be done anytime (polish)
```

**Key insight**: Steps 5a and 5b (SAM + HTR) do NOT need a server.
They run in the browser via transformers.js with WebGPU acceleration.
Only Step 5c (remote vLLM inference for heavy models) needs a server.

### Recommended next steps

1. **Step 3d** — Dataset browser (thumbnail grid) — builds the FiftyOne replacement
2. **Step 5a** — SAM via transformers.js — massive productivity boost for annotators
3. **Step 5b** — HTR via transformers.js — auto-transcription of text regions
4. **Step 3b** — Flight SQL backend — when the server is ready

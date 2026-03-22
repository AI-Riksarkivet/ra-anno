# RA Platform Viewer — Architecture & Design Decisions

## What we're building

A document annotation platform for the Swedish National Archives (Riksarkivet).
Replaces FiftyOne (dataset browser) + Label Studio (annotation tool) with a
single Arrow-native application.

**Stack**: SvelteKit 2 / Svelte 5 / PixiJS v8 / Apache Arrow v21 / Deno

---

## Data flow: Arrow IPC everywhere

```
HCP S3 (Lance tables)
  → Flight SQL server (NVMe cache)
    → SvelteKit API routes (Arrow IPC over HTTP, streamed)
      → Browser (streaming fetch → incremental parse → PixiJS render)
```

All data moves as **Apache Arrow IPC**. No JSON serialization for bulk data. The
browser receives Arrow bytes, parses to `Table`, and reads columns as zero-copy
`Float32Array` views directly into PixiJS.

### Streaming pipeline

```
Server streams Arrow IPC in chunks
  → Browser reads via ReadableStream
  → After each chunk: try tableFromIPC(accumulated bytes)
  → If parseable: $state.raw update → $effect → ArrowDataPlugin.sync()
  → Annotations appear progressively on canvas
```

The store (`AnnotationStore`) fetches with `?chunk=2048`. Each time enough bytes
arrive to form a valid Arrow IPC stream, it triggers a reactive update. The
`$effect` in the page component bridges this to PixiJS — annotations render
incrementally as data arrives.

For small responses (<5KB), this completes in one chunk. For large queries (50K
annotations from Flight SQL), users see results appearing in real-time.

---

## PixiJS architecture: plugins as pure TypeScript classes

```
PixiCanvas.svelte              ← thin Svelte wrapper (onMount, $bindable props)
  ├── ImagePlugin.ts           ← image loading, viewport zoom/pan
  ├── ArrowDataPlugin.ts       ← Arrow Table → batched PixiJS Graphics
  └── AnnotationPlugin.ts      ← drawing state machine, hit testing
```

### Why plain PixiJS, not svelte-pixi

We evaluated `svelte-pixi` (declarative PixiJS components) and rejected it:

- **Our rendering is imperative** — ArrowDataPlugin builds Graphics from Arrow
  column arrays in loops, not from a Svelte component tree
- **Event ordering matters** — pan vs draw tool requires precise
  `addEventListener` ordering that declarative events can't control
- **Library distribution** — consumers only need `pixi.js`, not `svelte-pixi`
- **svelte-pixi adds nothing** — we only use `Application`, which our 10-line
  `onMount` already handles

### Plugin responsibilities

**ImagePlugin** — owns the viewport transform

- Loads images via `HTMLImageElement` → `Texture.from()` (bypasses
  `Assets.load()` which needs URL extensions)
- Zoom/pan via DOM events on canvas
- Sets `app.stage.isRenderGroup = true` for GPU-accelerated transforms
- `canPan` callback blocks panning when drawing tools are active
- `onViewportChange` feeds bounds to ArrowDataPlugin for culling

**ArrowDataPlugin** — columnar rendering (Rerun-inspired)

- Receives Arrow `Table`, reads geometry columns as `Float32Array` views
- **Batch rendering**: one `Graphics` per status color (5 draw calls, not N)
- **Polygon access**: reads flat `valueOffsets` + `values` from Arrow list
  column, uses `subarray()` — zero-copy, no `.get(i)` materialization
- **Viewport culling**: skips annotations outside visible area
- **Cached geometry**: `xArr`, `yArr`, `wArr`, `hArr` cached after `sync()`,
  reused for `highlight()` and `getAnnotationAtPoint()`

**AnnotationPlugin** — drawing state machine

- States: `idle` → `drawing-rect` → `idle`, `idle` → `drawing-polygon` → `idle`
- Only depends on `ArrowDataPlugin` (for hit testing), not `ImagePlugin`
- Caches `getBoundingClientRect()` via `ResizeObserver` to avoid layout
  recalculation per pointer event
- Preview shapes drawn to a separate `Graphics` object on the stage

---

## Svelte 5 patterns

### Classes with `$state` fields (not stores)

We don't use Svelte 4 stores (`writable`/`readable`). All shared state uses
**classes with `$state` fields** — the Svelte 5 best practice:

```ts
class AnnotationStore {
  private _tables = $state.raw<Record<string, Table>>({}); // large, reassign-only
  private _dirty = $state<Record<string, boolean>>({}); // small, track changes

  table(pageId: string): Table | null {
    return this._tables[pageId] ?? null; // reactive getter
  }
}
```

Consumers use `$derived` to react:

```ts
const table = $derived(annotationStore.table(pageId)); // auto-updates
```

### `$state.raw` for Arrow Tables

Arrow Tables are large objects that are only reassigned, never mutated. Using
`$state.raw` avoids Svelte's deep proxy overhead. This is critical for
performance — proxying a Table with 50K rows and typed arrays would be wasteful.

### `$effect` for PixiJS sync (escape hatch)

The `$effect` that bridges reactive state to PixiJS is the only effect in the
app. It's the correct use case — syncing state to an external imperative library
(PixiJS):

```ts
$effect(() => {
  if (table && pixiCtx) {
    pixiCtx.plugins.arrow.load(table);
    pixiCtx.plugins.arrow.sync();
  }
});
```

### Module singleton (not context)

The `AnnotationStore` is exported as a module-level singleton:

```ts
export const annotationStore = new AnnotationStore();
```

We evaluated `createContext` and decided against it for now:

- Our app has one viewer per page, no SSR annotation state
- Context adds provider-wrapper boilerplate for zero benefit
- When we extract the library, switching to context is a 10-minute change (the
  class doesn't change, only how it's provided)

### `Tool` type lives in pixi/types.ts

The `Tool` type (`"select" | "rect" | "polygon"`) is defined in
`src/lib/pixi/types.ts` — the canonical source for the library.
`stores/tools.svelte.ts` re-exports it. Plugins import from `./types.js`, never
from app stores.

---

## Performance decisions

### Batch rendering (5 draw calls, not N)

Inspired by Rerun's columnar rendering: group all annotations by status color
into a single `Graphics` per group. 50 annotations = 5 draw calls. 5000
annotations = still 5 draw calls.

```ts
for (const [color, rowIndices] of colorGroups) {
  const g = graphicsMap.get(color);
  g.clear();
  for (const i of rowIndices) {
    g.rect(xArr[i], yArr[i], wArr[i], hArr[i]);
  }
  g.fill({ color, alpha: 0.15 });
  g.stroke({ color, width: 2 });
}
```

### Zero-copy Arrow column access

Geometry columns (`x`, `y`, `width`, `height`) are accessed via
`table.getChild("x")!.toArray()` which returns a `Float32Array` view into the
Arrow buffer — no copy, no allocation.

Polygon columns use direct buffer access:

```ts
// Arrow list column internals: offsets + flat values
const start = polyOffsets[i];
const end = polyOffsets[i + 1];
const vertices = polyValues.subarray(start, end); // zero-copy view
```

### Viewport culling

During `sync()`, annotations outside the visible viewport are skipped entirely.
The viewport bounds are updated by `ImagePlugin.onViewportChange` on every
zoom/pan.

### `isRenderGroup` on stage

PixiJS v8's `isRenderGroup = true` on the stage container enables
GPU-accelerated transforms. Zoom/pan operations don't rebuild the scene graph —
the GPU handles the transform matrix.

### Cached canvas rect

`AnnotationPlugin` caches `getBoundingClientRect()` via `ResizeObserver` instead
of calling it on every pointer event (which triggers browser layout
recalculation).

---

## API routes

| Route                       | Method | Purpose          | Response                      |
| --------------------------- | ------ | ---------------- | ----------------------------- |
| `/api/annotations/[pageId]` | GET    | Annotation data  | Arrow IPC (streamed)          |
| `/api/annotations/[pageId]` | POST   | Save annotations | Arrow IPC (fresh)             |
| `/api/images/[pageId]`      | GET    | Document image   | Image bytes (immutable cache) |
| `/api/datasets`             | GET    | Dataset list     | JSON                          |

Currently serving mock data from `static/mock/`. When Flight SQL is connected,
only the `+server.ts` files change — the store, plugins, and components are
unaware of the data source.

---

## Local-first editing

All annotation edits are **local** until the user clicks Save:

```
User draws annotation → appendLocal() → instant (0ms, no server)
User edits status     → updateLocal() → instant (0ms, no server)
User deletes          → deleteLocal() → instant (0ms, no server)
User clicks Save      → save()        → POST Arrow IPC → server
```

Undo/redo uses Arrow Table snapshots — since Tables are immutable, each undo
state is just a reference (~5KB × 50 levels = ~250KB).

---

## File structure

```
src/
  lib/
    pixi/
      PixiCanvas.svelte          ← thin Svelte wrapper
      ImagePlugin.ts             ← image + viewport
      ArrowDataPlugin.ts         ← Arrow → batched Graphics
      AnnotationPlugin.ts        ← drawing state machine
      types.ts                   ← PixiContext, Tool, ViewportBounds
      index.ts                   ← barrel export (future library)
    stores/
      annotations.svelte.ts     ← AnnotationStore ($state.raw class)
      tools.svelte.ts           ← ToolStore ($state class)
      undo.svelte.ts            ← UndoStack ($state class)
    components/
      Toolbar.svelte            ← tool buttons, save, undo/redo
      AnnotationSidebar.svelte  ← annotation detail + list
      ui/                       ← shadcn-svelte components
    utils/
      color.ts                  ← status → color mapping
    types/
      schemas.ts                ← Arrow schema definitions
  routes/
    api/
      annotations/[pageId]/     ← Arrow IPC streaming GET/POST
      images/[pageId]/          ← image bytes (immutable cache)
      datasets/                 ← dataset list JSON
    (app)/
      datasets/
        +page.svelte            ← dataset list (placeholder)
        [datasetId]/[docId]/[pageNum]/
          +page.svelte          ← annotation editor
      test/
        +page.svelte            ← canvas test page
```

---

## Dependencies

| Package         | Version | Purpose                                    |
| --------------- | ------- | ------------------------------------------ |
| `pixi.js`       | 8.17+   | WebGPU/WebGL 2D rendering                  |
| `apache-arrow`  | 21.1+   | Columnar data format, IPC                  |
| `svelte`        | 5.54+   | UI framework (runes)                       |
| `@sveltejs/kit` | 2.55+   | Routing, SSR, API routes                   |
| `tailwindcss`   | 4.2+    | Styling                                    |
| `bits-ui`       | 2.16+   | Headless UI primitives (via shadcn-svelte) |

No `svelte-pixi`. No `@lancedb/lancedb` (yet — needed for Step 3b). No
`@gizmodata/gizmosql-client` (yet — needed for Flight SQL).

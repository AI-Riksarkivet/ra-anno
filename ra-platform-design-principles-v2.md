# RA Platform — Design Principles (Revised)

**Companion to**: Architecture v0.8 **Version**: 2.2 — vLLM streams to local
staging, Lance written only on Save

---

## 1. Arrow IPC over HTTP — what's actually happening

### The good: no format conversion for numeric data

With JSON, your annotation data goes through three shape changes:

```
Lance (columnar float arrays)
  → JSON string (row-oriented text, type info lost)
    → JS objects on heap (500 individual objects, GC pressure)
      → Float32Array (manual loop to extract .x from 500 objects)
```

With Arrow IPC:

```
Lance (columnar float arrays)
  → Arrow IPC bytes (same columnar layout, small header added)
    → Arrow Table in browser (wraps the buffer, no reshape)
      → table.getChild('x').toArray() → Float32Array (view into existing buffer)
```

For numeric columns (`x`, `y`, `width`, `height`, `confidence`), `toArray()`
returns a **view** into the underlying ArrayBuffer — no copy, no allocation.
This is real zero-copy. The Float32Array you hand to PixiJS IS the bytes that
came over the wire.

### The honest caveat: string columns are NOT zero-copy

For string columns (`text`, `label`, `source`, `status`), Arrow stores them as
UTF-8 bytes with offset arrays. When you access `table.getChild('text').get(i)`,
Arrow decodes the UTF-8 bytes into a JavaScript string on demand. This is lazy
(good — doesn't decode strings you don't access) but it IS a conversion. You
don't get a native JS string array for free.

For our use case this is fine — we access string columns one at a time (selected
annotation in sidebar), not in bulk. The bulk rendering path only touches float
columns and the status column (which we can map to an enum/integer instead if it
becomes a bottleneck — it won't).

### Column projection — why images and annotations coexist

This is the real reason the "everything in Lance" model works:

```
GET /api/annotations/page_042
  → SELECT x, y, width, height, polygon, status FROM annotations WHERE page_id = ?
  → Lance reads ONLY those column files from S3 — the image column doesn't exist
    in the annotations table at all, it's in the pages table
  → Arrow IPC ~5KB for 500 annotations
  → Fast

GET /api/images/page_042
  → SELECT image FROM pages WHERE page_id = ? LIMIT 1
  → Lance reads ONLY the image column file for that one row
  → Raw bytes ~10-50MB
  → Slow, but cached forever (images don't change)
```

It's not just column projection within one table — it's separate tables for
separate access patterns. The annotations table has no image column. The pages
table has no annotation columns. They never need to be joined.

### When Arrow IPC is worse than JSON

Be honest about this: for tiny responses (a single annotation, a metadata
lookup), Arrow IPC has more overhead than JSON. The IPC format includes schema
metadata, dictionary encodings, and alignment padding. A single row with 3
string fields is maybe 200 bytes in JSON but 500+ bytes in Arrow IPC.

**Rule**: Use Arrow IPC for bulk data (annotations for a page, thumbnails for a
grid, inference results). Use plain JSON for single-value responses (dataset
metadata, page count, status updates).

---

## 2. SSR — what it actually does and what it doesn't

### What SSR does NOT do here

SSR does not render the PixiJS canvas on the server. There is no server-side
canvas. The `<canvas>` element and everything PixiJS draws is purely
client-side. SSR also does not render annotation overlays, thumbnails, or
anything visual.

### What SSR actually does

SSR runs the SvelteKit `load()` function on the server during the initial page
request. For the annotation view, `load()` returns only metadata (page ID, doc
ID, image URL path). The server renders the HTML shell — toolbar, sidebar
layout, empty canvas placeholder — and sends it in one HTTP response.

The browser receives a page with real layout and navigation, not a blank screen.
Arrow annotation data and the image load client-side after hydration, in
parallel with PixiJS initialization.

### Why not SSR the Arrow data?

The previous version of this doc suggested embedding Arrow IPC bytes in the SSR
HTML.

SvelteKit's `devalue` serializer handles Uint8Array by encoding it — this bloats
the HTML. For 500 annotations (~5KB of Arrow IPC), the encoded version in HTML
might be ~10KB. Acceptable, but unnecessary.

**Better pattern**: SSR the page shell and metadata only. Let the annotation
data load client-side after hydration. The canvas isn't ready until `onMount`
anyway (PixiJS needs async init), so there's no visual benefit to having the
data 50ms earlier.

```typescript
// +page.ts — runs on server for SSR, on client for navigation
export async function load({ params, fetch }) {
  // SSR just needs the page shell data — fast, tiny
  return {
    pageId: `${params.docId}_${params.pageNum}`,
    docId: params.docId,
    pageNum: Number(params.pageNum),
    datasetId: params.datasetId,
    imageUrl: `/api/images/${params.docId}_${params.pageNum}`,
  };
  // Arrow data is NOT loaded here — loaded client-side after PixiJS is ready
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { annotationStore } from '$lib/stores/annotations.svelte';

  let { data } = $props();
  let table = $state<Table | null>(null);

  onMount(async () => {
    // Load annotations AFTER hydration — PixiJS is initializing in parallel
    table = await annotationStore.load(data.pageId);
  });
</script>
```

Why this is better:

- HTML is smaller (no base64-encoded Arrow bytes)
- Data fetch and PixiJS init happen in parallel
- Client-side navigation (`goto()`) skips SSR entirely and fetches directly
- No `devalue` edge cases with binary data

SSR still helps: the page shell (toolbar, sidebar layout, navigation) renders
instantly. The canvas gets a loading state until both PixiJS init and data fetch
complete. The user sees a real page, not a blank screen.

### When SSR actually matters

SSR matters most for the **dataset browser** view (the FiftyOne replacement).
That page is mostly HTML — a grid of thumbnail cards with metadata text. SSR can
render those cards server-side with real data. The thumbnails load as images
after. This page SHOULD SSR its data.

The **annotation view** (the Label Studio replacement) is mostly canvas. SSR
adds minimal value for the visual content. SSR the shell, fetch data
client-side.

---

## 3. Svelte 5 + PixiJS — the binding pattern

### The problem with wrapper libraries

A wrapper library (svelte-konva, react-konva, pixi-react) creates a Svelte/React
component for every PixiJS object:

```svelte
{#each annotations as ann}
  <Rect x={ann.x} y={ann.y} width={ann.w} height={ann.h} />
{/each}
```

500 annotations = 500 Svelte component instances. Each one:

- Has its own reactive scope (tracks which `$state` values it depends on)
- Runs a lifecycle (mount, update, destroy)
- Is diffed by Svelte when anything changes

When one annotation updates, Svelte checks all 500 components. Meanwhile, PixiJS
has its OWN dirty tracking internally. You're paying for two systems doing the
same work.

### What we do instead: two worlds with a thin bridge

Svelte 5 owns the **UI outside the canvas**: toolbar, sidebar, panels, routing,
data fetching. This is normal HTML rendered by Svelte.

PixiJS v8 owns the **canvas**: all rendering, hit testing, drawing interaction,
zoom/pan. No Svelte components inside the canvas.

They communicate through a thin bridge:

**Svelte → PixiJS** (UI state changes affecting the canvas):

```typescript
// When user picks a tool in the Svelte toolbar, tell PixiJS
$effect(() => {
  annotationPlugin.setTool(activeTool);
});

// When new Arrow data arrives, tell PixiJS to re-render
$effect(() => {
  if (table) {
    arrowDataPlugin.load(table);
    arrowDataPlugin.sync();
  }
});
```

**PixiJS → Svelte** (canvas events affecting the UI):

```typescript
// When user finishes drawing on canvas, update Svelte state
annotationPlugin.onCommitAnnotation((shape) => {
  // This updates a $state variable, which triggers Svelte reactivity
  // Sidebar shows the new annotation, stats update, etc.
  appendAnnotation(shape);
});

// When user clicks an existing annotation on canvas
annotationPlugin.onSelect((index) => {
  selectedIndex = index; // $state, sidebar reacts
});
```

`$effect` is the bridge. It's the Svelte 5 primitive that says "when this
reactive value changes, run this imperative code." That's exactly what we need —
Svelte's reactivity triggers PixiJS's imperative API.

### CHANGE: don't use PixiJS extensions for application logic

**The previous version was wrong about using `ExtensionType.Application` for our
plugins.**

PixiJS v8's extension system is designed for engine-level concerns: loaders,
renderer systems, render pipes, blend modes. Using it for ArrowDataPlugin and
AnnotationPlugin works mechanically (the code runs) but it's misusing the
abstraction. The extensions are registered globally, they don't have clean
access to application state, and the `this` binding is awkward (hence all the
`@ts-expect-error` comments).

**Better pattern**: plain classes, instantiated in the Svelte component, passed
the PixiJS app instance:

```typescript
// Just a class. Not a PixiJS extension.
export class ArrowDataPlugin {
  private app: Application;
  private container = new Container();
  private table: Table | null = null;
  private dirty = true;

  constructor(app: Application) {
    this.app = app;
    this.app.stage.addChild(this.container);
  }

  load(table: Table) {
    this.table = table;
    this.dirty = true;
  }

  sync() {/* ... */}
  destroy() {
    this.container.destroy({ children: true });
  }
}
```

```svelte
<!-- PixiCanvas.svelte -->
<script lang="ts">
  import { Application } from 'pixi.js';
  import { onMount, setContext } from 'svelte';
  import { ArrowDataPlugin } from './ArrowDataPlugin';
  import { AnnotationPlugin } from './AnnotationPlugin';

  let { width = $bindable(800), height = $bindable(600), children } = $props();
  let canvas: HTMLCanvasElement;
  let app = $state<Application | null>(null);
  let plugins = $state<{ arrow: ArrowDataPlugin; annotation: AnnotationPlugin } | null>(null);

  setContext('pixi', {
    get app() { return app; },
    get plugins() { return plugins; },
  });

  onMount(async () => {
    const _app = new Application();
    await _app.init({
      canvas,
      preference: 'webgpu',
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
      width, height,
    });
    app = _app;
    plugins = {
      arrow: new ArrowDataPlugin(_app),
      annotation: new AnnotationPlugin(_app),
    };

    return () => {
      plugins?.arrow.destroy();
      plugins?.annotation.destroy();
      _app.destroy(true, { children: true });
    };
  });
</script>

<canvas bind:this={canvas} style="width:{width}px; height:{height}px"></canvas>
{#if app && plugins}
  {@render children?.()}
{/if}
```

Why this is better:

- No `@ts-expect-error` hacks
- Plugins receive the app instance explicitly — clean dependency
- Lifecycle is managed by Svelte's `onMount` cleanup — not a global registry
- Plugins are scoped to the component, not registered globally
- Easier to test (just pass a mock app)
- No need to learn the PixiJS extension API for application-level code

When WOULD you use PixiJS extensions? If you build a custom renderer pipe, a
custom blend mode, or a custom asset loader. Engine-level stuff. Not our
annotation drawing tools.

---

## 4. Performance — what actually matters and what doesn't

### What matters: avoiding the big costs

The expensive things in this app, in order:

1. **Loading images over the network** (~10-50MB per page, ~1-5 seconds)
2. **Model inference** (seconds for local, seconds-to-minutes for server)
3. **Initial PixiJS setup** (WebGPU adapter request, shader compilation, ~200ms)
4. **Flight SQL queries** (~10-50ms internal, plus S3 read if not cached)

What does NOT matter:

- JSON vs Arrow IPC for 500 annotations (difference is ~5ms, nobody will notice)
- Svelte component overhead for toolbar/sidebar (it's HTML, it's fast)
- Float32Array copy vs view (difference is microseconds for 500 values)

**So why use Arrow IPC at all?** Because it eliminates a category of bugs and
complexity, not because of raw speed. With JSON, you need to:

- Define serialization/deserialization types on both ends
- Handle type coercion (JSON numbers are always doubles)
- Build typed arrays manually for PixiJS
- Handle schema drift between server and client silently (wrong field name =
  undefined)

With Arrow, the schema is in the data. A missing column throws immediately.
Types are preserved. And the rendering path is shorter — fewer lines of code,
fewer places for bugs.

The performance wins matter at scale: when you have 5000+ annotations, when
you're streaming batch inference results, when you're loading the dataset
browser with 1000 thumbnails. For typical page-level annotation (50-500
annotations), the main benefit is simplicity, not speed.

### What matters: image loading

The actual bottleneck is loading images over the network. Even with web-friendly
formats (JPEG/PNG), images can be several MB. The flow:

```
Lance pages table (S3) → Flight SQL server → SvelteKit API route → browser
```

This is fine because:

- Lance column projection reads only the `image` column, skipping all metadata
- `Cache-Control: immutable` means the browser caches forever — each image is
  fetched once
- Sequential browsing (page 1, 2, 3...) benefits from Lance's NVMe fragment
  cache

The SvelteKit Node.js process does buffer the image in memory briefly while
proxying it to the HTTP response. For typical document images (1-5MB JPEG/PNG),
this is not a problem. If it ever becomes one, SvelteKit can stream the response
as a ReadableStream to avoid holding the full buffer.

### What matters: annotation rendering strategy

The current ArrowDataPlugin creates one `Graphics` object per annotation and
rebuilds all of them when `dirty` is set. This works fine for hundreds of
annotations but has a ceiling:

- **< 500 annotations**: Current approach is fine. One Graphics per annotation
  gives you per-annotation hit testing and interaction for free.
- **500-2000 annotations**: Still fine, but consider pooling (reuse Graphics
  objects instead of creating/destroying).
- **2000-10000 annotations**: Draw all annotations into a single Graphics object
  (one `poly()`/`rect()` call per annotation, but only one Graphics). You lose
  per-annotation hit testing — implement it yourself with point-in-polygon math.
- **10000+ annotations**: Use a custom shader or PixiJS ParticleContainer. Feed
  the Float32Arrays directly as vertex data. This is where Arrow's columnar
  layout really pays off — the data is already in GPU-uploadable format.

For historical document annotation, 50-500 per page is typical. Don't
over-optimize.

---

## 5. Caching — what each layer does

### Lance fragment cache (automatic, on Flight SQL server)

LanceDB caches recently-read `.lance` fragments on local disk (NVMe). When the
Flight SQL server queries annotations for page_042, Lance reads fragments from
S3 (~200ms). Next time, same fragments are on NVMe (~2ms). This is automatic —
LanceDB manages it.

You don't configure this. You benefit from it when users browse sequentially
through a document (page 1, 2, 3... — the fragments for nearby pages are likely
in the same or adjacent files).

### SvelteKit LRU cache (manual, in-memory)

The SvelteKit server process holds an LRU cache of Arrow IPC response bytes,
keyed by page_id. When two users (or the same user in two tabs) request
annotations for the same page, the Flight SQL query happens once.

```typescript
const cache = new LRUCache<string, Uint8Array>({ max: 500, ttl: 60_000 });
```

- **max: 500** — at ~5KB per page, this is ~2.5MB of memory. Cheap.
- **ttl: 60s** — entries expire after 60 seconds. Short enough that edits from
  other users appear within a minute.
- **Invalidation**: on POST (save), the entry is deleted and re-fetched.

When to skip this cache: for mutations (POST/PUT/DELETE always go to Flight
SQL). When to increase TTL: if the app is read-heavy and edits are rare (review
mode).

### Browser cache (two kinds)

**Arrow Table cache** (Map in AnnotationStore): holds parsed Arrow Tables for
pages you've visited. When you navigate back to a page, data is instant. Evicted
on save (replaced with fresh data from the server response).

**HTTP image cache** (browser standard): images served with
`Cache-Control: immutable`. The browser caches them indefinitely. This is
correct because scanned document images genuinely don't change after ingest.

### What's NOT cached and why

- **Inference results**: not cached. Each inference run may use different models
  or parameters. Results go directly to the annotations table.
- **Dataset stats**: not cached in SvelteKit. These are cheap aggregate queries
  and change frequently as annotations are added/reviewed.

---

## 6. SvelteKit 2 specifics

### Server-only code

Files named `+server.ts` and `+page.server.ts` only run on the server. Vite
never bundles them into the client. This means:

```typescript
// In +server.ts — this is ONLY in the server bundle
import { FlightSQLClient } from "@gizmodata/gizmosql-client"; // gRPC, node-only
```

No `typeof window` checks. No dynamic imports. The build system enforces the
boundary.

### Universal fetch

In `+page.ts` load functions, the `fetch` parameter is special:

- During SSR: it's a server-side fetch that resolves relative URLs against the
  SvelteKit server itself. `/api/annotations/page_042` becomes an internal
  function call — no HTTP round trip at all.
- During client navigation: it's the browser's standard fetch.

This means your load function works identically in both contexts without any
conditional logic.

### What we should NOT use

**Form actions**: The previous version mentioned using SvelteKit form actions
for saves with progressive enhancement. This is wrong for our app. If JavaScript
fails, there's no PixiJS, no canvas, no annotations to save. Progressive
enhancement doesn't apply to a canvas-based annotation tool. Use fetch-based API
calls.

**Streaming responses**: SvelteKit supports ReadableStream responses. We use
this for:

- **Inference results via SSE**: annotations appear on canvas as vLLM produces
  them
- **Thumbnail batches**: dataset browser renders first thumbnails before full
  batch loads
- NOT for annotation data per page — 500 annotations is small enough for a
  single response

---

## 7. Risk: gizmosql-client

The `@gizmodata/gizmosql-client` package has 1 star and one primary contributor.
It works, it's the best pure-TS Flight SQL client available, but it's a
bus-factor-1 dependency on a critical path.

**Mitigation options:**

1. **Vendor it** — fork into your org, maintain independently. You only use
   `execute()` and DoPut. The Flight SQL protocol is stable.

2. **Wrap it with an adapter** — create a `FlightSQLAdapter` interface that your
   SvelteKit routes depend on. If gizmosql-client dies, swap the implementation
   without touching route code.

3. **Fallback to LanceDB Node SDK directly** — LanceDB has a TypeScript SDK
   (`@lancedb/lancedb`) that can query Lance tables on S3 without Flight SQL.
   Slower (no fragment cache, no gRPC streaming), but eliminates the Flight SQL
   server entirely for simple use cases.

**Recommendation**: Option 2. Write the adapter interface now, use
gizmosql-client as the first implementation. If it breaks, you have a clean seam
to replace it.

---

## 8. Svelte 5 patterns — specifically what we use

### $state — reactive values that Svelte tracks

```typescript
let activeTool = $state<"select" | "rect" | "polygon">("select");
let selectedIndex = $state<number | null>(null);
let table = $state<Table | null>(null);
```

When `activeTool` changes, only the code that reads it re-runs. Not the whole
component, not the whole page. Fine-grained.

### $derived — computed values, cached until inputs change

```typescript
const annotationCount = $derived(table?.numRows ?? 0);
const acceptedCount = $derived(
  table ? countStatus(table, "accepted") : 0,
);
```

These only recompute when `table` changes (i.e., after a data load or save).
Svelte caches the result — reading `annotationCount` 10 times doesn't recompute.

### $effect — the Svelte ↔ PixiJS bridge

```typescript
$effect(() => {
  if (!plugins) return;
  plugins.annotation.setTool(activeTool);
});
```

`$effect` runs when any `$state` or `$derived` value it reads changes. It's the
only place where Svelte's reactive world touches PixiJS's imperative world.

Keep effects small and focused. One effect per concern:

- Tool change → tell PixiJS
- Table change → tell ArrowDataPlugin
- Zoom change → update stage scale
- Selection change → update SelectionLayer

Don't put all the bridge logic in one giant effect.

### Snippets — replacing slots

```svelte
{#if app && plugins}
  {@render children?.()}
{/if}
```

`children` is a snippet prop (Svelte 5 replacement for `<slot>`). The
`{@render}` directive calls it. The conditional ensures children only render
after PixiJS is ready — so they can safely call `getContext('pixi')`.

### Context — passing PixiJS to children without props

```typescript
// Parent sets
setContext("pixi", {
  get app() {
    return app;
  },
  get plugins() {
    return plugins;
  },
});

// Child reads
const { app, plugins } = getContext("pixi");
```

Context avoids prop-drilling the PixiJS app through every component. Any
component inside `<PixiCanvas>` can access the app and plugins directly.

---

## 9. What's good, what should change — summary

### Keep as designed

| Decision                              | Why it's right                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Arrow IPC for bulk data               | Eliminates format conversions, schema in the data, typed arrays for PixiJS   |
| Three Lance tables, zero joins        | Every query hits one table, column projection is free                        |
| Images as `large_binary` columns      | Lance multimodal format at millions of images, no external storage           |
| Thumbnails as `binary` columns        | Column projection means grid view never touches full images                  |
| Polygons as `list<float32>`           | Maps directly to PixiJS `Graphics.poly()`, variable-length per row           |
| PixiJS v8 for rendering               | Only real option for 2D WebGPU, active maintenance (v8.17, March 2026)       |
| Svelte 5 for UI                       | Runes for fine-grained reactivity, SSR for page shell                        |
| Plugins as plain classes              | Clean dependency injection, testable, no PixiJS extension API misuse         |
| transformers.js in Web Worker         | WebGPU inference client-side, Transferable zero-copy                         |
| Status/review on annotation row       | Queryable, no join, replaces Label Studio workflow                           |
| `dataset_id` denormalized             | Most common filter on all three tables, avoids join                          |
| `Cache-Control: immutable` for images | Documents don't change after ingest, cache forever                           |
| Flight SQL server as shared cache     | Warm NVMe fragments for all clients, survives SvelteKit restarts             |
| Local mutations before save           | appendLocal/updateLocal/deleteLocal are instant, save is explicit            |
| ETag on Lance version                 | Standard HTTP conditional requests, cheap revalidation                       |
| SSE for inference streaming           | vLLM streams natively, results go to LOCAL table, Lance written only on Save |

### Changed from earlier design iterations

| What                         | Was (wrong)                                         | Now                                                                               |
| ---------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| SSR + Arrow data             | Arrow IPC embedded in HTML via devalue              | SSR page shell only, fetch data client-side after hydration                       |
| PixiJS plugins               | `ExtensionType.Application` with `@ts-expect-error` | Plain classes, instantiated in onMount, passed app instance                       |
| DuckDB-WASM in browser       | Listed as dependency for local filtering            | Removed — Arrow TS for local, Flight SQL for server queries                       |
| Form actions for saves       | Mentioned as progressive enhancement                | Removed — no JS = no canvas = nothing to save                                     |
| gizmosql-client usage        | Direct dependency, no abstraction                   | Wrapped in adapter interface for replaceability                                   |
| Save = full refetch          | Every edit triggered server round trip              | Local mutations are instant, save is explicit batch                               |
| vLLM writes to Lance         | Inference results written directly via DoPut        | Results stream to browser LOCAL table, Lance written only on Save                 |
| vLLM role                    | Just HTR and layout detection                       | General-purpose: HTR, classification, autolabeling, segmentation, any model       |
| Inference = request/response | Wait for full completion, render all at once        | vLLM native streaming → SSE → local Arrow Table, annotations appear incrementally |
| Cache revalidation           | TTL-based expiry only                               | ETag + conditional requests, standard HTTP                                        |

### Decide later (not blocking)

| Question                            | When to decide                                                         |
| ----------------------------------- | ---------------------------------------------------------------------- |
| SSE vs polling for inference        | SSE is in the design, but start with polling — upgrade when UX matters |
| Multi-user editing                  | When more than one person needs to annotate the same page concurrently |
| Keyboard shortcuts                  | During first user testing — observe what reviewers need                |
| Custom shader for 1000+ annotations | When profiling shows Graphics creation is a bottleneck                 |
| ETag granularity                    | Monitor false-positive rate, add per-page version if excessive         |
| Auto-save timer                     | After basic save flow works, add periodic auto-save for dirty pages    |

# RA Document Platform — Architecture & Design

**Version**: 0.8 draft **Date**: 2026-03-21 **Team**: AI-lab, Riksarkivet

---

## 1. Overview

A platform for viewing, annotating, and running AI inference on digitised
historical documents from the Swedish National Archives. Replaces both FiftyOne
(dataset exploration / curation) and Label Studio (annotation) with a single
Arrow-native application built on LanceDB.

### Scale

- **Millions** of document images (as binary columns in Lance — multimodal
  dataset)
- **Hundreds** of polygons + metadata per image
- Multiple document types (handwritten, printed, maps, forms, etc.)
- Thumbnails also stored as binary columns in Lance

### Design principles

1. **Arrow everywhere** — Arrow IPC at every boundary.
2. **LanceDB is the database** — Lance tables on HCP S3. No Postgres.
3. **Multimodal Lance** — Images and thumbnails are binary columns in the Lance
   table. No image server, no blob refs.
4. **Three tables, zero joins** — documents, pages (with images), annotations
   (with polygons). Every query hits one table with column projection.
5. **Shared cache layer** — Flight SQL server as the warm persistent cache
   between S3 and all clients.
6. **PixiJS v8** — 2D rendering with WebGPU + WebGL + Canvas fallback.
7. **Inference split** — Small models client-side, heavy models server-side.
8. **Svelte 5 / SvelteKit 2** — Runes, SSR for shell, thin PixiJS bindings.

---

## 2. Data Model — Three Tables, Zero Joins

(Same as v0.5 — documents, pages, annotations. See previous version for full
schema definitions.)

```
HCP S3
  └─ LanceDB (.lance fragments on S3)
       ├─ documents     one row per document      (millions)
       ├─ pages         one row per page/image    (millions, image + thumbnail as binary)
       └─ annotations   one row per annotation    (hundreds of millions)
```

Key columns:

- `pages.image` — `large_binary`, the actual image bytes
- `pages.thumbnail` — `binary`, small JPEG/WebP for grid view
- `annotations.polygon` — `list<float32>`, variable-length `[x1,y1,x2,y2,...]`
- `annotations.embedding` — added later via `add_columns()`

---

## 3. Who Does What — Component Responsibilities

### 3.1 The question: Flight SQL server or direct LanceDB SDK?

LanceDB has two ways to access Lance tables from TypeScript:

**Option A: Flight SQL server (pyarrow.flight) + gRPC client from SvelteKit**

```
Browser → SvelteKit → gRPC → Flight SQL Server → LanceDB Python → S3
                                    ↑
                              NVMe fragment cache
                              (warm, persistent)
```

**Option B: @lancedb/lancedb TS SDK directly from SvelteKit**

```
Browser → SvelteKit → @lancedb/lancedb (Rust/napi-rs) → S3
                              ↑
                        in-process cache
                        (cold on pod restart)
```

### 3.2 Why we keep the Flight SQL server

At millions of images and hundreds of millions of annotations, the Flight SQL
server is not an unnecessary layer — it's a **shared warm cache**:

| Concern            | Flight SQL server                                 | Direct TS SDK                                 |
| ------------------ | ------------------------------------------------- | --------------------------------------------- |
| **Fragment cache** | NVMe disk, persistent, survives restarts          | In-process, lost on pod restart               |
| **Cache warming**  | One process serves all clients — high hit rate    | Each SvelteKit pod has its own cold cache     |
| **Multiple pods**  | All pods hit same warm cache                      | N pods = N cold caches = N × S3 reads         |
| **S3 cold read**   | ~200ms, but only on first access per fragment     | ~200ms on every pod restart per fragment      |
| **vLLM reads**     | Flight SQL serves images from warm cache          | TS SDK reads cold from S3                     |
| **Batch writes**   | Flight SQL sees new fragments immediately         | SvelteKit pod's read cache may be stale       |
| **Consistency**    | Single query layer, one view of the data          | Two SDKs (TS + Python) reading same files     |
| **Image serving**  | Flight SQL streams image bytes, SvelteKit proxies | SvelteKit Node.js process buffers image bytes |
| **Ops complexity** | Extra K8s service                                 | Fewer services                                |

**The cold cache problem is the deal-breaker.** If SvelteKit has 3 pods behind a
load balancer, and a user navigates through a document, each request may hit a
different pod. That's 3× the S3 reads for the same data. The Flight SQL server
is one process with one warm cache.

**Consistency matters for batch pipelines.** When offline batch inference writes
annotations directly to Lance (status="prediction"), SvelteKit needs to see
those new fragments. With Flight SQL, both SvelteKit and batch pipelines go
through the same server — writes are immediately visible to reads. With the TS
SDK directly, there's a window where SvelteKit's cached fragment list hasn't
picked up new data.

### 3.3 Where @lancedb/lancedb TS SDK is useful

Use the TS SDK for operations where the Flight SQL server adds latency without
benefit:

- **Dataset listing** — small metadata queries, cold cache doesn't matter
- **Schema inspection** — one-time reads
- **Batch operations** — SvelteKit server-side scripts that run outside the
  request path
- **Development** — local dev without running a Flight SQL server

```typescript
// src/lib/server/lance.ts — direct SDK for lightweight ops
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("s3://bucket/lancedb", {
  storageOptions: {/* S3 credentials */},
});

export async function listDatasets() {
  const docs = await db.openTable("documents");
  const result = await docs
    .query()
    .select(["dataset_id"])
    .toArrow();
  // Deduplicate dataset_ids
  return [...new Set(result.getChild("dataset_id"))];
}
```

### 3.4 Component responsibility matrix

```
┌──────────────────────────────────────────────────────────────────┐
│ Component          │ Reads              │ Writes              │
├────────────────────┼────────────────────┼─────────────────────┤
│ Flight SQL Server  │ All three tables   │ Annotations table   │
│ (pyarrow.flight)   │ with column proj.  │ (append, update)    │
│                    │ NVMe fragment cache │                     │
│                    │                    │                     │
│ SvelteKit server   │ Annotations (via   │ Annotations (via    │
│                    │ Flight SQL, gRPC)  │ Flight SQL DoPut)   │
│                    │ Images (via        │ — only when user    │
│                    │ Flight SQL)        │ clicks Save/Finish  │
│                    │ Datasets (direct   │                     │
│                    │ TS SDK, light ops) │                     │
│                    │                    │                     │
│ vLLM backend       │ Images from pages  │ NOTHING directly    │
│                    │ (via Flight SQL)   │                     │
│                    │                    │ Streams results to  │
│                    │                    │ SvelteKit via SSE   │
│                    │                    │ → browser holds     │
│                    │                    │ locally until save  │
│                    │                    │                     │
│ Browser            │ Arrow IPC over     │ Arrow IPC over      │
│                    │ HTTP from SvelteKit│ HTTP to SvelteKit   │
│                    │ Images over HTTP   │ — only on explicit  │
│                    │ (cached immutable) │ Save/Finish action  │
│                    │                    │                     │
│ Batch pipelines    │ Direct Python SDK  │ Direct Python SDK   │
│ (future)           │ or Flight SQL      │ or Flight SQL       │
│                    │                    │ (these DO write     │
│                    │                    │ directly to Lance)  │
└──────────────────────────────────────────────────────────────────┘
```

Key distinction: **vLLM never writes to Lance directly during interactive use.**
It streams results to the browser via SvelteKit SSE. The browser accumulates
results in the local Arrow Table. The user reviews, edits, accepts/rejects. Only
when the user clicks Save/Finish does SvelteKit write to Lance.

Batch pipelines (offline processing of thousands of pages) DO write directly to
Lance — there's no interactive editing step.

---

## 4. Backend Services

```
┌──────────────────────────────────────────────────────────────────┐
│  K8s Cluster                                                     │
│                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Flight SQL Server        │  │ vLLM                         │  │
│  │ (pyarrow.flight)         │  │                              │  │
│  │                          │  │ General-purpose model server: │  │
│  │ THE shared query layer   │  │ ├─ HTR (TrOCR, etc)          │  │
│  │ for all clients          │  │ ├─ Layout analysis (DiT)      │  │
│  │                          │  │ ├─ Document classification    │  │
│  │ NVMe fragment cache:     │  │ ├─ Autolabeling              │  │
│  │ - S3 read: ~200ms       │  │ ├─ Image classification      │  │
│  │ - NVMe hit: ~2ms        │  │ ├─ Segmentation              │  │
│  │ - Serves ALL clients     │  │ └─ Any model you deploy      │  │
│  │                          │  │                              │  │
│  │ Column projection:       │  │ OpenAI-compatible API        │  │
│  │ - annotations: geometry  │  │ Native streaming support     │  │
│  │   + metadata only        │  │                              │  │
│  │ - pages: image column    │  │ Reads images via Flight SQL  │  │
│  │   only, or thumbnail     │  │ Streams results to SvelteKit │  │
│  │   only, never both       │  │ Does NOT write to Lance      │  │
│  │                          │  │ (browser decides what to     │  │
│  │ Writes to Lance:         │  │  keep and when to save)      │  │
│  │ - Only on explicit save  │  └──────────────────────────────┘  │
│  │   from SvelteKit         │                                    │
│  │ - Or from batch pipelines │                                   │
│  └──────────────────────────┘                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Interactive inference flow (edit mode)

vLLM does NOT write to Lance during interactive use. The browser is the staging
area.

```
User triggers inference on a page:
  │
  SvelteKit API route receives request
  │
  ├─ Reads image from pages table (via Flight SQL)
  ├─ Sends image to vLLM
  │
  vLLM processes (HTR, classification, autolabeling, etc.)
  │
  vLLM streams results (native streaming, OpenAI-compatible)
  │
  SvelteKit wraps vLLM stream as SSE → browser
  │
  Browser receives each batch:
  ├─ Decodes Arrow IPC
  ├─ annotationStore.appendLocal(pageId, batch)  ← LOCAL only
  ├─ arrowPlugin.sync() → annotations appear on canvas incrementally
  │
  User reviews results in edit mode:
  ├─ Accepts some, rejects others
  ├─ Edits text, adjusts polygons
  ├─ All changes are LOCAL Arrow Table mutations
  │
  User clicks Save/Finish:
  ├─ annotationStore.save(pageId)
  ├─ Arrow IPC POST → SvelteKit → Flight SQL DoPut → Lance on S3
  └─ NOW it's in Lance. Not before.
```

### Batch inference flow (offline, no user in the loop)

For processing thousands of pages without interactive editing, batch pipelines
DO write directly to Lance:

```
Batch pipeline (Python):
  ├─ Read images from pages table
  ├─ Run vLLM inference
  ├─ Write results directly to annotations table
  │   (source="model:trocr-v2", status="prediction")
  └─ No user involved, no edit mode, no staging
```

The difference: interactive = user curates before saving. Batch = write
everything with `status="prediction"` and let reviewers curate later in the
browser.

---

## 5. Caching Architecture — Four Layers

This is the most important section for frontend performance.

### Layer 0: Lance fragment cache (NVMe, on Flight SQL server)

```
What:     .lance fragment files cached on local NVMe
Where:    Flight SQL server's local disk
Latency:  ~2ms hit vs ~200ms S3 miss
Managed:  Automatic by LanceDB
Shared:   Yes — all clients (SvelteKit, vLLM) benefit from same cache
Survives: Pod restarts of SvelteKit — the Flight SQL server is long-lived
```

This is the most important cache. It turns S3 reads into local disk reads.
Because all clients go through the Flight SQL server, the cache hit rate is high
— when SvelteKit reads annotations for page_042, the fragments are warm for when
vLLM reads the image for the same page.

### Layer 1: SvelteKit LRU cache (in-memory, per query)

```
What:     Serialized Arrow IPC response bytes
Where:    SvelteKit Node.js process memory
Key:      "ann:{pageId}" or "thumb:{datasetId}:{offset}"
Latency:  0ms hit
Config:   max: 1000 entries, ttl: 60 seconds
Memory:   ~5KB per annotation response × 1000 = ~5MB
Invalidated: On POST (save), entry deleted and re-fetched
```

This prevents repeated Flight SQL queries for the same page. If a user
refreshes, opens a second tab, or navigates back, the response is instant.

```typescript
// src/lib/server/cache.ts
import { LRUCache } from "lru-cache";

export const annotationCache = new LRUCache<string, Uint8Array>({
  max: 1000,
  ttl: 60_000,
});

export const thumbnailCache = new LRUCache<string, Uint8Array>({
  max: 100, // fewer entries, larger (thumbnails batch)
  ttl: 300_000, // 5 min — thumbnails change less often
});
```

### Layer 2: Browser Arrow Table cache (in-memory, parsed)

```
What:     Parsed Arrow Table objects
Where:    Browser memory (Map in AnnotationStore)
Key:      pageId
Latency:  0ms hit (no parsing, no network)
Evicted:  On save (replaced with fresh response), or on navigation away
Memory:   ~5KB per page × ~10 recent pages = ~50KB
```

When the user navigates between pages and comes back, the Arrow Table is already
parsed and ready. No network request, no IPC parsing.

### Layer 3: Browser HTTP image cache (disk, immutable)

```
What:     Full document images
Where:    Browser HTTP cache (standard, managed by browser)
Key:      /api/images/{pageId}
Latency:  0ms hit (no network at all)
TTL:      Infinite — Cache-Control: public, max-age=31536000, immutable
Size:     Whatever the browser allocates (typically GB)
Invalidated: Never — images don't change after ingest
```

This is the most impactful cache for perceived performance. A document image is
the largest asset (~1-5MB as JPEG/WebP). Once loaded, it's never fetched again.

```typescript
// Image route — immutable caching
export async function GET({ params }) {
  const table = await flight.execute(
    `SELECT image, mime_type FROM pages WHERE page_id = '${params.pageId}' LIMIT 1`,
  );
  return new Response(table.getChild("image")!.get(0) as Uint8Array, {
    headers: {
      "Content-Type": table.getChild("mime_type")!.get(0) as string,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

### Cache flow diagram

```
User opens page
  │
  ▼
Browser: do I have this Arrow Table in memory?
  ├─ YES → render immediately (Layer 2: 0ms)
  └─ NO → fetch /api/annotations/{pageId}
           │
           ▼
         SvelteKit: is it in the LRU cache?
           ├─ YES → return cached Arrow IPC (Layer 1: 0ms)
           └─ NO → query Flight SQL server
                    │
                    ▼
                  Flight SQL: are fragments on NVMe?
                    ├─ YES → read from NVMe (Layer 0: ~2ms)
                    └─ NO → read from S3 (~200ms), cache on NVMe
                    │
                    ▼
                  Return Arrow Table → SvelteKit serializes to IPC
                  → cache in LRU → return to browser
                  → browser parses → cache in Map → render

User opens same page again: Layer 2 → 0ms, instant.
Different user, same page: Layer 1 → 0ms, instant.
First access after server restart: Layer 0 → ~2ms (fragments warm).
First access ever: S3 → ~200ms (cold).


User opens image
  │
  ▼
Browser HTTP cache: have I seen this URL before?
  ├─ YES → use cached image (Layer 3: 0ms, no network)
  └─ NO → fetch /api/images/{pageId}
           │
           SvelteKit → Flight SQL → Lance image column → raw bytes
           │
           Browser caches with immutable header → never fetched again
```

### What is NOT cached

- **Inference results**: each run may use different models/params. Goes directly
  to the annotations table.
- **Save responses**: POST always hits Flight SQL, invalidates LRU, returns
  fresh data.
- **Cross-dataset aggregation stats**: cheap queries, change frequently as
  annotations are added. Not worth caching (stale data is worse than a 50ms
  query).

---

## 5b. Conditional Requests — ETag on Lance Version

ETags prevent unnecessary data transfer when nothing has changed. Lance tables
have a monotonically increasing version number. We use it as the ETag.

```typescript
// src/routes/api/annotations/[pageId]/+server.ts
export async function GET({ params, request }) {
  // Lance table version — increments on every write (append, update, delete)
  const version = await annotations.version();
  const etag = `"ann-${params.pageId}-v${version}"`;

  // If the browser already has this version, skip everything
  const clientEtag = request.headers.get("if-none-match");
  if (clientEtag === etag) {
    return new Response(null, { status: 304 });
  }

  // Otherwise, serve from LRU or query
  const key = `ann:${params.pageId}`;
  let ipc = annotationCache.get(key);

  if (!ipc) {
    const table = await flight.execute(/* ... */);
    ipc = RecordBatchStreamWriter.writeAll(table).toUint8Array();
    annotationCache.set(key, ipc);
  }

  return new Response(ipc, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
      "ETag": etag,
    },
  });
}
```

On the browser side, `fetch` sends `If-None-Match` automatically when
re-requesting a URL that previously had an ETag. If the Lance version hasn't
changed, the server returns 304 with no body — no data transfer, no parsing, no
rendering update.

This is cheaper than Rerun-style incremental chunk merging and uses standard
HTTP semantics that work with every cache layer (browser, CDN, reverse proxy).

```
Browser has annotations for page_042 (ETag: "ann-page_042-v157")
  │
  User navigates away and comes back
  │
  AnnotationStore cache has the Table → render immediately (0ms)
  │
  Background revalidation: fetch with If-None-Match: "ann-page_042-v157"
  │
  ├─ 304 Not Modified → data is current, done
  └─ 200 + new ETag → someone else edited, parse new Table, re-render
```

### When ETags invalidate

- `table.add()` (new annotations from inference or manual) → version increments
- `table.update()` (edit text, change status) → version increments
- `table.delete()` → version increments
- Column reads (queries) → version does NOT increment

One ETag covers the entire annotations table, not per-page. This means if
someone edits page_099, the ETag changes for page_042 too (false positive). The
cost is one unnecessary re-fetch (~5ms from LRU cache). At our scale this is
acceptable — the alternative is per-page version tracking which Lance doesn't
support natively.

---

## 5c. Incremental Cache Updates

### The question: full refetch or merge?

When the user adds 5 annotations to a page that already has 500, should we: A)
Re-query all 505 annotations from Lance (full refetch) B) Append the 5 new rows
to the cached Arrow Table locally (incremental merge)

### Answer: both, for different operations

**Local edits (user draws, edits, deletes) → incremental merge locally**

While the user is actively working, we don't hit the server on every action. The
browser maintains a local Arrow Table and mutates it directly:

```typescript
class AnnotationStore {
  private tables = new Map<string, Table>();
  private dirty = new Set<string>();

  async load(pageId: string): Promise<Table> {/* ... fetch from server */}

  // Local append — no server round trip
  appendLocal(pageId: string, newRow: Table) {
    const existing = this.tables.get(pageId);
    if (existing) {
      this.tables.set(pageId, existing.concat(newRow));
      this.dirty.add(pageId);
    }
  }

  // Local update — modify a row in the cached table
  updateLocal(pageId: string, rowIndex: number, updates: Record<string, any>) {
    // Build a new table with the updated row
    // (Arrow Tables are immutable — we create a new one with the change)
    const existing = this.tables.get(pageId);
    if (existing) {
      const updated = replaceRow(existing, rowIndex, updates);
      this.tables.set(pageId, updated);
      this.dirty.add(pageId);
    }
  }

  // Local delete — filter out a row
  deleteLocal(pageId: string, annotationId: string) {
    const existing = this.tables.get(pageId);
    if (existing) {
      const filtered = filterTable(existing, "id", (id) => id !== annotationId);
      this.tables.set(pageId, filtered);
      this.dirty.add(pageId);
    }
  }

  // Save to server — sends the dirty changes, gets fresh data back
  async save(pageId: string): Promise<Table> {
    const table = this.tables.get(pageId);
    if (!table) throw new Error("No table to save");

    const ipc = RecordBatchStreamWriter.writeAll(table).toUint8Array();
    const res = await fetch(`/api/annotations/${pageId}`, {
      method: "POST",
      headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
      body: ipc,
    });

    // Server returns authoritative fresh data
    const fresh = tableFromIPC(new Uint8Array(await res.arrayBuffer()));
    this.tables.set(pageId, fresh);
    this.dirty.delete(pageId);
    return fresh;
  }

  isDirty(pageId: string): boolean {
    return this.dirty.has(pageId);
  }
}
```

This gives Rerun-like immediacy — the user sees their annotation appear on
screen in the same frame they draw it. No server round trip until they
explicitly save.

**Server sync (save, inference results, other user edits) → full refetch**

When we need the authoritative state, we re-query the full page from Lance. This
is correct because:

- 500 annotations × ~10 bytes per row (projected float columns) = ~5KB
- Flight SQL query from NVMe cache = ~2ms
- Arrow IPC serialization = <1ms
- Total refetch cost: ~5ms

An incremental merge would save ~3ms of that. Not worth the complexity of:

- Tracking which rows were added/changed server-side
- Conflict resolution between local edits and server state
- Maintaining a diff protocol

**Summary**:

```
User draws annotation    → appendLocal() → instant (0ms, no server)
User edits text          → updateLocal() → instant (0ms, no server)
User deletes annotation  → deleteLocal() → instant (0ms, no server)
Inference streams result → appendLocal() → instant (0ms, no server, no Lance write)
User clicks Save/Finish  → save() → POST to server → full refetch (~100ms)
                           THIS is when Lance gets written
Background revalidation  → ETag check → 304 or full refetch
```

---

## 5d. Streaming — Inference Results and Thumbnails

### Streaming inference results (SSE + vLLM native streaming)

vLLM has native streaming support (OpenAI-compatible API). When it processes a
page for HTR, classification, autolabeling, segmentation, or any other task, it
can stream results as they're produced. We pipe that stream through SvelteKit as
SSE to the browser.

**Critical**: results go to the browser's LOCAL Arrow Table only. Nothing is
written to Lance until the user clicks Save/Finish. The browser is the staging
area.

```typescript
// src/routes/api/inference/[pageId]/+server.ts
export async function POST({ params, request }) {
  const { model, task } = await request.json();

  // Read image from Lance (via Flight SQL, cached)
  const imagePage = await flight.execute(
    `SELECT image FROM pages WHERE page_id = '${params.pageId}' LIMIT 1`,
  );
  const imageBytes = imagePage.getChild("image")!.get(0) as Uint8Array;

  // Call vLLM with streaming enabled — vLLM natively supports this
  const vllmResponse = await fetch(`${env.VLLM_URL}/v1/inference`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      task, // "htr" | "classification" | "autolabel" | "segmentation" | ...
      image: Buffer.from(imageBytes).toString("base64"),
      stream: true, // vLLM streams results as they're produced
    }),
  });

  // Pipe vLLM's stream as SSE to the browser
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = vllmResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          const result = JSON.parse(line.slice(6));

          // Convert vLLM result to Arrow IPC
          const ipc = resultToArrowIPC(result);
          const base64 = btoa(String.fromCharCode(...ipc));

          controller.enqueue(encoder.encode(
            `event: annotations\ndata: ${base64}\n\n`,
          ));
        }
      }

      controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

// Convert vLLM streaming result to Arrow IPC bytes
function resultToArrowIPC(result: any): Uint8Array {
  const table = tableFromArrays({
    id: [crypto.randomUUID()],
    x: new Float32Array([result.bbox?.x ?? 0]),
    y: new Float32Array([result.bbox?.y ?? 0]),
    width: new Float32Array([result.bbox?.width ?? 0]),
    height: new Float32Array([result.bbox?.height ?? 0]),
    polygon: [result.polygon ? new Float32Array(result.polygon) : null],
    text: [result.text ?? ""],
    label: [result.label ?? ""],
    confidence: new Float32Array([result.confidence ?? 0]),
    source: [`model:${result.model}`],
    status: ["prediction"],
  });
  return RecordBatchStreamWriter.writeAll(table).toUint8Array();
}
```

Browser side — annotations appear as vLLM produces them, all LOCAL:

```typescript
// InferencePlugin — streaming results into local staging
async runRemoteStreaming(model: string, task: string, pageId: string) {
  const response = await fetch(`/api/inference/${pageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, task }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      if (event.startsWith('event: done')) continue;
      if (!event.startsWith('event: annotations')) continue;

      const dataLine = event.split('\n').find(l => l.startsWith('data: '));
      if (!dataLine) continue;

      const binary = Uint8Array.from(atob(dataLine.slice(6)), c => c.charCodeAt(0));
      const batch = tableFromIPC(binary);

      // Append to LOCAL table — nothing written to Lance yet
      annotationStore.appendLocal(pageId, batch);
      arrowPlugin.load(annotationStore.get(pageId)!);
      arrowPlugin.sync();
      // → User sees new annotations appear on canvas in real-time
    }
  }

  // Inference complete. All results are LOCAL.
  // User now reviews, edits, accepts/rejects.
  // ONLY when user clicks Save/Finish → annotationStore.save(pageId) → Lance
}
```

The flow:

```
vLLM streams (native)
  → SvelteKit pipes as SSE
    → Browser decodes Arrow IPC
      → appendLocal() — LOCAL Arrow Table only
        → arrowPlugin.sync() — appears on canvas
          → User reviews, edits, deletes bad predictions
            → Still all LOCAL
              → User clicks Save/Finish
                → annotationStore.save(pageId)
                  → Arrow IPC POST → SvelteKit → Flight SQL DoPut
                    → NOW in Lance on S3
```

**Nothing touches Lance until the user is done.** This means:

- Interrupted inference doesn't leave garbage in the database
- User can discard all results (just navigate away without saving)
- User can cherry-pick which predictions to keep
- No cleanup needed if the model produces bad results

**Fallback for simple cases**: polling, for when SSE adds too much complexity:

```typescript
async runRemoteSimple(model: string, task: string, pageId: string) {
  // Non-streaming — wait for full result
  const res = await fetch(`/api/inference/${pageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, task, stream: false }),
  });
  const ipc = new Uint8Array(await res.arrayBuffer());
  const batch = tableFromIPC(ipc);

  // All results at once, still LOCAL only
  annotationStore.appendLocal(pageId, batch);
  arrowPlugin.load(annotationStore.get(pageId)!);
  arrowPlugin.sync();
  // User reviews → Save → Lance
}
```

### Streaming thumbnails (Arrow IPC chunked)

The dataset browser loads thumbnails for millions of images. SvelteKit can
stream Arrow IPC record batches as they arrive from Flight SQL:

```typescript
// src/routes/api/thumbnails/[datasetId]/+server.ts
export async function GET({ params, url }) {
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  // Stream Arrow IPC record batches — browser can render each batch as it arrives
  const stream = new ReadableStream({
    async start(controller) {
      const table = await flight.execute(
        `SELECT page_id, doc_id, page_num, width, height, thumbnail
         FROM pages WHERE dataset_id = '${params.datasetId}'
         LIMIT ${limit} OFFSET ${offset}`,
      );

      // Write each RecordBatch as a separate chunk
      for (const batch of table.batches) {
        const writer = RecordBatchStreamWriter.writeAll(
          new Table(batch.schema, [batch]),
        );
        controller.enqueue(writer.toUint8Array());
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
  });
}
```

Browser side — process chunks as they arrive:

```typescript
async function loadThumbnailsStreaming(datasetId: string, offset: number) {
  const res = await fetch(
    `/api/thumbnails/${datasetId}?limit=100&offset=${offset}`,
  );
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);

    // Try to parse available chunks — render what we have so far
    try {
      const combined = concatUint8Arrays(chunks);
      const table = tableFromIPC(combined);
      renderThumbnails(table); // show what we have
    } catch {
      // Incomplete IPC stream — wait for more chunks
    }
  }
}
```

This means the first row of thumbnails appears before the full 100 have loaded.

---

## 5e. Comparison with Rerun's Architecture

| Concern                 | Rerun                              | Our stack                                                     |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------- |
| Columnar storage        | Arrow chunks in .rrd               | Lance fragments on S3 (Arrow-native)                          |
| Column projection       | Per-component queries              | SELECT specific columns from Lance                            |
| Append-only writes      | `rr.log()` appends chunks          | `table.add()` writes new fragments                            |
| Zero-copy to renderer   | Arrow → wgpu (Rust)                | Arrow Float32Array → PixiJS (JS)                              |
| Incremental local cache | Merge new chunks into cached query | Local append/update/delete, full refetch on save              |
| Streaming ingestion     | Real-time log stream               | vLLM native streaming → SSE → local Arrow Table               |
| Local staging           | N/A (all data logged immediately)  | All edits + inference results LOCAL until Save                |
| Conditional fetch       | N/A (always streaming)             | ETag on Lance table version                                   |
| Wire format             | Custom .rrd with timeline metadata | Standard Arrow IPC + SSE                                      |
| Editing / annotation    | Not supported (view-only)          | Full drawing tools, review workflow                           |
| Model serving           | Not included                       | vLLM: HTR, classification, autolabel, segmentation, any model |
| Storage backend         | .rrd files or Rerun Cloud          | Lance on S3 (also the training data format)                   |

We match Rerun's architecture for the patterns that matter (columnar,
append-only, streaming, incremental rendering). We exceed it for annotation
workflows (drawing, review, status tracking). We use standard formats (Arrow
IPC, HTTP, SSE) instead of custom protocols (.rrd streaming).

---

## 6. SvelteKit ↔ Browser — Arrow over HTTP

### 6.1 Flight SQL client (server-side)

```typescript
// src/lib/server/flight.ts
import { FlightSQLClient } from "@gizmodata/gizmosql-client";

export const flight = new FlightSQLClient({
  host: env.FLIGHT_SQL_HOST,
  port: env.FLIGHT_SQL_PORT,
  tlsSkipVerify: true, // internal cluster
  username: env.FLIGHT_SQL_USER,
  password: env.FLIGHT_SQL_PASS,
});
```

### 6.2 LanceDB TS SDK (server-side, for lightweight ops)

```typescript
// src/lib/server/lance.ts
import * as lancedb from "@lancedb/lancedb";

export const db = await lancedb.connect("s3://bucket/lancedb", {
  storageOptions: {
    awsAccessKeyId: env.S3_ACCESS_KEY,
    awsSecretAccessKey: env.S3_SECRET_KEY,
    awsEndpoint: env.S3_ENDPOINT,
    awsRegion: env.S3_REGION,
  },
});
```

### 6.3 When to use which

| Operation                  | Client                  | Why                                        |
| -------------------------- | ----------------------- | ------------------------------------------ |
| GET annotations for a page | Flight SQL              | Hot path, needs warm fragment cache        |
| GET image for a page       | Flight SQL              | Large binary, cache matters                |
| GET thumbnails (batch)     | Flight SQL              | Batch read, cache matters                  |
| POST save annotations      | Flight SQL (DoPut)      | Write path, consistency                    |
| POST trigger inference     | Flight SQL (to vLLM)    | vLLM reads via Flight SQL too              |
| GET list datasets          | @lancedb/lancedb TS SDK | Lightweight metadata, cache doesn't matter |
| GET dataset stats          | @lancedb/lancedb TS SDK | Aggregate query, small result              |
| Dev/test/scripts           | @lancedb/lancedb TS SDK | No Flight SQL server needed                |

### 6.4 API routes

```typescript
// GET annotations — hot path through Flight SQL + LRU cache
export async function GET({ params }) {
  const key = `ann:${params.pageId}`;
  let ipc = annotationCache.get(key);

  if (!ipc) {
    const table = await flight.execute(
      `SELECT id, x, y, width, height, polygon, text, label,
              confidence, source, status, reviewer
       FROM annotations WHERE page_id = '${params.pageId}'`,
    );
    ipc = RecordBatchStreamWriter.writeAll(table).toUint8Array();
    annotationCache.set(key, ipc);
  }

  return new Response(ipc, {
    headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
  });
}

// GET image — hot path through Flight SQL, browser caches forever
export async function GET({ params }) {
  const table = await flight.execute(
    `SELECT image, mime_type FROM pages WHERE page_id = '${params.pageId}' LIMIT 1`,
  );
  return new Response(table.getChild("image")!.get(0) as Uint8Array, {
    headers: {
      "Content-Type": table.getChild("mime_type")!.get(0) as string,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// GET thumbnails — batch, through Flight SQL
export async function GET({ params, url }) {
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const table = await flight.execute(
    `SELECT page_id, doc_id, page_num, width, height, thumbnail
     FROM pages WHERE dataset_id = '${params.datasetId}'
     LIMIT ${limit} OFFSET ${offset}`,
  );

  return new Response(
    RecordBatchStreamWriter.writeAll(table).toUint8Array(),
    { headers: { "Content-Type": "application/vnd.apache.arrow.stream" } },
  );
}

// GET datasets — lightweight, direct TS SDK
export async function GET() {
  const docs = await db.openTable("documents");
  const result = await docs
    .query()
    .select(["dataset_id", "doc_type"])
    .toArrow();

  return new Response(
    RecordBatchStreamWriter.writeAll(result).toUint8Array(),
    { headers: { "Content-Type": "application/vnd.apache.arrow.stream" } },
  );
}

// POST save — always through Flight SQL, invalidate cache
export async function POST({ request, params }) {
  const buffer = await request.arrayBuffer();
  // DoPut to Flight SQL → Lance annotations table
  // ...

  annotationCache.delete(`ann:${params.pageId}`);

  const fresh = await flight.execute(
    `SELECT id, x, y, width, height, polygon, text, label,
            confidence, source, status, reviewer
     FROM annotations WHERE page_id = '${params.pageId}'`,
  );
  const freshIpc = RecordBatchStreamWriter.writeAll(fresh).toUint8Array();
  annotationCache.set(`ann:${params.pageId}`, freshIpc);

  return new Response(freshIpc, {
    headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
  });
}
```

### 6.5 Browser store

See Section 5c for the full `AnnotationStore` with local mutations
(`appendLocal`, `updateLocal`, `deleteLocal`) and server sync (`save`, `load`).
The store supports:

- Immediate local edits (0ms, no server round trip)
- Dirty tracking (knows which pages have unsaved changes)
- Full refetch on save (server returns authoritative state)
- Force refresh (for inference results and revalidation)

---

## 7. Frontend Architecture

### 7.1 Routes, load function, PixiCanvas, plugins

(Same as v0.5 — SSR page shell only, client-side data fetch after hydration,
plain plugin classes not PixiJS extensions. See v0.5 sections 7.1-7.5.)

### 7.2 Performance-critical rendering path

```
User opens page
  │
  ├─ onMount fires in parallel:
  │    ├─ PixiJS Application.init() (async, ~200ms for WebGPU adapter)
  │    └─ annotationStore.load(pageId) (async, 0-200ms depending on cache)
  │
  ├─ Both complete:
  │    ├─ arrowPlugin.load(table)   — stores reference, sets dirty flag
  │    ├─ arrowPlugin.sync()        — reads Float32Array columns, builds Graphics
  │    │    For 500 annotations:
  │    │    - table.getChild('x').toArray() → Float32Array (view, no copy)
  │    │    - table.getChild('polygon').get(i) → Float32Array per annotation
  │    │    - Graphics.poly() or Graphics.rect() per annotation
  │    │    - PixiJS batches into minimal GPU draw calls
  │    └─ imagePlugin.load(imageUrl) — PixiJS loads image, browser HTTP cache
  │
  ├─ Total time to annotations visible:
  │    Cache hit (all layers warm): ~200ms (just PixiJS init)
  │    Cache miss (cold start):     ~400ms (PixiJS init + S3 read)
  │
  User draws an annotation:
  │    AnnotationPlugin state machine → pointerdown/move/up
  │    → annotationStore.appendLocal(pageId, newRow)
  │    → arrowPlugin.load(updated table) → sync()
  │    Time: <16ms (one frame) — NO server round trip
  │
  User edits text in sidebar:
  │    → annotationStore.updateLocal(pageId, rowIndex, { text: '...' })
  │    → arrowPlugin re-syncs only if geometry changed
  │    Time: <1ms — NO server round trip
  │
  User clicks Save:
  │    → annotationStore.save(pageId)
  │    → Arrow IPC POST → SvelteKit → Flight SQL DoPut → S3
  │    → server returns fresh Arrow IPC (authoritative state)
  │    → arrowPlugin.sync() (full re-render from fresh data)
  │    Time: ~100ms (network + write + re-query)
  │
  User triggers server-side inference:
  │    → InferencePlugin.runRemoteStreaming(model, task, pageId)
  │    → SvelteKit pipes vLLM's native stream as SSE
  │    → As vLLM produces results:
  │        decode Arrow IPC from SSE event
  │        → annotationStore.appendLocal(pageId, batch) ← LOCAL only
  │        → arrowPlugin.sync() → new annotations appear on canvas
  │    → SSE done → all results are LOCAL
  │    → NO Lance write yet
  │    Time: first results visible in ~1-3s, streams until complete
  │
  User reviews inference results (still in edit mode):
  │    All predictions are local. User can:
  │    ├─ Accept (change status to 'accepted') → updateLocal()
  │    ├─ Reject (delete the row) → deleteLocal()
  │    ├─ Edit text/polygon → updateLocal()
  │    └─ Discard all (navigate away without saving → nothing in Lance)
  │
  User clicks Save/Finish:
  │    → annotationStore.save(pageId)
  │    → Arrow IPC POST → SvelteKit → Flight SQL DoPut → Lance on S3
  │    → NOW annotations exist in Lance
  │    → Server returns fresh Arrow IPC (authoritative)
  │    → Browser replaces local Table, dirty flag cleared
  │    Time: ~100ms
  │
  Background revalidation (when tab refocused):
  │    → fetch with If-None-Match: ETag
  │    ├─ 304 → data is current, no work
  │    └─ 200 → someone else edited, replace Table, re-render
```

---

## 8. Complete Data Flow

```
HCP S3
  │
  LanceDB (.lance fragments on S3)
  ├── documents    (doc metadata)
  ├── pages        (image + thumbnail as binary columns)
  └── annotations  (polygon + bbox + metadata, hundreds of millions of rows)
  │
  ┌─────────────────────────────────────────────────────┐
  │ Flight SQL Server                                    │
  │ (shared warm cache, NVMe fragment storage)           │
  │                                                      │
  │ ← SvelteKit queries annotations, images, thumbnails  │
  │ ← SvelteKit writes on explicit Save (DoPut)          │
  │ ← vLLM reads images for inference                    │
  │ ← Batch pipelines write directly (offline)           │
  └─────────────────────────────────────────────────────┘
         │                              │
    SvelteKit                        vLLM
    ├─ Flight SQL for hot path       ├─ Reads images via Flight SQL
    ├─ @lancedb/lancedb TS SDK       ├─ Streams results to SvelteKit
    │  for lightweight metadata      │  (native streaming, NOT to Lance)
    ├─ LRU cache (Arrow IPC)         └─ OpenAI-compatible API
    ├─ ETag conditional requests
    │
    HTTP (Arrow IPC + raw bytes + SSE)
    │
    Browser (THE staging area for all edits)
    ├─ AnnotationStore
    │   ├─ Map<pageId, Table> — LOCAL Arrow Tables
    │   ├─ appendLocal() — draws, inference results (no server)
    │   ├─ updateLocal() — text edits, status changes (no server)
    │   ├─ deleteLocal() — remove annotations (no server)
    │   ├─ dirty flag — tracks unsaved changes
    │   └─ save() — ONLY then: Arrow IPC POST → Lance on S3
    │
    ├─ PixiJS v8 (WebGPU → WebGL → Canvas)
    │   ├─ ImagePlugin:      /api/images/pageId → Sprite (immutable cache)
    │   ├─ ArrowDataPlugin:  Arrow columns → Graphics.poly() / rect()
    │   ├─ AnnotationPlugin: drawing tools → appendLocal()
    │   └─ InferencePlugin:  local (transformers.js) or remote (vLLM stream)
    │
    └─ Web Worker: transformers.js (WebGPU, Arrow IPC in/out → appendLocal)

    Everything is LOCAL until Save. Nothing touches Lance until the user decides.
```

---

## 9. Dependencies

| Layer           | Package                            | Role                                                |
| --------------- | ---------------------------------- | --------------------------------------------------- |
| Renderer        | `pixi.js` v8.17+                   | WebGPU/GL/Canvas scene graph                        |
| Data            | `apache-arrow` v21+                | Columnar format, IPC serialization                  |
| DB (hot path)   | `@gizmodata/gizmosql-client` v1.4+ | Flight SQL gRPC client (SvelteKit server)           |
| DB (light ops)  | `@lancedb/lancedb`                 | Direct Lance access for metadata (SvelteKit server) |
| DB (backend)    | `lancedb` (Python)                 | Flight SQL server + vLLM                            |
| Local inference | `@huggingface/transformers` v3+    | WebGPU model inference                              |
| Frontend        | `svelte` 5 / `@sveltejs/kit` 2     | UI + SSR                                            |
| Model serving   | `vllm`                             | Heavy GPU inference                                 |
| Storage         | HCP S3                             | Source of truth                                     |

### Why two DB clients in SvelteKit?

- **`@gizmodata/gizmosql-client`** (Flight SQL) for the hot path: annotation
  queries, image serving, saves. Goes through the Flight SQL server's warm NVMe
  cache.
- **`@lancedb/lancedb`** (direct) for cold/lightweight ops: list datasets,
  schema inspection, dev/test. Doesn't need the Flight SQL server's cache.

Both read the same `.lance` files. The Flight SQL server is not a different
database — it's a cache layer with query semantics.

### Risk: gizmosql-client

1 star, one contributor. Wrap in adapter interface. If it dies:

- Replace with `@lancedb/lancedb` TS SDK for everything (lose the warm cache
  benefit)
- Or implement a minimal Flight SQL gRPC client (the protocol is documented)

---

## 10. Open Questions

- [ ] **Lance scalar indices**: Need indices on `page_id`, `dataset_id`,
      `status`, `label`, `source` in annotations table for fast filtered queries
      at hundreds of millions of rows. Critical before production.

- [ ] **Virtual scroll**: Dataset browser with millions of images needs virtual
      scroll. Options: `@tanstack/svelte-virtual`, custom intersection observer.

- [ ] **Arrow version pinning**: `apache-arrow` TS must match between
      gizmosql-client and our code. Pin to same major version.

- [ ] **Flight SQL DoPut**: Verify bulk append works via gizmosql-client. May
      need raw gRPC calls.

- [ ] **SSE vs polling for inference**: SSE is cleaner but more complex. Start
      with polling (refetch every 2s), upgrade to SSE when the UX matters.

- [ ] **ETag granularity**: Lance version is per-table, not per-page. A write to
      any page invalidates all ETags. Monitor false-positive rate. If excessive,
      add a per-page version counter in a lightweight metadata table or use
      content hashing.

- [ ] **Arrow Table immutability in browser**: Arrow Tables are immutable. Local
      edits (appendLocal, updateLocal) create new Table objects. For 500
      annotations this is trivial. At 5000+ annotations per page, evaluate if
      the copy cost matters.

- [ ] **Multi-user editing**: Current design is single-user per page. ETag
      revalidation catches stale data on refocus. For real-time multi-user, add
      SSE-based invalidation.

- [ ] **Annotation import**: Label Studio export → Lance schema migration.

- [ ] **Keyboard shortcuts**: Critical for reviewer throughput at scale.

- [ ] **Flight SQL server sizing**: How much NVMe for fragment cache? Depends on
      working set size (how many unique pages are accessed per hour). Start with
      100GB NVMe, monitor cache hit rate.

- [ ] **Unsaved changes warning**: With local mutations (dirty flag), need
      `beforeunload` handler to warn user about unsaved changes. Also auto-save
      timer.

- [ ] **Undo/redo**: Stack of local Table snapshots. Arrow Tables are immutable
      so each undo state is just a reference. Memory cost: ~5KB per snapshot ×
      50 undo levels = ~250KB. Trivial.

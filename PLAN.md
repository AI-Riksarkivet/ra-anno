# Implementation Plan

## Current State (2025-03-25)

The client-side Arrow overlay store is solid. Field edits are O(1), reads are zero-copy where possible, delta saves minimize wire bytes. The server side is a mock — flat `.arrow` files with no concurrency, no persistence guarantees, no multi-user support.

## Phase 1: Fix What's Broken

Ship these before building new infrastructure. All changes to existing files.

### 1.1 Index Mapping Bug (correctness)

**Problem**: `_fieldOverrides` keys are materialized row indices, but `materializeTable()` reads them as base table indices. When rows are deleted, these diverge — the wrong row gets the edit applied.

**Fix**: Key overlays by **row ID** (the `id` column value) instead of numeric index. IDs are stable across deletions.

- `_fieldOverrides`: `Map<rowId, Map<field, value>>` instead of `Map<rowIndex, ...>`
- `getFieldValue()`: look up by ID → find row index → return value
- `updateLocal()` / `batchUpdateLocal()`: accept row ID, store by ID
- `materializeTable()`: look up overrides by each row's ID
- `deleteLocal()`: no index shifting needed — IDs are stable
- Pixi `ArrowDataPlugin`: keep a rowIndex→rowId mapping for `setFieldOverride`

### 1.2 Server Mutex Lock (data safety)

**Problem**: PATCH handler has TOCTOU race — concurrent requests can overwrite each other.

**Fix**: Per-page promise-chain mutex. Serializes writes per page, zero external deps.

```typescript
const locks = new Map<string, Promise<void>>();

async function withLock<T>(pageId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(pageId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(pageId, next.then(() => {}, () => {}));
  return next;
}
```

Wrap the entire PATCH handler body in `withLock(params.pageId, async () => { ... })`.

### 1.3 Fix Streaming Load (correctness + perf)

**Problem**: Current streaming path re-concatenates and re-parses the entire IPC buffer on every chunk (O(N^2) parsing).

**Fix**: Use Arrow's `RecordBatchReader` for true incremental parsing:

```typescript
const reader = await RecordBatchReader.from(fetch(`/api/annotations/${pageId}`));
const batches = [];
for await (const batch of reader) {
  batches.push(batch);
  // Optional: render first batch immediately for progressive loading
}
const table = new Table(reader.schema, batches);
```

Falls back to `tableFromIPC(await res.arrayBuffer())` for small responses.

### 1.4 Undo Coalescing (memory)

**Problem**: Every `updateLocal()` call clones the entire overlay state. Rapid edits (typing in a text field, bulk status changes) create huge undo stacks.

**Fix**: Command pattern + debounce.

- Store undo entries as `{ type, rowId, field, oldValue, newValue }` instead of full snapshots
- Coalesce: if the last undo entry is the same `(rowId, field)` and was pushed < 500ms ago, update its `newValue` instead of pushing a new entry
- Structural changes (append/delete) still use full snapshots since they're infrequent

## Phase 2: Infrastructure Foundation

Replace the mock file-based server with a real persistence layer.

### 2.1 Docker Compose Setup

```yaml
services:
  minio:
    image: minio/minio
    ports: ["9000:9000", "9001:9001"]
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    volumes: ["minio-data:/data"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  minio-data:
```

MinIO provides S3-compatible object storage for Lance. Redis provides pub/sub for multi-user sync.

### 2.2 Lance Service Layer

Replace `Deno.readFile` / `Deno.writeFile` with Lance operations.

**Read path**:
```
GET /api/annotations/:pageId
  → lance.open("s3://annotations/dataset")
  → dataset.filter(`page_id = '${pageId}'`)
  → RecordBatch stream → Arrow IPC response
  → ETag from dataset.version()
```

**Write path**:
```
PATCH /api/annotations/:pageId
  → lance.open("s3://annotations/dataset")
  → dataset.merge_insert("id", deltaTable)  ← atomic, no TOCTOU
  → version = dataset.version()
  → return new ETag
```

Lance handles:
- Atomic writes (single manifest update)
- Version history (time travel for compare view)
- Column pruning (only read needed columns)
- Fragment-based storage (appends don't rewrite everything)

### 2.3 DuckDB Query Layer (server-side)

For cross-page queries and aggregations, not per-page CRUD:

```sql
-- Dashboard: annotation counts per page
SELECT page_id, COUNT(*) as count,
       COUNT(*) FILTER (WHERE status = 'accepted') as accepted
FROM annotations GROUP BY page_id;

-- Search: find all annotations with label
SELECT * FROM annotations WHERE label LIKE '%paragraph%';

-- Export: all annotations for a dataset
SELECT * FROM annotations WHERE dataset_id = ?;
```

DuckDB reads Lance datasets natively via Arrow. No serialization overhead.

**Not needed for**: single-page load/save (Lance direct is sufficient).

### 2.4 Migrate API Routes

Replace mock handlers with Lance-backed implementations:

| Route | Before | After |
|-------|--------|-------|
| `GET /api/annotations/:pageId` | `Deno.readFile` | `lance.dataset.filter().toArrow()` |
| `PATCH /api/annotations/:pageId` | read → merge → write (TOCTOU) | `dataset.merge_insert("id")` (atomic) |
| `POST /api/annotations/:pageId` | `Deno.writeFile` | `dataset.overwrite()` |
| `GET /api/pages/:pageId` | `Deno.readFile` | MinIO `getObject` |

## Phase 3: Multi-User

### 3.1 Redis Pub/Sub + SSE

When a user saves, the server publishes:
```
PUBLISH page:page-001 {"version": 5, "changedIds": ["ann-1", "ann-7"], "user": "alice"}
```

Other clients connected via Server-Sent Events receive this and:
- **No local changes**: auto-reload the page's annotations
- **Has unsaved edits on different rows**: auto-merge (their changes + new server state)
- **Has unsaved edits on same rows**: show conflict UI

### 3.2 3-Way Merge on 409

When the client gets a 409 Conflict:

```
base   = _serverTables[pageId]     (what both users started from)
theirs = 409 response body          (server's current state)
mine   = materialized table         (my local changes)

For each row (by ID):
  if base[id] == mine[id]  → take theirs  (I didn't change it)
  if base[id] == theirs[id] → take mine   (they didn't change it)
  if mine[id] != theirs[id] → CONFLICT    (both changed → UI prompt)
```

Auto-resolved rows get applied as new overlays. Conflicting rows show a side-by-side diff UI.

### 3.3 Effect TS Service Layer

Wrap Lance + DuckDB + Redis in typed, composable services:

```typescript
const saveAnnotations = (pageId: string, delta: Table) =>
  Effect.gen(function* () {
    const lance = yield* LanceService;
    const redis = yield* RedisService;

    const version = yield* lance.mergeInsert(pageId, delta);
    yield* redis.publish(`page:${pageId}`, { version });

    return version;
  }).pipe(
    Effect.retry(Schedule.exponential("100 millis")),
    Effect.timeout("10 seconds"),
    Effect.tapError(e => Telemetry.recordError(e))
  );
```

Gives you: retries, timeouts, dependency injection, telemetry, testability.

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Arrow IPC as wire format | Zero-copy on client for Float32 geometry, compact binary |
| Overlay pattern (WAL-like) | Avoids O(N) table rebuild on every edit |
| Field edits skip rematerialize | O(1) via `getFieldValue()` overlay check |
| Delta saves (PATCH) | Only send changed rows, not entire table |
| Row ID keying (planned) | Indices shift on delete; IDs are stable |
| Lance for persistence | Atomic merge_insert, versioning, column pruning |
| DuckDB for queries | SQL on Arrow, cross-page aggregations |
| Redis for sync | Pub/sub for real-time multi-user awareness |
| Effect TS for services | Typed error handling, retries, DI, telemetry |

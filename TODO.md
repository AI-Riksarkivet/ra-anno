# TODO — RA Annotation Platform

## Architecture

### Data Flow

```
┌─ Client (Svelte + Pixi) ────────────────────────────────────┐
│                                                               │
│  Arrow Table (immutable, from Flight SQL)                     │
│       ↕ zero-copy Float32Array views                          │
│  Pixi renderer (per-group Containers)                         │
│       ↕                                                       │
│  Dirty overlay: Map<rowIndex, geometry> (instant, no rebuild) │
│  Field edits: tableFromArrays rebuild (client-side only)      │
│  Undo stack: Arrow table references (zero-copy swap)          │
│                                                               │
│  Ctrl+S → save to server session (fast, Redis)                │
│  "Sync Project" → commit to Lance (batched, 1 txn)            │
└──────────────────────┬────────────────────────────────────────┘
                       │ Arrow IPC (delta rows only)
                       ↓
┌─ Server (Deno + SvelteKit) ──────────────────────────────────┐
│                                                               │
│  Session saves → Redis hash (per-user, per-page deltas)       │
│  Project sync → collect all session deltas → single Lance txn │
│  Reads → Redis cache (Arrow IPC bytes, keyed by version)      │
│       ↕ Arrow Flight SQL (gRPC, streaming RecordBatches)      │
└──────────────────────┬────────────────────────────────────────┘
                       │
                       ↓
┌─ Lance DB on S3 (MinIO) ─────────────────────────────────────┐
│                                                               │
│  s3://annotations/datasets/{id}/                              │
│    ├── _versions/           ← manifest per commit (MVCC)      │
│    ├── data/                ← columnar Arrow fragments         │
│    └── _latest.manifest     ← current version pointer          │
│                                                               │
│  Properties:                                                  │
│  • Arrow-native columnar (zero ser/de between layers)         │
│  • MVCC: readers see consistent snapshots                     │
│  • merge_insert("id"): atomic upsert by annotation ID        │
│  • Version counter: monotonic, used for OCC                   │
│  • Time travel: dataset.checkout(version=N)                   │
│  • Distributed write: parallel fragment writes + single commit│
└───────────────────────────────────────────────────────────────┘
```

### Two-Tier Save Model

Small per-annotation saves are wasteful against Lance (each creates a new manifest + S3 PutObject). Instead:

| Tier | Trigger | Storage | Cost | Survives |
|------|---------|---------|------|----------|
| **Client edits** | Every keystroke/drag | JS Map + Arrow table (memory) | Zero I/O | Tab only |
| **Session save** (Ctrl+S) | User action | Redis hash `session:{userId}:{pageId}` | Sub-ms (in-memory) | Page refresh, tab close |
| **Project sync** | Explicit button / session end | Lance `merge_insert` (1 txn, 1 manifest) | ~100ms (S3 write) | Permanent, versioned |

One annotator editing 200 annotations across 5 pages = **1 Lance write** (not 200).

### Conflict Detection (Optimistic Concurrency Control)

Arrow IPC has no concurrency guarantees — it's just bytes. Lance provides ACID via MVCC. Conflicts are detected at the application layer:

```
READ:   GET /api/annotations/page-001
        Response: Arrow IPC + X-Lance-Version: 5

WRITE:  PATCH /api/annotations/page-001
        Request: Arrow IPC (delta) + If-Match: "v5"
        Server: current_version == 5? → commit → version 6
                current_version == 6? → 409 Conflict + diff

RESOLVE: Client shows: "Alice changed X. You changed X. Which one?"
```

Redis is NOT required for correctness — it's a read cache only. If Redis dies, reads go straight to Lance.

**Simpler alternative**: Partition by assignment (annotator A gets pages 1-50, B gets 51-100). No conflict possible by design. This is what most annotation platforms do.

### Lance Write Patterns

From Lance docs — the patterns we'll use:

```python
# Project sync: upsert changed annotations
dataset.merge_insert("id") \
       .when_matched_update_all() \
       .when_not_matched_insert_all() \
       .execute(delta_arrow_table)

# Distributed: parallel fragment writes from multiple workers
fragments = write_fragments(data, uri, schema=schema)  # per worker
op = LanceOperation.Append(all_fragments)              # single commit
LanceDataset.commit(uri, op, read_version=current_version)
```

### Flight SQL Client

Reference: `@lancedb/arrow-flight-sql` (TypeScript, gRPC):
- `FlightSqlClient.connect(host, user, pass)` → authenticated client
- `client.statementQuery({ query: sql })` → `RecordBatchStream` (async iterator)
- Schema decoded from FlightInfo, data streamed via `doGet`
- Arrow IPC on the wire — same format we already use client-side

---

## Roadmap

### Data Layer

- [ ] **Arrow Flight SQL server** — replace mock `/api/annotations` with Flight SQL streaming RecordBatches. Options: Python sidecar (LanceDB + Flight SQL), Rust sidecar, or `@lancedb/arrow-flight-sql` TS client against a Flight SQL-compatible DB
- [ ] **Lance DB integration** — S3-backed storage. `merge_insert("id")` for upserts, `read_version` for OCC, `checkout(version)` for time-travel
- [ ] **Two-tier save** — Ctrl+S saves to Redis session (fast). "Sync Project" batches all session deltas into single Lance commit. Server collects `session:{userId}:*` keys → merges → one `merge_insert` call
- [ ] **Delta writes** — client sends only changed rows (PATCH with `If-Match` version header), not full table. Server upserts delta into Lance
- [ ] **OCC conflict detection** — `If-Match: "vN"` header on writes. Server compares against `dataset.version`. Return 409 + conflicting rows on mismatch
- [ ] **Redis cache** — read cache for Arrow IPC bytes (key = `page_id:lance_version`). Invalidate on project sync. Optional — not required for correctness
- [ ] **MinIO for S3** — docker-compose for local dev. Store Lance datasets + document images. Test read/write paths

### Auth & Project Management

- [ ] **Auth stack** — decide: better-auth + drizzle + postgres (lightweight) OR Keycloak OIDC (enterprise SSO)
- [ ] **Drizzle + Postgres** — schema for users, projects, datasets, documents, pages, assignments
- [ ] **RBAC** — roles: admin, annotator, reviewer, viewer. Per-project permissions
- [ ] **Assignment system** — assign pages to annotators (conflict avoidance > conflict resolution)
- [ ] **Project management UI** — dataset browser, annotation assignment, review workflows, progress tracking

### DX & Tooling

- [ ] **Deno 2.7 upgrade** — workspaces, improved npm compat, new APIs
- [ ] **SvelteKit template** — opinionated scaffolding: Deno 2.7 + SvelteKit 2 + Tailwind v4 + shadcn-svelte + better-auth + drizzle (Ben Davis approach)
- [ ] **Effect TS evaluation** — replace valibot for validation + typed errors + async pipelines? Assess learning curve vs benefit
- [ ] **Telemetry** — OpenTelemetry for server traces + structured logging. Client perf metrics (sync time, render time, load time)

### Viewer Improvements

- [ ] **Extract pixi package** — `src/lib/pixi/` is self-contained (zero upward deps). Publish as `@ra/viewer`
- [ ] **Move `geometry.ts` to `utils/`** — pure math, shouldn't live under pixi path
- [ ] **Barrel export `src/lib/pixi/index.ts`** — clean public API
- [ ] **Virtual scrolling** — annotation list for 10k+ annotations
- [ ] **Rect select tool** — complement to lasso
- [ ] **Annotation search** — full-text search in transcription text

### Data Format

- [ ] **Schema metadata round-trip** — preserve `table.schema.metadata` through `tableFromArrays` rebuilds (currently lost on any `updateLocal` call)
- [ ] **Dictionary encoding** — string columns (label, status, group) for better compression
- [ ] **Version tracking** — `lance_version` stored per-page in client, sent as `If-Match` on sync
- [ ] **`updated_at` / `updated_by` columns** — per-annotation audit trail

---

## Decision Log

| Decision | Status | Notes |
|----------|--------|-------|
| Arrow as wire format | **Decided** | End-to-end: client ↔ server ↔ storage. Zero ser/de boundaries |
| Lance for storage | **Proposed** | MVCC + S3-native + Arrow-columnar. Alt: DuckDB + Parquet |
| Two-tier save model | **Decided** | Session saves (Redis) + project sync (Lance). Avoids many small Lance writes |
| OCC for conflicts | **Decided** | `If-Match` version header + Lance `read_version`. Assignment-based partitioning as simpler alternative |
| Pixi v8 for rendering | **Decided** | WebGPU-ready, per-group Containers for layer visibility |
| Dirty overlay pattern | **Decided** | `Map<index, geometry>` for edits, flush to Arrow on save |
| LayerStore via context | **Decided** | No singleton — Svelte context injection for reusability |
| Auth stack | **Open** | better-auth vs Keycloak — needs team discussion |
| Effect TS | **Open** | Evaluate vs keeping valibot — needs prototype |
| Flight SQL client | **Open** | `@lancedb/arrow-flight-sql` (TS/gRPC) vs Python sidecar |

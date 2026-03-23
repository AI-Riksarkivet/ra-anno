# TODO — RA Annotation Platform

## Architecture

```
Client (Svelte + Pixi)
  ↕ Arrow IPC stream
Server (Deno + SvelteKit)
  ↕ Arrow Flight SQL
Redis (cache hot pages)
  ↕
Lance DB (MVCC, S3-native, Arrow-columnar)
  ↕
MinIO / S3 (object storage for data + images)
```

## Roadmap

### Data Layer

- [ ] **Arrow Flight SQL server** — replace mock `/api/annotations` with real Flight SQL streaming RecordBatches. Evaluate: [arrow-flight-sql-deno](https://github.com/pola-rs/arrow-flight-sql) or Python/Rust sidecar
- [ ] **Lance DB integration** — S3-backed Arrow-native storage with MVCC versioning, upsert by annotation `id`, atomic commits, time-travel undo
- [ ] **Delta writes** — client sends only changed rows (PATCH), not full table (POST). Server upserts into Lance. Extract `deltaTable` from dirty overlay indices
- [ ] **Redis cache** — cache Arrow IPC bytes per page (key = `page_id:lance_version`). Invalidate on write. Evaluate: Upstash or self-hosted
- [ ] **MinIO for S3** — docker-compose for local dev. Store document images + Lance datasets. Test read/write paths

### Auth & Project Management

- [ ] **Auth stack** — decide: better-auth + drizzle + postgres (lightweight) OR Keycloak OIDC (enterprise SSO). Implement session management, JWT tokens
- [ ] **Drizzle + Postgres** — schema for users, projects, datasets, documents, pages. Migrations
- [ ] **RBAC** — roles: admin, annotator, reviewer, viewer. Per-project permissions
- [ ] **Project management UI** — dataset browser, annotation assignment, review workflows, progress tracking

### DX & Tooling

- [ ] **Deno 2.7 upgrade** — workspaces, improved npm compat, new APIs
- [ ] **SvelteKit template** — opinionated scaffolding: Deno 2.7 + SvelteKit 2 + Tailwind v4 + shadcn-svelte + better-auth + drizzle. Ben Davis approach
- [ ] **Effect TS evaluation** — replace valibot for validation + typed errors + async pipelines? Assess learning curve vs benefit
- [ ] **Telemetry** — OpenTelemetry for server traces + structured logging. Client-side perf metrics (sync time, render time, load time)

### Viewer Improvements

- [ ] **Extract pixi package** — `src/lib/pixi/` is already self-contained (zero upward deps). Publish as `@ra/viewer` npm package
- [ ] **Move `geometry.ts` to `utils/`** — pure math, shouldn't live under pixi path. Removes the one cross-layer import
- [ ] **Barrel export `src/lib/pixi/index.ts`** — clean public API: `PixiCanvas`, `ArrowDataPlugin`, types
- [ ] **Virtual scrolling** — annotation list for 10k+ annotations
- [ ] **Rect select tool** — drag a rectangle to select all annotations inside (complement to lasso)
- [ ] **Annotation search** — full-text search across transcription text, jump to result on canvas

### Data Format

- [ ] **Page metadata round-trip** — Arrow schema metadata (`table.schema.metadata`) must survive `tableFromArrays` rebuilds during edits. Currently lost on any `updateLocal` call. Options: preserve metadata in store, or read from original table
- [ ] **Dictionary encoding** — string columns (label, status, group) should use Arrow dictionary encoding for better compression and faster equality checks
- [ ] **Annotation versioning** — per-annotation `updated_at` timestamp + `version` counter for conflict detection

## Decision Log

| Decision | Status | Notes |
|----------|--------|-------|
| Arrow as wire format | **Decided** | End-to-end: client ↔ server ↔ storage |
| Lance for storage | **Proposed** | MVCC + S3-native + Arrow-columnar. Alternative: DuckDB + Parquet |
| Pixi v8 for rendering | **Decided** | WebGPU-ready, per-group Containers for layer visibility |
| Dirty overlay pattern | **Decided** | Map<index, geometry> for edits, flush to Arrow on save |
| LayerStore via context | **Decided** | No singleton — Svelte context injection for reusability |
| Auth stack | **Open** | better-auth vs Keycloak — needs team discussion |
| Effect TS | **Open** | Evaluate vs keeping valibot — needs prototype |

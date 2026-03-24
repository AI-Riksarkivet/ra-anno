# DuckDB-WASM + Arrow in SvelteKit

DuckDB-WASM runs SQL queries in the browser and returns Apache Arrow RecordBatches. This enables SQL-powered analytics directly in SvelteKit without a server.

## Setup (SvelteKit + Vite)

```typescript
// src/lib/duckdb.ts
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url"
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url"
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url"
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url"
import type { AsyncDuckDB, DuckDBBundles } from "@duckdb/duckdb-wasm"
import { browser } from "$app/environment"

let db: AsyncDuckDB | null = null

export async function instantiateDuckDb(): Promise<AsyncDuckDB> {
  if (!browser) throw new Error("DuckDB-WASM is browser-only")
  if (db) return db

  const duckdb = await import("@duckdb/duckdb-wasm")

  const BUNDLES: DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
    eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
  }

  const bundle = await duckdb.selectBundle(BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  const logger = new duckdb.ConsoleLogger()
  db = new duckdb.AsyncDuckDB(logger, worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  return db
}
```

## Key: DuckDB returns Arrow

DuckDB-WASM query results ARE Apache Arrow Tables. The `conn.query()` method returns an Arrow Table directly:

```typescript
const conn = await db.connect()

// Result is an Arrow Table — iterate rows, access columns
const result = await conn.query(`SELECT * FROM data WHERE score > 0.5`)

// Arrow row iteration
for (const row of result) {
  console.log(row.name, row.score)
}

// Arrow column access (zero-copy typed arrays)
const scores = result.getChild("score")!.toArray() as Float64Array

// Arrow table properties
console.log(result.numRows, result.numCols, result.schema)
```

## Loading Parquet files

```typescript
// From static assets
await db.registerFileURL("data.parquet", "/data.parquet", 4, false)
const conn = await db.connect()
await conn.query(`CREATE TABLE data AS SELECT * FROM parquet_scan('data.parquet')`)

// From fetch/URL
await db.registerFileURL("remote.parquet", "https://example.com/data.parquet", 4, false)

// From Uint8Array
await db.registerFileBuffer("inline.parquet", parquetBytes)
```

## Loading Arrow IPC files

```typescript
// DuckDB can read Arrow IPC directly
await db.registerFileBuffer("data.arrow", arrowIpcBytes)
const result = await conn.query(`SELECT * FROM 'data.arrow'`)
```

## SvelteKit Integration Pattern

```typescript
// +page.ts — disable SSR for browser-only DuckDB
export const ssr = false
export const prerender = true  // optional: static site

// +page.svelte (Svelte 5)
<script lang="ts">
  import { instantiateDuckDb } from "$lib/duckdb"

  let results = $state<any[]>([])
  let loading = $state(true)

  async function init() {
    const db = await instantiateDuckDb()
    const conn = await db.connect()
    await db.registerFileURL("data.parquet", "/data.parquet", 4, false)

    const table = await conn.query(`
      SELECT name, score FROM parquet_scan('data.parquet')
      WHERE score > 0.5 ORDER BY score DESC
    `)

    results = table.toArray()  // Arrow Table → JS objects
    loading = false
  }

  init()
</script>
```

## Arrow ↔ DuckDB bridge

Since DuckDB returns Arrow, you can use it as a query engine over Arrow data:

```typescript
import { tableToIPC, tableFromIPC } from "apache-arrow"

// Load Arrow IPC into DuckDB
const ipcBytes = tableToIPC(myArrowTable, "stream")
await db.registerFileBuffer("annotations.arrow", ipcBytes)

// Query with SQL
const filtered = await conn.query(`
  SELECT * FROM 'annotations.arrow'
  WHERE confidence > 0.8
  ORDER BY x, y
`)

// Result is Arrow Table — use directly or convert
const filteredIpc = tableToIPC(filtered, "stream")
```

## Performance notes

- DuckDB-WASM bundle is ~5MB (MVP) or ~10MB (EH with exception handling)
- First load takes 1-2s to initialize the WASM module
- Use `selectBundle()` to pick the best bundle for the browser
- Parquet files are read lazily — only requested columns/rows are fetched
- Arrow result tables are zero-copy — no serialization overhead
- Always use `ssr: false` in SvelteKit for DuckDB pages

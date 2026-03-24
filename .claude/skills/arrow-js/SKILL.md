---
name: Apache Arrow JS
description: This skill should be used when working with Apache Arrow in JavaScript/TypeScript — Table, Vector, Schema, IPC serialization, columnar data, RecordBatch, Flight SQL, Flechette, Arquero, Mosaic, DuckDB-WASM, or imports from 'apache-arrow', '@uwdata/flechette', '@uwdata/vgplot', 'arquero'. Covers zero-copy patterns, typed arrays, builder API, Arrow Flight, and the Arrow JS ecosystem.
user-invocable: true
context: current
---

# Apache Arrow JS (v21+)

Columnar in-memory data format for high-performance analytics in JavaScript/TypeScript.

## Core Concepts

Arrow stores data in **columns** (Vectors), not rows. A **Table** is a collection of named Vectors sharing a Schema. Data is stored as flat **TypedArrays** — no per-row object allocation, zero-copy slicing, and direct GPU/WASM interop.

```
Table (Schema + RecordBatches)
  ├── Vector<Int32>     "id"      → Int32Array
  ├── Vector<Utf8>      "name"    → Uint8Array (UTF-8 bytes) + offsets
  └── Vector<Float32>   "score"   → Float32Array
```

## Creating Tables

### From JS arrays (copies data, infers types)

```typescript
import { tableFromArrays } from "apache-arrow"

const table = tableFromArrays({
  id: [1, 2, 3],
  name: ["Alice", "Bob", "Carol"],
  score: new Float32Array([0.9, 0.7, 0.85]),
})
```

### From typed arrays (zero-copy)

```typescript
import { makeTable } from "apache-arrow"

const table = makeTable({
  x: new Float32Array([10, 20, 30]),
  y: new Float32Array([40, 50, 60]),
})
```

### From JSON objects

```typescript
import { tableFromJSON } from "apache-arrow"

const table = tableFromJSON([
  { a: "foo", b: 42 },
  { a: "bar", b: 12 },
])
```

### From IPC binary (deserialization)

```typescript
import { tableFromIPC } from "apache-arrow"

// From Uint8Array
const table = tableFromIPC(bytes)

// From fetch Response (async)
const table = await tableFromIPC(fetch("/data.arrow"))

// From multiple IPC chunks
const table = tableFromIPC([schemaBytes, recordBytes])
```

### With explicit Schema

```typescript
import { Table, Schema, Field, Float32, Utf8, tableFromArrays } from "apache-arrow"

const schema = new Schema([
  new Field("x", new Float32()),
  new Field("label", new Utf8()),
])

// Schema can carry metadata (Map<string, string>)
const schemaWithMeta = new Schema(fields, new Map([
  ["image_base64", base64String],
  ["page_id", "page-001"],
]))
```

## Serializing Tables

```typescript
import { tableToIPC } from "apache-arrow"

// Stream format (default — for network transfer)
const bytes: Uint8Array = tableToIPC(table, "stream")

// File format (for storage — has random access footer)
const bytes: Uint8Array = tableToIPC(table, "file")
```

## Reading Tables

### Column access

```typescript
const col = table.getChild("name")       // Vector<Utf8> | null
const col2 = table.getChildAt(0)         // Vector by index
const arr = col.toArray()                // TypedArray (zero-copy for primitives)
```

### Row access

```typescript
const row = table.get(0)                 // StructRowProxy (object-like)
const row2 = table.at(-1)               // Negative index support
console.log(row.name, row.score)        // Property access

// Iterate all rows
for (const row of table) {
  console.log(row.id, row.name)
}
```

### Table properties

```typescript
table.numRows     // number of rows
table.numCols     // number of columns
table.schema      // Schema with fields + metadata
table.batches     // RecordBatch[] chunks
table.nullCount   // total nulls across all columns
```

### Slicing & selecting (zero-copy)

```typescript
const subset = table.slice(10, 20)              // rows 10-19
const projected = table.select(["name", "score"]) // column subset
const combined = table.concat(otherTable)        // append rows
const merged = table.assign(extraColumns)        // add columns
```

### Modifying columns

```typescript
// Returns NEW table (immutable)
const updated = table.setChild("name", newNameVector)
const replaced = table.setChildAt(0, newVector)
```

## Vectors

### Creating Vectors

```typescript
import { makeVector, vectorFromArray } from "apache-arrow"

// Zero-copy from TypedArray
const v = makeVector(new Float32Array([1, 2, 3]))

// From JS array (copies, infers type)
const nums = vectorFromArray([1, 2, 3])           // Float64
const ints = vectorFromArray([1, 2, 3], new Int8)  // Int8
const strs = vectorFromArray(["a", "b", "c"])      // Dictionary<Utf8, Int32>
const bools = vectorFromArray([true, false])       // Bool
const dates = vectorFromArray([new Date()])        // TimestampMillisecond
const structs = vectorFromArray([{x: 1}, {x: 2}]) // Struct
```

### Vector API

```typescript
vector.get(0)           // T["TValue"] | null
vector.at(-1)           // negative index
vector.set(0, value)    // mutate in place
vector.isValid(0)       // null check
vector.length           // element count
vector.nullCount        // null count
vector.type             // DataType instance
vector.toArray()        // TypedArray or JS Array
vector.slice(0, 10)     // zero-copy sub-vector
vector.indexOf(value)   // find index
vector.includes(value)  // containment check

// Memoize decoded values (useful for Utf8 — caches string decode)
const memo = vector.memoize()
const original = memo.unmemoize()
```

### Dictionary Vectors (string encoding)

```typescript
import { makeVector, vectorFromArray, Dictionary, Utf8, Uint8 } from "apache-arrow"

// Auto-dictionary from string array
const dict = vectorFromArray(["foo", "bar", "foo", "baz"])

// Manual dictionary construction
const keys = vectorFromArray(["foo", "bar", "baz"], new Utf8)
const dictVec = makeVector({
  data: [0, 1, 2, 0, 1],  // indices into dictionary
  dictionary: keys,
  type: new Dictionary(new Utf8, new Uint8),
})
```

## Builder API

For constructing Vectors incrementally:

```typescript
import { makeBuilder, Utf8 } from "apache-arrow"

const builder = makeBuilder({
  type: new Utf8(),
  nullValues: [null, "n/a"],  // values treated as null
})

builder.append("hello")
builder.append("n/a")    // becomes null
builder.append("world")
builder.append(null)      // null

const vector = builder.finish().toVector()
// ["hello", null, "world", null]
```

### Chunked building with iterables

```typescript
import { builderThroughIterable, Float64 } from "apache-arrow"

const through = builderThroughIterable({
  type: new Float64(),
  highWaterMark: 1000,
  queueingStrategy: "count",
})

// Feed values, get chunked Vectors
for (const vector of through(valueIterator)) {
  // each vector has up to 1000 elements
}
```

## Schema & Metadata

```typescript
import { Schema, Field, Float32, Utf8 } from "apache-arrow"

// Schema with metadata
const schema = new Schema(
  [new Field("x", new Float32()), new Field("label", new Utf8())],
  new Map([["version", "1"], ["author", "system"]])
)

// Read metadata
const meta = table.schema.metadata  // Map<string, string>
const version = meta.get("version")

// Preserve metadata when rebuilding tables
const newSchema = new Schema(newFields, existingTable.schema.metadata)
const newTable = new Table(newSchema, newBatches)
```

## RecordBatch Reader/Writer

### Reading IPC streams

```typescript
import { RecordBatchReader } from "apache-arrow"

// From various sources
const reader = await RecordBatchReader.from(uint8Array)
const reader = await RecordBatchReader.from(fetch("/data.arrow"))
const reader = await RecordBatchReader.from(readableStream)

for (const batch of reader) {
  console.log(batch.numRows, batch.schema)
}
```

### Writing IPC streams

```typescript
import { RecordBatchWriter } from "apache-arrow"

const writer = new RecordBatchWriter()
writer.write(table)
writer.finish()

// Get bytes
const bytes = writer.toUint8Array(true)  // sync

// Stream to DOM ReadableStream
const stream = writer.toDOMStream()
```

## Data Types Reference

| Arrow Type | JS Type | TypedArray |
|-----------|---------|------------|
| `Int8/16/32` | `number` | `Int8/16/32Array` |
| `Uint8/16/32` | `number` | `Uint8/16/32Array` |
| `Int64/Uint64` | `bigint` | `BigInt64/BigUint64Array` |
| `Float16/32/64` | `number` | `Uint16/Float32/Float64Array` |
| `Bool` | `boolean` | `Uint8Array` (bit-packed) |
| `Utf8` | `string` | `Uint8Array` + offsets |
| `Binary` | `Uint8Array` | `Uint8Array` + offsets |
| `List<T>` | `T[]` | nested Vector |
| `Struct<{...}>` | `StructRowProxy` | nested Vectors |
| `Dictionary<V,K>` | `V["TValue"]` | key array + dictionary Vector |
| `Timestamp*` | `number` | `Int32Array` (pair) |
| `Date*` | `number` | `Int32Array` |
| `Null` | `null` | (no buffer) |

### Type guards

```typescript
import { DataType } from "apache-arrow"

DataType.isFloat(field.type)   // true for Float16/32/64
DataType.isInt(field.type)     // true for all Int types
DataType.isUtf8(field.type)
DataType.isList(field.type)
DataType.isStruct(field.type)
DataType.isDictionary(field.type)
// ... etc for all types
```

## Performance Patterns

### Zero-copy column access

```typescript
// FAST: Direct typed array view (zero allocation for single-chunk primitives)
const xArr = table.getChild("x")!.toArray() as Float32Array

// SLOW: Row iteration (allocates proxy objects)
for (const row of table) { /* avoid in hot loops */ }
```

### Avoid per-row allocation

```typescript
// SLOW
const results = []
for (let i = 0; i < table.numRows; i++) {
  results.push(table.get(i))  // allocates StructRowProxy each time
}

// FAST: Column-oriented access
const xArr = table.getChild("x")!.toArray() as Float32Array
const yArr = table.getChild("y")!.toArray() as Float32Array
for (let i = 0; i < table.numRows; i++) {
  process(xArr[i], yArr[i])  // no allocation
}
```

### Memoize string decoding

```typescript
// Utf8 Vector decodes UTF-8 bytes on every .get() call
const col = table.getChild("text")!
const memo = col.memoize()  // cache decoded strings
for (let i = 0; i < memo.length; i++) {
  memo.get(i)  // cached after first access
}
```

### Rebuild table without full copy

```typescript
// Build column arrays, then tableFromArrays (single rebuild)
const cols: Record<string, unknown[]> = {}
for (const field of table.schema.fields) {
  const col = table.getChild(field.name)!
  const arr = new Array(table.numRows)
  for (let i = 0; i < table.numRows; i++) arr[i] = col.get(i)
  cols[field.name] = arr
}
const rebuilt = tableFromArrays(cols)

// Preserve schema metadata
const withMeta = new Table(
  new Schema(rebuilt.schema.fields, originalTable.schema.metadata),
  rebuilt.batches,
)
```

## Reference Documents

- **`./references/zero-copy.md`** — What is/isn't zero-copy, performance decision tree, golden rules
- **`./references/reading-writing.md`** — Column access, row access, rebuilding tables, add/delete/update rows, streaming
- **`./references/types.md`** — Type hierarchy, constructors, type guards, Field/Schema, vectorFromArray inference
- **`./references/anti-patterns.md`** — 10 common mistakes (row iteration, metadata loss, List gotchas, etc.)
- **`./references/ipc-patterns.md`** — IPC streaming, chunked loading, HTTP transfer, delta updates
- **`./references/flight-sql.md`** — Flight SQL client, gRPC, query execution
- **`./references/flechette.md`** — Flechette: faster/smaller Arrow alternative, useProxy, toColumns, compression
- **`./references/arquero.md`** — Arquero: dplyr-style data wrangling on Arrow (derive, filter, join, rollup)
- **`./references/mosaic.md`** — Mosaic: scalable interactive viz framework (Coordinator, vgplot, SQL, cross-filtering)
- **`./references/duckdb-wasm.md`** — DuckDB-WASM + Arrow in SvelteKit (SQL on Arrow in browser)

# Flechette — Lightweight Arrow JS Alternative

`@uwdata/flechette` is a faster, smaller, zero-dependency alternative to `apache-arrow` for reading/writing Arrow IPC. 1.3-7x faster extraction, ~43kb vs 163kb minified.

**Package:** `@uwdata/flechette`

## When to use Flechette vs apache-arrow

| | apache-arrow | @uwdata/flechette |
|---|---|---|
| Size | 163kb min | 43kb min |
| Streaming | Yes (RecordBatchReader) | No (byte buffers only) |
| Builder API | Yes | No (uses columnFromArray) |
| TypeScript types | Strong generics | Looser types |
| Proxy rows | No | Yes (useProxy) |
| Run-end encoded | No | Yes |
| BinaryView/Utf8View | No | Yes |
| DuckDB compat | Good | Excellent |

## Core API

### Read Arrow IPC

```typescript
import { tableFromIPC } from "@uwdata/flechette"

const ipc = await fetch(url).then(r => r.arrayBuffer())
const table = tableFromIPC(ipc)

// Extraction options
const table = tableFromIPC(ipc, {
  useDate: true,       // Date objects for temporal
  useBigInt: true,     // BigInt for 64-bit ints
  useDecimalInt: true, // scaled ints for decimals
  useMap: true,        // Map for key-value pairs
  useProxy: true,      // zero-copy proxy row objects
})
```

### Write Arrow IPC

```typescript
import { tableToIPC } from "@uwdata/flechette"

const bytes = tableToIPC(table, { format: "stream" })  // or "file"

// With compression (requires codec registration)
import { CompressionType, setCompressionCodec } from "@uwdata/flechette"
setCompressionCodec(CompressionType.ZSTD, { encode, decode })
const bytes = tableToIPC(table, { codec: CompressionType.ZSTD })
```

### Create tables from JS arrays

```typescript
import { tableFromArrays, int32, float32, bool, dictionary, utf8 } from "@uwdata/flechette"

// Inferred types
const table = tableFromArrays({
  ints: [1, 2, null, 4, 5],
  floats: [1.1, 2.2, 3.3, 4.4, 5.5],
  bools: [true, true, null, false, true],
  strings: ["a", "b", "c", "b", "a"],
})

// Explicit types
const table = tableFromArrays(arrays, {
  types: {
    ints: int32(),
    floats: float32(),
    bools: bool(),
    strings: dictionary(utf8()),
  }
})
```

### Create columns

```typescript
import { columnFromArray, columnFromValues, float32 } from "@uwdata/flechette"

columnFromArray([1.1, 2.2, 3.3])           // inferred float64
columnFromArray([1.1, 2.2, 3.3], float32()) // explicit

// From iterable or visitor function (more efficient for large data)
columnFromValues(new Set([1, 2, 3]))
columnFromValues(callback => {
  values.forEach((v, i) => { if (i % 2) callback(v) })
})
```

### Table API

```typescript
table.numRows
table.numCols
table.getChild("name")     // Column by name
table.getChildAt(0)        // Column by index
table.select(["a", "b"])   // Column subset
table.at(0)                // Row object (or proxy)
table.get(0)               // Same as at()
table.toColumns()          // { name: array, ... }
table.toArray()            // Array of row objects
[...table]                 // Iterable over row objects
```

### Column API

```typescript
column.type       // DataType
column.length     // Row count
column.nullCount  // Null count
column.at(0)      // Value at index
column.get(0)     // Same as at()
column.toArray()  // Zero-copy when possible
[...column]       // Iterable
```

### Key difference: toColumns()

Flechette has `table.toColumns()` which returns `{ name: TypedArray, ... }` — much more efficient than row-based extraction. Use this for bulk data processing.

## Data types

```typescript
import {
  int8, int16, int32, int64, uint8, uint16, uint32, uint64,
  float16, float32, float64,
  utf8, bool, binary,
  list, struct, dictionary, fixedSizeList, fixedSizeBinary,
  dateDay, dateMillisecond, timestamp,
  duration, interval,
  nullType, runEndEncoded, binaryView, utf8View,
  field,
} from "@uwdata/flechette"

// Type constructors return plain objects, not class instances
int32()                          // { typeId: 2, bitWidth: 32, signed: true }
dictionary(utf8(), int16())      // dictionary encoded strings
list(float32())                  // variable-length list
struct({ x: int32(), y: float32() })
fixedSizeList(float32(), 4)      // fixed-size array
```

## useProxy for zero-copy rows

```typescript
const table = tableFromIPC(ipc, { useProxy: true })
const row = table.at(0)  // zero-copy proxy, extracts on demand
row.name                 // extracts this field only
row.toJSON()             // convert to standard object

// Caveat: proxy objects don't support:
// Object.keys(row), Object.values(row), { ...row }
```

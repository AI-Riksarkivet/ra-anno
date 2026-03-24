# Zero-Copy Patterns in Arrow JS

Zero-copy means accessing data without allocating new memory or copying bytes. Arrow JS supports zero-copy in specific scenarios — knowing which operations copy and which don't is critical for performance.

## What IS zero-copy

### TypedArray → Vector (makeVector)

```typescript
const f32 = new Float32Array([1, 2, 3])
const vec = makeVector(f32)
// vec.toArray() === f32 (same buffer, no copy)
```

`makeVector` wraps a TypedArray directly. The Vector's internal Data object points to the same ArrayBuffer.

### Vector.toArray() — single chunk primitives

```typescript
const col = table.getChild("x")!  // Float32 column
const arr = col.toArray()          // Returns the SAME Float32Array (zero-copy)
```

This only works when:
- The column is a **single chunk** (one RecordBatch)
- The type is a **primitive** (Int, Float, etc. — NOT Utf8, Bool, List, Struct)

### Table.slice() / Vector.slice()

```typescript
const sub = table.slice(10, 20)  // Zero-copy: shares underlying buffers
const subVec = vec.slice(0, 100) // Zero-copy: offset + length view
```

Slicing creates a new Table/Vector with adjusted offset/length pointers, not a copy.

### tableFromIPC() from Uint8Array

```typescript
const bytes = new Uint8Array(await response.arrayBuffer())
const table = tableFromIPC(bytes)
// Table's buffers are views into `bytes` — no copy
```

Arrow IPC deserialization creates views into the original buffer. The Uint8Array must stay alive.

## What is NOT zero-copy

### vectorFromArray() — always copies

```typescript
const vec = vectorFromArray([1, 2, 3])  // Copies through Builder
const vec2 = vectorFromArray(["a", "b"]) // Copies + dictionary encodes
```

`vectorFromArray` uses the Builder API internally — it always allocates new buffers.

### tableFromArrays() with JS arrays

```typescript
const table = tableFromArrays({
  names: ["Alice", "Bob"],  // Copies (goes through Builder)
  ids: new Int32Array([1, 2]),  // ALSO copies (tableFromArrays always copies)
})
```

Even typed arrays get copied in `tableFromArrays`. Use `makeTable` for zero-copy typed arrays.

### makeTable() — zero-copy for typed arrays

```typescript
const table = makeTable({
  x: new Float32Array([1, 2, 3]),  // Zero-copy: wrapped directly
  y: new Float32Array([4, 5, 6]),  // Zero-copy
})
```

`makeTable` wraps typed arrays without copying — unlike `tableFromArrays`.

### Vector.toArray() — multi-chunk

```typescript
// If table has multiple RecordBatches:
const col = table.getChild("x")!
const arr = col.toArray()  // COPIES: concatenates chunks into new TypedArray
```

Multi-chunk vectors must allocate a new contiguous array.

### Utf8 Vector.toArray()

```typescript
const names = table.getChild("name")!  // Utf8 column
const arr = names.toArray()  // COPIES: decodes UTF-8 bytes to JS strings
```

String columns always copy on `toArray()` because JS strings are not UTF-8 byte buffers.

### table.get(i) — row access

```typescript
const row = table.get(0)  // Allocates a StructRowProxy object
```

Row access creates a proxy object every call. Never use in hot loops.

## Performance decision tree

| Scenario | Use | Copy? |
|----------|-----|-------|
| Typed array → Vector | `makeVector(typedArr)` | No |
| Typed arrays → Table | `makeTable({...})` | No |
| JS arrays → Table | `tableFromArrays({...})` | Yes |
| IPC bytes → Table | `tableFromIPC(bytes)` | No |
| Column → TypedArray | `.toArray()` (single chunk, primitive) | No |
| Column → TypedArray | `.toArray()` (multi-chunk or string) | Yes |
| Row access | `.get(i)` | Yes (proxy) |
| Table subset | `.slice(begin, end)` | No |
| Column select | `.select(["a","b"])` | No |

## Golden rules

1. **Column-oriented access, not row-oriented** — iterate columns, not `table.get(i)`
2. **`makeVector`/`makeTable` over `vectorFromArray`/`tableFromArrays`** when you have typed arrays
3. **Single RecordBatch** — keep data in one batch for zero-copy `toArray()`
4. **Keep IPC buffers alive** — tables deserialized from IPC reference the original buffer
5. **Memoize Utf8 vectors** — `vector.memoize()` caches string decoding

# Arrow JS Anti-Patterns

## 1. Row-oriented iteration in hot loops

```typescript
// SLOW: Allocates a StructRowProxy per iteration
for (let i = 0; i < table.numRows; i++) {
  const row = table.get(i)  // proxy object allocation
  process(row.x, row.y)
}

// FAST: Column-oriented
const xArr = table.getChild("x")!.toArray() as Float32Array
const yArr = table.getChild("y")!.toArray() as Float32Array
for (let i = 0; i < table.numRows; i++) {
  process(xArr[i], yArr[i])
}
```

## 2. Using tableFromArrays when you have typed arrays

```typescript
// COPIES data (goes through Builder)
const table = tableFromArrays({ x: new Float32Array([1, 2, 3]) })

// ZERO-COPY: wraps directly
const table = makeTable({ x: new Float32Array([1, 2, 3]) })
```

## 3. Rebuilding table on every small edit

```typescript
// WRONG: Full table rebuild per field change
function updateField(table, rowIndex, field, value) {
  // O(N * columns) rebuild for a single cell change
  const cols = {}
  for (const f of table.schema.fields) { /* rebuild everything */ }
  return tableFromArrays(cols)
}

// RIGHT: Overlay pattern — defer rebuilds, batch on save
// Store edits as Map<rowIndex, Record<field, value>>
// Only rebuild when saving or when the full table is needed
```

## 4. Decoding Utf8 repeatedly without memoization

```typescript
// SLOW: Decodes UTF-8 bytes → JS string on EVERY call
for (let i = 0; i < col.length; i++) {
  console.log(col.get(i))  // UTF-8 decode each time
}

// FAST: Memoize or materialize once
const memo = col.memoize()  // caches after first decode
// OR
const strings = new Array(col.length)
for (let i = 0; i < col.length; i++) strings[i] = String(col.get(i) ?? "")
```

## 5. Treating List column values as plain arrays

```typescript
// WRONG: List.get() returns an Arrow-like object, not a JS array
const polygon = polyCol.get(0)
polygon.forEach(...)  // TypeError — no .forEach

// RIGHT: Convert explicitly
const val = polyCol.get(0)
if (val && val.length > 0) {
  const arr = new Array(val.length)
  for (let j = 0; j < val.length; j++) arr[j] = val.get(j)
}
```

## 6. Losing schema metadata on rebuild

```typescript
// WRONG: metadata lost
const rebuilt = tableFromArrays(newCols)
// rebuilt.schema.metadata is empty Map

// RIGHT: Preserve metadata
const rebuilt = tableFromArrays(newCols)
const withMeta = new Table(
  new Schema(rebuilt.schema.fields, originalTable.schema.metadata),
  rebuilt.batches,
)
```

## 7. Assuming toArray() is always zero-copy

```typescript
// Zero-copy ONLY when: single chunk + primitive type
const arr = float32Col.toArray()  // zero-copy ✓

// NOT zero-copy:
const arr = utf8Col.toArray()       // copies (string decode)
const arr = multiChunkCol.toArray() // copies (concatenation)
const arr = boolCol.toArray()       // copies (bit unpack)
```

## 8. Using vectorFromArray for large datasets

```typescript
// SLOW: Goes through Builder, copies everything
const vec = vectorFromArray(millionNumbers)

// FAST: Wrap typed array directly
const vec = makeVector(new Float32Array(millionNumbers))
```

## 9. Not using `as` type assertion on toArray()

```typescript
// Loses type info
const arr = table.getChild("x")!.toArray()  // any

// Proper typing
const arr = table.getChild("x")!.toArray() as Float32Array
```

## 10. Creating new Schema without preserving field metadata

```typescript
// Schemas can carry field-level metadata too
const field = new Field("score", new Float32(), true,
  new Map([["unit", "percent"]]))

// When rebuilding, copy the full Field objects, not just types
const newSchema = new Schema(
  existingTable.schema.fields,  // preserves field metadata
  existingTable.schema.metadata,  // preserves schema metadata
)
```

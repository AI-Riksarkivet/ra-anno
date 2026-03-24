# Reading & Writing Arrow Data

## Reading columns (fast path)

### Numeric columns — zero-copy typed array

```typescript
const xArr = table.getChild("x")!.toArray() as Float32Array
const yArr = table.getChild("y")!.toArray() as Float32Array
// Direct typed array access — fastest possible
for (let i = 0; i < table.numRows; i++) {
  process(xArr[i], yArr[i])
}
```

### String columns — memoize for repeated access

```typescript
const textCol = table.getChild("text")!
// Each .get() decodes UTF-8 → allocates a JS string
// Memoize caches decoded values after first access
const memo = textCol.memoize()
for (let i = 0; i < memo.length; i++) {
  const s = memo.get(i)  // First call decodes, subsequent calls return cached
}
```

### Materialize string column to array once

```typescript
const statusCol = table.getChild("status")
const statusArr = new Array<string>(table.numRows)
for (let i = 0; i < table.numRows; i++) {
  statusArr[i] = String(statusCol?.get(i) ?? "")
}
// Now iterate statusArr[] — no per-access Arrow decode
```

### List columns (e.g. polygon: List<Float32>)

Arrow List values are NOT plain JS arrays. They have `.length` and `.get(i)` methods:

```typescript
const polyCol = table.getChild("polygon")
const val = polyCol?.get(0)  // { length: number, get(i): number }

// Convert to plain array
if (val && val.length > 0) {
  const arr = new Array(val.length)
  for (let j = 0; j < val.length; j++) arr[j] = val.get(j)
}
```

### Null handling

```typescript
// Check if value is null
if (vector.isValid(i)) {
  const value = vector.get(i)  // guaranteed non-null
}

// Null count
console.log(vector.nullCount)
console.log(table.nullCount)  // total across all columns
```

### Schema metadata

```typescript
const meta = table.schema.metadata  // Map<string, string>
const pageId = meta.get("page_id")
const imageB64 = meta.get("image_base64")

// Schema fields
for (const field of table.schema.fields) {
  console.log(field.name, field.type, field.nullable)
}
```

## Writing / rebuilding tables

### Rebuild with modified columns

```typescript
import { tableFromArrays, Table, Schema } from "apache-arrow"

// Extract all columns, modify as needed
const cols: Record<string, unknown[]> = {}
for (const field of table.schema.fields) {
  const col = table.getChild(field.name)!
  const arr = new Array(table.numRows)
  for (let i = 0; i < table.numRows; i++) {
    arr[i] = col.get(i)
    // List columns need special handling:
    if (field.name === "polygon") {
      const val = col.get(i)
      if (val && val.length > 0) {
        const plain = new Array(val.length)
        for (let j = 0; j < val.length; j++) plain[j] = val.get(j)
        arr[i] = plain
      } else {
        arr[i] = null
      }
    }
  }
  cols[field.name] = arr
}

const rebuilt = tableFromArrays(cols)

// IMPORTANT: Preserve schema metadata
const withMeta = new Table(
  new Schema(rebuilt.schema.fields, originalTable.schema.metadata),
  rebuilt.batches,
)
```

### Add a row

```typescript
// There's no table.push() — you must rebuild
const newRow = { id: "abc", x: 10, y: 20, ... }
const cols: Record<string, unknown[]> = {}
for (const field of table.schema.fields) {
  const col = table.getChild(field.name)!
  const arr = new Array(table.numRows + 1)
  for (let i = 0; i < table.numRows; i++) arr[i] = col.get(i)
  arr[table.numRows] = newRow[field.name as keyof typeof newRow]
  cols[field.name] = arr
}
const updated = tableFromArrays(cols)
```

### Delete a row

```typescript
const deleteIndex = 5
const cols: Record<string, unknown[]> = {}
for (const field of table.schema.fields) {
  const col = table.getChild(field.name)!
  const arr: unknown[] = []
  for (let i = 0; i < table.numRows; i++) {
    if (i === deleteIndex) continue
    arr.push(col.get(i))
  }
  cols[field.name] = arr
}
const updated = tableFromArrays(cols)
```

### Update specific fields

```typescript
// Only rebuild columns that changed
const updatesMap = new Map<number, Record<string, unknown>>()
updatesMap.set(3, { label: "header", status: "accepted" })
updatesMap.set(7, { label: "paragraph" })

const cols: Record<string, unknown[]> = {}
for (const field of table.schema.fields) {
  const col = table.getChild(field.name)!
  const arr = new Array(table.numRows)
  for (let i = 0; i < table.numRows; i++) {
    const rowUpdates = updatesMap.get(i)
    if (rowUpdates && field.name in rowUpdates) {
      arr[i] = rowUpdates[field.name]
    } else {
      arr[i] = col.get(i)
    }
  }
  cols[field.name] = arr
}
```

### Replace a column

```typescript
// setChild returns a NEW table (immutable)
const newNameVector = vectorFromArray(["Alice", "Bob", "Carol"])
const updated = table.setChild("name", newNameVector)
```

## Streaming reads

### RecordBatchReader for incremental processing

```typescript
import { RecordBatchReader } from "apache-arrow"

// From fetch (processes batches as they arrive)
const reader = await RecordBatchReader.from(fetch("/api/data"))
for await (const batch of reader) {
  // Process each batch incrementally
  const col = batch.getChild("x")!.toArray()
  processBatch(col)
}

// From Uint8Array
const reader = await RecordBatchReader.from(bytes)
for (const batch of reader) {  // sync iteration
  console.log(batch.numRows)
}
```

### RecordBatchWriter for incremental writing

```typescript
import { RecordBatchWriter } from "apache-arrow"

const writer = new RecordBatchWriter()
writer.write(table)         // or individual RecordBatches
writer.finish()
const bytes = writer.toUint8Array(true)  // sync

// Stream to DOM ReadableStream
const stream = writer.toDOMStream()
```

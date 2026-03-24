# Arrow IPC Patterns

## Stream vs File format

| Format | Use case | Random access |
|--------|----------|---------------|
| `"stream"` | Network transfer, HTTP responses, pipes | No — sequential |
| `"file"` | Disk storage, memory-mapped files | Yes — has footer |

```typescript
import { tableToIPC } from "apache-arrow"
const streamBytes = tableToIPC(table, "stream")  // default
const fileBytes = tableToIPC(table, "file")
```

## HTTP Transfer

### Server (SvelteKit +server.ts / Deno)

```typescript
const ipc = tableToIPC(table, "stream")

return new Response(ipc, {
  headers: {
    "Content-Type": "application/vnd.apache.arrow.stream",
    "ETag": versionTag,
  },
})
```

### Client (browser)

```typescript
const res = await fetch("/api/data")
const table = await tableFromIPC(res)  // async, from Response directly
```

### Chunked streaming

```typescript
// Server: stream chunks
const stream = new ReadableStream({
  start(controller) {
    let offset = 0
    const push = () => {
      if (offset >= ipc.length) { controller.close(); return }
      const end = Math.min(offset + chunkSize, ipc.length)
      controller.enqueue(ipc.slice(offset, end))
      offset = end
      setTimeout(push, 0)
    }
    push()
  },
})

return new Response(stream, {
  headers: {
    "Content-Type": "application/vnd.apache.arrow.stream",
    "Transfer-Encoding": "chunked",
  },
})
```

## RecordBatch Reader for streaming

```typescript
import { RecordBatchReader } from "apache-arrow"

// From fetch Response
const reader = await RecordBatchReader.from(fetch("/api/stream"))

// Process batches as they arrive
for await (const batch of reader) {
  console.log(`Received ${batch.numRows} rows`)
  // Process incrementally — don't wait for full table
}
```

## Delta Updates (PATCH pattern)

Send only changed rows instead of full table:

```typescript
// Client: build delta table with only modified rows
const deltaBytes = tableToIPC(deltaTable, "stream")

const res = await fetch(`/api/data/${pageId}`, {
  method: "PATCH",
  headers: {
    "Content-Type": "application/vnd.apache.arrow.stream",
    "If-Match": currentETag,        // OCC version check
    "X-Deleted-Ids": deletedIds.join(","),  // IDs to remove
  },
  body: deltaBytes,
})

// Server returns merged result
const merged = await tableFromIPC(res)
```

## Schema Metadata for embedding data

Arrow schema metadata (`Map<string, string>`) can carry arbitrary key-value pairs:

```typescript
import { Schema, Field, Float32 } from "apache-arrow"

// Embed image as base64 in schema metadata
const schema = new Schema(
  [new Field("x", new Float32())],
  new Map([
    ["image_base64", btoa(String.fromCharCode(...imageBytes))],
    ["image_mime", "image/png"],
    ["page_id", "page-001"],
  ])
)

// Read metadata after deserialization
const table = tableFromIPC(bytes)
const imageB64 = table.schema.metadata.get("image_base64")
```

## Preserving schema metadata on rebuild

When rebuilding a table (e.g., after filtering rows), metadata is lost unless explicitly preserved:

```typescript
import { Table, Schema, tableFromArrays } from "apache-arrow"

const rebuilt = tableFromArrays(newColumns)

// Preserve original metadata
const withMeta = new Table(
  new Schema(rebuilt.schema.fields, originalTable.schema.metadata),
  rebuilt.batches,
)
```

## List (array) columns

Arrow List columns store variable-length arrays per row:

```typescript
// Reading list values
const polyCol = table.getChild("polygon")  // Vector<List<Float32>>
const row0 = polyCol.get(0)  // { length, get(i) } — NOT a plain array

// Convert to plain array
const val = polyCol.get(0)
if (val && val.length > 0) {
  const arr = new Array(val.length)
  for (let j = 0; j < val.length; j++) arr[j] = val.get(j)
  // arr is now a plain number[]
}

// Writing list values in tableFromArrays
const table = tableFromArrays({
  polygon: [[1, 2, 3, 4], [5, 6, 7, 8], null],  // nullable list column
})
```

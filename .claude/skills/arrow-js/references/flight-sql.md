# Arrow Flight SQL

TypeScript client for Apache Arrow Flight and Flight SQL protocols over gRPC.

## Quick Start

```typescript
import { Client } from "./flight"

const client = await Client.connect({
  host: "localhost:50051",
  username: "user",
  password: "pass",
  defaultDatabase: "mydb",  // optional
  insecure: true,           // optional, for non-TLS
})

const result = await client.query("SELECT * FROM table")
```

## ClientOptions

```typescript
interface ClientOptions {
  host: string         // "host:port"
  username: string
  password: string
  defaultDatabase?: string
  insecure?: boolean
}
```

## QueryResult

Wraps a stream of Arrow RecordBatches with consumption methods:

```typescript
// Raw Arrow stream (caution: instanceof issues with bundlers)
const batches: AsyncIterable<RecordBatch> = result.toArrowStream()

// Collect all batches
const batches: RecordBatch[] = await result.collectToArrow()

// Collect as plain JS objects (recommended for most use cases)
const rows: unknown[] = await result.collectToObjects()
```

## Architecture

### Authentication flow

1. Client calls `handshake()` with Basic auth header
2. Server returns Bearer token (in payload or metadata)
3. Token set as default metadata for all subsequent calls

### Query execution flow

1. Pack SQL as protobuf `CommandStatementQuery` in a `CMD` FlightDescriptor
2. Call `getFlightInfo(descriptor)` → schema + ticket
3. Call `doGet(ticket, schema)` → stream of RecordBatches
4. FlightData messages converted to IPC and fed to `RecordBatchStreamReader`

## Internal Classes

### FlightClient (low-level)

```typescript
const flight = new FlightClient("localhost:50051")
flight.set_default_metadata({ authorization: `Bearer ${token}` })

const info = await flight.getFlightInfo(descriptor)
const stream = await flight.doGet(ticket, schema)
```

### FlightSqlClient

```typescript
const sql = await FlightSqlClient.connect(host, username, password, db?)
const stream = await sql.statementQuery({ query: "SELECT 1" })

for await (const batch of stream) {
  console.log(batch.numRows)
}
```

### RecordBatchStream

Async iterator of Arrow RecordBatches with schema:

```typescript
stream.schema  // Schema
for await (const batch of stream) {
  // RecordBatch
}
```

## Utilities

```typescript
// Get first value from async iterable, cancel rest
const first = await firstValueFrom(asyncIterable)

// Get last value (consumes entire iterable)
const last = await lastValueFrom(asyncIterable)
```

## gRPC Types

```typescript
// Metadata wrapper
metadata.get(key)              // string[]
metadata.get_first_string(key) // string | undefined

// Envelope (gRPC message)
interface Envelope<O> {
  data?: O
  metadata?: Metadata
}

// SimpleChannel — unbounded async queue
const ch = new SimpleChannel<T>()
ch.push(value)
ch.push_err(error)
ch.close()
for await (const item of ch) { ... }
```

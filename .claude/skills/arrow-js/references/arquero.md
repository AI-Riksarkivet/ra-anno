# Arquero — Data Wrangling on Arrow

`arquero` is a JavaScript library for query processing and transformation of column-oriented data tables. Uses Flechette/Arrow under the hood. Think dplyr for JS.

**Package:** `arquero`

## Core Concepts

Arquero provides a fluent verb-based API for data manipulation. Tables are immutable — verbs return new tables.

```typescript
import { table, op, desc, all, not } from "arquero"
```

## Create tables

```typescript
const dt = table({
  x: [1, 2, 3, 4, 5],
  y: [3.4, 1.6, 5.4, 7.1, 2.9],
})

// From Arrow IPC
import { loadArrow } from "arquero"
const dt = loadArrow(arrowBuffer)
```

## Core Verbs

### derive — compute new columns

```typescript
dt.derive({ total: d => d.x + d.y })
dt.derive({ rank: d => op.row_number() })
```

### filter — subset rows

```typescript
dt.filter(d => d.x > 2)
dt.filter(d => op.abs(d.value) < 5)
```

### select — subset columns

```typescript
dt.select("x", "y")
dt.select(not("z"))
```

### groupby + rollup — aggregate

```typescript
dt.groupby("category").rollup({
  mean: d => op.mean(d.value),
  count: d => op.count(),
  max: d => op.max(d.value),
})
```

### orderby — sort

```typescript
dt.orderby("x")
dt.orderby(desc("score"))
```

### sample — random rows

```typescript
dt.sample(50)
dt.sample(100, { replace: true })
```

## Join Verbs

```typescript
dt.join(other, "key")                    // inner join
dt.join(other, ["leftKey", "rightKey"])   // different key names
dt.join_left(other, "key")               // left outer
dt.join_right(other, "key")              // right outer
dt.join_full(other, "key")               // full outer
dt.semijoin(other, "key")                // keep matches
dt.antijoin(other, "key")                // keep non-matches
dt.lookup(other, "key", "value")         // lookup values
dt.cross(other)                          // cartesian product
```

## Reshape Verbs

```typescript
// Fold columns into key-value pairs (unpivot)
dt.fold(["colA", "colB"], { as: ["key", "value"] })

// Pivot key-value pairs into columns
dt.pivot("key", "value")

// Spread array values into columns
dt.spread({ text: d => op.split(d.text, " ") })

// Unroll arrays into rows
dt.unroll("arrayCol")
```

## Set Operations

```typescript
dt.concat(other)      // UNION ALL
dt.union(other)       // UNION (dedupe)
dt.intersect(other)   // rows in both
dt.except(other)      // rows in left only
```

## Output

```typescript
dt.objects()           // Array of row objects
dt.object(0)           // Single row object
dt.toArrow()           // Flechette Arrow Table
dt.toArrowIPC()        // Arrow IPC bytes (Transferable)
dt.toCSV()             // CSV string
dt.toJSON()            // JSON string
dt.toMarkdown()        // Markdown table
dt.print()             // console.table()

// Column extraction
dt.array("x")                  // Array of values
dt.array("x", Float32Array)   // Typed array
```

## Table Expressions

Expressions look like JS functions but are parsed and rewritten internally:

```typescript
// All equivalent:
d => op.mean(d.value)
d => mean(d.value)      // op. prefix optional
op.mean("value")        // shorthand outside expressions
```

### External variables via params

```typescript
dt.params({ threshold: 5 })
  .filter((d, $) => d.value < $.threshold)

// Or use escape() for closures (no aggregate/window support)
const threshold = 5
dt.filter(aq.escape(d => d.value < threshold))
```

## Arrow Integration

```typescript
import { float32, uint16 } from "@uwdata/flechette"

// Arquero → Arrow
const arrowTable = dt.toArrow({
  types: { x: uint16(), y: float32() }
})

// Arrow IPC bytes (zero-copy Transferable for Web Workers)
const bytes = dt.toArrowIPC({ format: "stream" })

// Arrow → Arquero
import { fromArrow } from "arquero"
const dt = fromArrow(arrowTable)
```

## Key op Functions

### Aggregate

`op.count()`, `op.sum(x)`, `op.mean(x)`, `op.median(x)`, `op.min(x)`, `op.max(x)`, `op.stdev(x)`, `op.variance(x)`, `op.corr(x,y)`, `op.any(x)`, `op.distinct(x)`, `op.array_agg(x)`

### Window

`op.row_number()`, `op.rank()`, `op.dense_rank()`, `op.lag(x,n)`, `op.lead(x,n)`, `op.cume_dist()`, `op.ntile(n)`, `op.first_value(x)`, `op.last_value(x)`

### Standard

`op.abs(x)`, `op.sqrt(x)`, `op.pow(x,y)`, `op.round(x)`, `op.floor(x)`, `op.ceil(x)`, `op.log(x)`, `op.lower(x)`, `op.upper(x)`, `op.trim(x)`, `op.split(x,sep)`, `op.match(x,re)`, `op.equal(a,b)` (null-safe)

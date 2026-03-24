# Mosaic — Scalable Interactive Visualization on Arrow + DuckDB

Mosaic links databases and interactive views. Pushes computation to DuckDB (server or WASM), transfers data via Arrow. Scales to millions/billions of records.

**Primary package:** `@uwdata/vgplot` (re-exports core, SQL, inputs, spec)

## Architecture

```
Coordinator (query manager, cache, pre-aggregation)
    ├── Connector (wasmConnector | socketConnector | restConnector)
    │       └── DuckDB (WASM or server)
    ├── Clients (marks, inputs, tables — declare data needs)
    ├── Params (reactive scalar/array values)
    └── Selections (reactive filter predicates, cross-filtering)
```

## Quick Start

```js
import * as vg from "@uwdata/vgplot";

// Load data
await vg.coordinator().exec([
  vg.loadParquet("flights", "data/flights-200k.parquet")
]);

// Create interactive chart
const $brush = vg.Selection.crossfilter();
export default vg.plot(
  vg.rectY(vg.from("flights", { filterBy: $brush }), {
    x: vg.bin("delay"), y: vg.count(), fill: "steelblue"
  }),
  vg.intervalX({ as: $brush }),
  vg.xDomain(vg.Fixed),
  vg.width(680), vg.height(200)
);
```

## Core API (`@uwdata/mosaic-core`)

### Coordinator

```js
import { coordinator, Coordinator } from "@uwdata/mosaic-core";
coordinator()                          // global singleton
coordinator().databaseConnector(conn)  // set connector
coordinator().connect(client)          // register client
coordinator().query(sql, { type: "arrow" | "json" })
coordinator().exec(sql)                // no return
coordinator().prefetch(sql)            // low-priority cache
coordinator().clear()                  // reset
```

### Param (reactive values)

```js
import { Param } from "@uwdata/mosaic-core";
const $val = Param.value(42);
$val.value                    // get
$val.update(100)              // set, emits "value" event
$val.addEventListener("value", fn)
```

### Selection (reactive filters)

```js
import { Selection } from "@uwdata/mosaic-core";
Selection.intersect()          // AND of all clauses
Selection.union()              // OR of all clauses
Selection.single()             // most recent clause only
Selection.crossfilter()        // intersect + cross-filter (source excluded)

$sel.update(clause)            // { source, clients, predicate, value }
$sel.predicate(client)         // resolved SQL WHERE for this client
$sel.activate(clause)          // hint for prefetch
```

### Connectors

```js
import { wasmConnector, socketConnector, restConnector } from "@uwdata/vgplot";
wasmConnector()                        // DuckDB-WASM in browser
socketConnector("ws://localhost:3000")  // WebSocket to server
restConnector("http://localhost:3000")  // HTTP to server
```

## SQL API (`@uwdata/mosaic-sql`)

### Query Builder

```js
import { Query, count, sum, avg, gt, bin } from "@uwdata/mosaic-sql";

Query.from("table")
  .select("col1", { total: sum("value") })
  .where(gt("value", 0))
  .groupby("col1")
  .having(gt(count(), 10))
  .orderby("col1")
  .limit(100)
  .distinct()
  .toString()   // SQL string
```

### Expressions & Operators

```js
column("name"), literal(42), sql`SQRT(${expr})`
and(...), or(...), not(expr)
eq, neq, lt, gt, lte, gte
isNull, isNotNull, isBetween, isIn
```

### Aggregates

```js
count(), sum(x), avg(x), min(x), max(x), median(x)
variance(x), stddev(x), corr(a,b)
first(x), last(x), argmax(arg,val), argmin(arg,val)
// Chainable: .distinct(), .where(filter), .window(), .partitionby(), .orderby()
```

### Window Functions

```js
row_number(), rank(), dense_rank(), ntile(n)
lag(x, offset), lead(x, offset)
first_value(x), last_value(x), nth_value(x, n)
// Chainable: .partitionby(), .orderby(), .rows([lo,hi])
```

### Data Loading

```js
loadCSV("table", "file.csv", { select, where, temp: true })
loadJSON("table", "file.json", options)
loadParquet("table", "file.parquet", options)
loadObjects("table", jsObjects, options)
loadSpatial("table", "file.geojson", { layer })
loadExtension("spatial")
```

## vgplot API

### Marks

```js
// Area, Bar, Rect
vg.areaY(data, { x, y }), vg.barX(data, { x, y }), vg.rect(data, { x1, x2, y1, y2 })

// Dot, Line, Rule, Tick
vg.dot(data, { x, y, r, fill }), vg.line(data, { x, y, stroke })

// Text, Image, Frame
vg.text(data, { x, y, text }), vg.image(data, { x, y, src, width })

// Density / Heatmap
vg.raster(data, { x, y, fill: vg.max("value"), interpolate: "random-walk" })
vg.heatmap(data, { x, y, bandwidth: 20 })
vg.contour(data, { x, y, thresholds: 10 })
vg.density(data, { x, y, fill: "density" })

// Statistical
vg.hexbin(data, { x, y, fill: vg.count() })
vg.regressionY(data, { x, y, stroke: "category" })

// Geo
vg.geo(data, { geometry: "geom", fill: "value" })
```

**Data source:** `vg.from("table", { filterBy: $selection })`

### Interactors

```js
vg.intervalX({ as: $sel })      // 1D brush
vg.intervalXY({ as: $sel })     // 2D brush
vg.toggle({ as: $sel })         // click select
vg.nearestX({ as: $sel })       // hover
vg.panZoom({ x: $xSel, y: $ySel })  // pan+zoom
vg.highlight({ by: $sel })      // dim unselected
```

### Attributes

```js
vg.width(680), vg.height(400)
vg.xDomain([0, 100]), vg.yDomain(vg.Fixed)  // Fixed = lock after first load
vg.colorScheme("viridis"), vg.colorScale("diverging")
vg.xLabel("Time"), vg.yLabel("Value")
vg.marginLeft(60), vg.grid(true)
```

### Layout

```js
vg.vconcat(plot1, plot2)   // vertical
vg.hconcat(plot1, plot2)   // horizontal
vg.vspace(10), vg.hspace("1em")
```

### Legends

```js
vg.colorLegend({ for: "plotName", as: $sel })  // interactive
vg.opacityLegend({ for: "plotName" })
vg.symbolLegend({ for: "plotName" })
```

## Inputs

```js
vg.menu({ from: "table", column: "col", as: $sel, label: "Category" })
vg.slider({ as: $param, min: 0, max: 100, step: 1 })
vg.search({ from: "table", column: "name", as: $sel, type: "contains" })
vg.table({ from: "table", filterBy: $sel, as: $hover,
  columns: ["name", "value"], height: 300
})
```

## Declarative Specs (JSON/YAML)

```json
{
  "data": {
    "flights": { "file": "flights.parquet" }
  },
  "params": {
    "brush": { "select": "crossfilter" }
  },
  "vconcat": [
    {
      "plot": [
        { "mark": "rectY", "data": { "from": "flights", "filterBy": "$brush" },
          "x": { "bin": "delay" }, "y": { "count": null }, "fill": "steelblue" },
        { "select": "intervalX", "as": "$brush" }
      ],
      "xDomain": "Fixed", "width": 680, "height": 200
    }
  ]
}
```

Param references: `$name` for values, `$$name` for column names.

### Parse & Generate

```js
import { parseSpec, astToDOM, astToESM } from "@uwdata/mosaic-spec";
const ast = parseSpec(jsonSpec);
const { element } = await astToDOM(ast);  // instantiate
const code = astToESM(ast);               // generate JS
```

## Key Patterns

### Cross-filter dashboard

```js
const $brush = vg.Selection.crossfilter();
vg.vconcat(
  vg.plot(
    vg.rectY(vg.from("flights", { filterBy: $brush }), { x: vg.bin("delay"), y: vg.count() }),
    vg.intervalX({ as: $brush }),
    vg.xDomain(vg.Fixed)
  ),
  vg.plot(
    vg.rectY(vg.from("flights", { filterBy: $brush }), { x: vg.bin("time"), y: vg.count() }),
    vg.intervalX({ as: $brush }),
    vg.xDomain(vg.Fixed)
  )
)
```

### Dashboard with inputs

```js
const $cat = vg.Selection.intersect();
vg.vconcat(
  vg.menu({ label: "Sport", as: $cat, from: "athletes", column: "sport" }),
  vg.plot(
    vg.dot(vg.from("athletes", { filterBy: $cat }), { x: "weight", y: "height", fill: "sex" }),
    vg.intervalXY({ as: $cat })
  ),
  vg.table({ from: "athletes", filterBy: $cat, columns: ["name", "height", "weight"] })
)
```

### Param-driven visualization

```js
const $interp = vg.Param.value("random-walk");
const $blur = vg.Param.value(0);
vg.vconcat(
  vg.menu({ label: "Method", options: ["none", "nearest", "random-walk"], as: $interp }),
  vg.slider({ label: "Blur", min: 0, max: 100, as: $blur }),
  vg.plot(
    vg.raster(vg.from("data"), { x: "lon", y: "lat", fill: vg.max("val"),
      interpolate: $interp, bandwidth: $blur }),
    vg.colorScale("diverging")
  )
)
```

## Svelte 5 Integration (makeClient)

`makeClient` is the recommended API for integrating Mosaic with web frameworks like Svelte. It handles the client lifecycle (connect/disconnect/query) while the framework manages state and cleanup.

```svelte
<script>
  import { makeClient } from "@uwdata/mosaic-core";
  import { count, Query } from "@uwdata/mosaic-sql";

  const { coordinator, table, selection } = $props();

  let totalCount = $state(null);
  let filteredCount = $state(null);
  let isPending = $state(false);
  let isError = $state(false);

  $effect(() => {
    let tableName = table;  // capture for reactivity tracking

    let client = makeClient({
      coordinator,
      selection,
      prepare: async () => {
        // Runs before first query — setup work (e.g., get total count)
        let result = await coordinator.query(
          Query.from(tableName).select({ count: count() })
        );
        totalCount = result.get(0).count;
      },
      query: (predicate) => {
        // Returns the SQL query. `predicate` is the selection's filter for this client.
        return Query.from(tableName)
          .select({ count: count() })
          .where(predicate);
      },
      queryResult: (data) => {
        // Query completed — update state
        filteredCount = data.get(0).count;
        isPending = false;
        isError = false;
      },
      queryPending: () => {
        isPending = true;
        isError = false;
      },
      queryError: () => {
        isPending = false;
        isError = true;
      },
    });

    return () => {
      // Cleanup on effect re-run or component destroy
      client.destroy();
    };
  });
</script>

{filteredCount} / {totalCount}
{isPending ? "(pending)" : ""}
{isError ? "(error)" : ""}
```

**Key points:**
- `$effect` captures reactive deps (`table`, `selection`) — when they change, the old client is destroyed and a new one created
- `makeClient` handles coordinator registration, query dispatch, and selection filtering
- The `prepare` callback runs once before queries start (good for totals, schema info)
- The `query` callback receives the resolved `predicate` from the selection system
- `client.destroy()` in the effect cleanup properly disconnects from the coordinator
- This pattern works for any Mosaic client: charts, tables, custom components

### makeClient API

```typescript
makeClient({
  coordinator: Coordinator,     // the Mosaic coordinator instance
  selection?: Selection,        // optional selection to filter by
  prepare?: () => Promise<void>, // async setup before first query
  query: (predicate: SQLExpression) => Query, // build query with filter
  queryResult: (data: Table) => void,  // handle Arrow result
  queryPending?: () => void,    // query in progress
  queryError?: (error: Error) => void, // query failed
  fields?: () => Field[],       // declare field dependencies
  fieldInfo?: (info: FieldInfo[]) => void, // receive field metadata
}): { destroy: () => void }
```

## NPM Packages

| Package | Contents |
|---------|----------|
| `@uwdata/vgplot` | Plot, marks, interactors, legends, layout; re-exports all below |
| `@uwdata/mosaic-core` | Coordinator, Client, Param, Selection, Connectors |
| `@uwdata/mosaic-sql` | Query builder, expressions, aggregates, window functions, data loading |
| `@uwdata/mosaic-inputs` | Menu, Search, Slider, Table |
| `@uwdata/mosaic-spec` | Declarative spec parser, AST, DOM/ESM generators |
| `@uwdata/mosaic-duckdb` | Node.js DuckDB API + data server |

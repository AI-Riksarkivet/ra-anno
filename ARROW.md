# Arrow Data Architecture

## Overview

The annotation store uses Apache Arrow as an in-memory columnar format. Arrow tables are **immutable** — you can't change a cell in place. Instead, we use an **overlay pattern** (like a database write-ahead log) where edits are stored in a lightweight JS Map and merged with the Arrow table only when needed.

```
Server (Lance/file)
  ↓ Arrow IPC bytes (wire format)
Client: tableFromIPC(bytes)
  ↓ zero-copy Float32Array views for geometry
  ↓ memoized string decode for text/labels
  ↓
Store: _serverTables[pageId]  ← IMMUTABLE, never modified after load
  ↕
Overlays (the "WAL"):
  _fieldOverrides: Map<rowIndex, Map<field, value>>   ← field edits
  _appendedRows: Record<string, unknown>[]            ← new annotations
  _deletedIndices: Set<number>                        ← deleted rows
  _deletedIds: Set<string>                            ← deleted IDs (for server)
  ↓
_materializedTables[pageId]  ← rebuilt table (server + overlays merged)
  ↓                             only rebuilt on structural changes
Pixi reads geometry from cached Float32Array views (zero-copy)
Sidebar reads field values from overlays (O(1)) or materialized table
```

## What's Zero-Copy

| Data | Column Type | Access | Zero-Copy? |
|------|------------|--------|-----------|
| x, y, width, height | Float32 | `col.toArray() → Float32Array` | **Yes** — view into Arrow buffer |
| confidence | Float32 | same | **Yes** |
| polygon | List<Float32> | `col.get(i)` → Arrow Vector → copy to `number[]` | **No** — variable length per row |
| text, label, status | Utf8 | `col.get(i)` → UTF-8 decode → JS string | **No** — decode per call |
| text, label, status | Utf8 | `col.memoize().get(i)` | **Cached** — decode once, return cached |
| image (Binary) | Binary | `col.data[0].values.subarray(start, end)` | **Yes** — Uint8Array view |

### Zero-Copy Rules

1. **`makeVector(typedArray)`** wraps without copying
2. **`makeTable({...})`** wraps typed arrays without copying — but only works for pure TypedArray columns
3. **`tableFromArrays({...})`** ALWAYS copies, even typed arrays — use for mixed types (strings + floats)
4. **`tableFromIPC(bytes)`** creates views into the IPC buffer — zero-copy for primitives
5. **`col.toArray()`** is zero-copy only for single-chunk primitive columns (Float32, Int32, etc.)
6. **`col.toArray()`** for Utf8/Bool/multi-chunk — always copies
7. **`table.slice()`** and **`vector.slice()`** — zero-copy (offset + length view)

## Read Path

### Pixi Renderer (hot path — 60fps when interactive)

```
ArrowDataPlugin.sync() — only runs when dirty flag is set

Phase 1: Cache columns (only when table reference changes)
  xArr = col.toArray() as Float32Array    ← zero-copy view
  yArr = col.toArray() as Float32Array    ← zero-copy view
  polygonCache[i] = arrowListToArray(...)  ← one-time copy per polygon
  statusStr[i] = memoizedCol.get(i)        ← cached string decode

Phase 2: Cache group-by strings
  groupByStr[i] = memoizedCol.get(i)       ← cached decode

Phase 3: Hidden mask (Uint8Array)
  hiddenMask[i] = 0 or 1                   ← reused allocation

Phase 4: Group rows by group → color
  for each row: groupByStr[i] → colorFn    ← array lookups, zero alloc

Phase 5: Pixi Containers + Graphics
  per-group Container.visible for layer toggle
  per-color Graphics.poly() / .rect()
```

### Hover/Hit Test (every mouse move)

```
getAnnotationAtPoint(x, y):
  for each row:
    if hiddenMask[i] → skip                ← Uint8 lookup
    AABB check: xArr[i], yArr[i], ...      ← Float32Array direct access
    polygon check: polygonCache[i]          ← pre-cached array
  → O(N) but zero-allocation per iteration
```

### Sidebar (on selection/display)

```
getFieldValue(pageId, rowIndex, field):
  1. Check fieldOverrides.get(rowIndex)?.get(field)  ← O(1)
  2. If not found, read from serverTable              ← O(1) col.get(i)
  → No table rebuild needed
```

## Write Path

### Field Edit (label, text, status change)

```
Current (SLOW):
  updateLocal(pageId, 7, { label: "paragraph" })
    → fieldOverrides.set(7, "label", "paragraph")        ← O(1)
    → rematerialize()                                     ← O(N × columns) COPY
      → iterates ALL rows × ALL columns
      → col.get(i) for every cell
      → tableFromArrays(cols) — copies everything
      → new Arrow Table

Should be (FAST):
  updateLocal(pageId, 7, { label: "paragraph" })
    → fieldOverrides.set(7, "label", "paragraph")        ← O(1)
    → bumpFieldVersion()                                  ← O(1)
    → NO rematerialize, NO table rebuild
    → Sidebar reads via getFieldValue() — O(1) per field
    → Pixi patched via setFieldOverride() — O(1)
```

### Geometry Edit (drag handle)

```
Already optimal:
  ArrowDataPlugin.setOverride(12, { x, y, w, h, polygon })
    → dirtyOverrides.set(12, geo)                         ← O(1)
    → Arrow table NOT touched
    → Pixi re-renders from overlay
```

### Append Annotation (draw new shape)

```
appendLocal(pageId, row)
  → _appendedRows.push(row)                              ← O(1)
  → bumpStructural()                                     ← triggers Pixi re-sync
  → rematerialize()                                      ← O(N) but necessary
    (row count changed, sidebar list needs update)
```

### Delete Annotation

```
deleteLocal(pageId, rowIndex)
  → _deletedIndices.add(rowIndex)                         ← O(1)
  → bumpStructural()
  → rematerialize()                                       ← O(N) but necessary
```

### Save

```
save(pageId)
  → Extract only changed + appended rows from materialized table
  → tableToIPC(delta) — serialize just the delta
  → PATCH /api/annotations/:pageId with If-Match version header
  → Server merges delta, returns updated table
  → tableFromIPC(response) — new zero-copy server table
  → clearOverlays()
```

## Scaling

| Operation | 200 rows | 5K rows | 50K rows |
|-----------|----------|---------|----------|
| Field edit (overlay) | 0.001ms | 0.001ms | 0.001ms |
| rematerialize (current) | 0.5ms | 12ms | **120ms** |
| getFieldValue (proposed) | 0.001ms | 0.001ms | 0.001ms |
| Pixi field patch | 0.01ms | 0.01ms | 0.01ms |
| Pixi structural sync | 2ms | 7ms | 40ms |
| Append/delete | 0.5ms | 12ms | 120ms |
| Save (3 rows delta) | 1ms | 1ms | 1ms |

**Current bottleneck**: `rematerialize()` runs on every field edit = O(N × columns).
**Fix**: Remove `rematerialize()` from field edits, use `getFieldValue()` for reads.

## Store API

```typescript
// Read
annotationStore.table(pageId)              // materialized Table (for list iteration)
annotationStore.serverTable(pageId)        // original server Table (zero-copy base)
annotationStore.getFieldValue(pageId, i, f) // read with overlay check — O(1)
annotationStore.fieldVersion(pageId)       // reactive counter for sidebar
annotationStore.structuralVersion(pageId)  // reactive counter for Pixi
annotationStore.isDirty(pageId)            // has unsaved changes
annotationStore.version(pageId)            // server ETag

// Write (field edits — O(1), no rebuild)
annotationStore.updateLocal(pageId, index, { field: value })
annotationStore.batchUpdateLocal(pageId, Map<index, updates>)

// Write (structural — triggers rebuild)
annotationStore.appendLocal(pageId, row)
annotationStore.deleteLocal(pageId, index)

// Undo/Redo (snapshots overlay state)
annotationStore.undo(pageId)
annotationStore.redo(pageId)

// Persistence
annotationStore.load(pageId)   // fetch Arrow IPC from server
annotationStore.save(pageId)   // send delta to server
```

## Arrow Anti-Patterns We Avoid

1. **Row iteration**: Never `table.get(i)` in hot loops — use column arrays
2. **`tableFromArrays` in edit path**: Deferred to structural changes only
3. **Repeated string decode**: Use `vector.memoize()` for Utf8 columns
4. **Lost metadata**: `new Schema(fields, originalTable.schema.metadata)` on rebuild
5. **Hardcoded List detection**: Use `DataType.isList(field.type)` not `field.name === "polygon"`
6. **`makeTable` vs `tableFromArrays`**: `makeTable` is zero-copy but only for TypedArray columns. Our mixed types (Float32 + Utf8 + List) require `tableFromArrays`

## Future: Lance Integration

```
Lance (S3) → Arrow Flight SQL → Arrow IPC stream → Client store

Read:  SELECT * FROM annotations WHERE page_id = ? AND version = ?
       → RecordBatch stream → progressive render

Write: Client dirty overlays → delta Arrow IPC → server
       → Lance merge_insert("id") → new version
       → Single manifest = 1 atomic write

Compare: Load version N (left) + version M (right)
         → Two sets of overlays, one Pixi canvas with split viewports
```

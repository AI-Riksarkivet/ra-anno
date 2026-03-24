# Arrow JS Type System

## Type Hierarchy

```
DataType (abstract)
├── Null
├── Int (Int8, Int16, Int32, Int64, Uint8, Uint16, Uint32, Uint64)
├── Float (Float16, Float32, Float64)
├── Bool
├── Utf8
├── LargeUtf8
├── Binary
├── LargeBinary
├── FixedSizeBinary(byteWidth)
├── Decimal(scale, precision, bitWidth)
├── Date_ (DateDay, DateMillisecond)
├── Time (TimeSecond, TimeMillisecond, TimeMicrosecond, TimeNanosecond)
├── Timestamp (TimestampSecond, TimestampMillisecond, TimestampMicrosecond, TimestampNanosecond)
├── Interval (IntervalDayTime, IntervalYearMonth, IntervalMonthDayNano)
├── Duration (DurationSecond, DurationMillisecond, DurationMicrosecond, DurationNanosecond)
├── List(child)
├── FixedSizeList(child, listSize)
├── Struct(children)
├── Map_(keyType, valueType)
├── Union (SparseUnion, DenseUnion)
└── Dictionary(valueType, indexType)
```

## Constructing Types

```typescript
import {
  Int8, Int16, Int32, Int64,
  Uint8, Uint16, Uint32, Uint64,
  Float16, Float32, Float64,
  Utf8, Bool, Binary,
  List, Struct, Dictionary,
  Field, Schema,
  DateMillisecond, TimestampMillisecond,
  FixedSizeBinary, FixedSizeList,
} from "apache-arrow"

// Primitive types — use as instances
new Int32()
new Float64()
new Utf8()
new Bool()

// Parameterized types
new List(new Field("item", new Float32()))           // List<Float32>
new FixedSizeList(4, new Field("item", new Float32())) // FixedSizeList<Float32>[4]
new Struct([                                          // Struct<{x: Float32, y: Float32}>
  new Field("x", new Float32()),
  new Field("y", new Float32()),
])
new Dictionary(new Utf8(), new Int32())              // Dictionary<Utf8, Int32>
new FixedSizeBinary(16)                              // 16-byte fixed binary
```

## Type → TypedArray mapping

| Arrow Type | `.toArray()` returns | `Data.values` type |
|-----------|---------------------|-------------------|
| `Int8` | `Int8Array` | `Int8Array` |
| `Int16` | `Int16Array` | `Int16Array` |
| `Int32` | `Int32Array` | `Int32Array` |
| `Int64` | `BigInt64Array` | `Int32Array` (pair) |
| `Uint8` | `Uint8Array` | `Uint8Array` |
| `Uint16` | `Uint16Array` | `Uint16Array` |
| `Uint32` | `Uint32Array` | `Uint32Array` |
| `Uint64` | `BigUint64Array` | `Uint32Array` (pair) |
| `Float16` | `Uint16Array` | `Uint16Array` |
| `Float32` | `Float32Array` | `Float32Array` |
| `Float64` | `Float64Array` | `Float64Array` |
| `Bool` | `Uint8Array` (bit-packed) | `Uint8Array` |
| `Utf8` | `string[]` (decoded) | `Uint8Array` (raw bytes) |
| `Binary` | `Uint8Array[]` | `Uint8Array` |

## Type guards

All static methods on `DataType`:

```typescript
import { DataType } from "apache-arrow"

DataType.isInt(type)        // Int8/16/32/64, Uint8/16/32/64
DataType.isFloat(type)      // Float16/32/64
DataType.isUtf8(type)       // Utf8
DataType.isBool(type)       // Bool
DataType.isBinary(type)     // Binary
DataType.isDecimal(type)    // Decimal
DataType.isDate(type)       // DateDay, DateMillisecond
DataType.isTime(type)       // TimeSecond/Millisecond/Microsecond/Nanosecond
DataType.isTimestamp(type)  // Timestamp*
DataType.isInterval(type)   // Interval*
DataType.isDuration(type)   // Duration*
DataType.isList(type)       // List
DataType.isStruct(type)     // Struct
DataType.isUnion(type)      // SparseUnion, DenseUnion
DataType.isDictionary(type) // Dictionary
DataType.isFixedSizeBinary(type)
DataType.isFixedSizeList(type)
DataType.isMap(type)
DataType.isNull(type)
DataType.isLargeBinary(type)
DataType.isLargeUtf8(type)
```

## Type enum (Type.ts)

```typescript
import { Type } from "apache-arrow"

Type.Int    // 2
Type.Float  // 3
Type.Utf8   // 5
Type.Bool   // 6
Type.List   // 12
Type.Struct // 13

// Narrow sub-types (negative IDs)
Type.Int32    // -4
Type.Float32  // -11
Type.Float64  // -12
```

## Field and Schema

```typescript
// Field = name + type + nullable + metadata
const field = new Field("score", new Float32(), true)  // nullable
const field2 = new Field("id", new Int32(), false)     // non-nullable

// Schema = ordered list of Fields + metadata
const schema = new Schema(
  [field, field2],
  new Map([["version", "1"]])  // optional metadata
)

// Access
schema.fields        // Field[]
schema.metadata      // Map<string, string>
schema.fields[0].name  // "score"
schema.fields[0].type  // Float32
schema.fields[0].nullable  // true
```

## vectorFromArray type inference

| JS input | Inferred Arrow type |
|----------|-------------------|
| `number[]` | `Float64` |
| `string[]` | `Dictionary<Utf8, Int32>` |
| `boolean[]` | `Bool` |
| `Date[]` | `TimestampMillisecond` |
| `bigint[]` | `Int64` |
| `null[]` | `Null` |
| `object[]` | `Struct` (fields inferred from first object) |
| `Uint8Array[]` | `Binary` |

Override with explicit type: `vectorFromArray([1, 2, 3], new Int8)`

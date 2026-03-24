# Effect-TS Anti-Patterns

## 1. Using Defects for Expected Errors

```typescript
// WRONG
if (!user) return yield* Effect.die(new Error("User not found"))

// RIGHT — typed error the caller can handle
if (!user) return yield* new NotFoundError({ id })
```

## 2. Swallowing Errors

```typescript
// WRONG — error info lost
Effect.catchAll(loadConfig, () => Effect.succeed(defaultConfig))

// RIGHT — log before fallback
pipe(loadConfig,
  Effect.tapError((e) => Effect.log(`Config failed: ${e}`, { level: "warn" })),
  Effect.catchAll(() => Effect.succeed(defaultConfig))
)
```

## 3. Generic Error Types

```typescript
// WRONG
const process = (data: Data): Effect.Effect<Result, Error> => ...

// RIGHT — discriminated union
type ProcessError = ValidationError | TransformError | SaveError
const process = (data: Data): Effect.Effect<Result, ProcessError> => ...
```

## 4. Uncontrolled Parallelism

```typescript
// WRONG — may overwhelm resources
Effect.all(items.map(processItem), { concurrency: "unbounded" })

// RIGHT
Effect.all(items.map(processItem), { concurrency: 10 })
```

## 5. Forgetting to Join Forked Fibers

```typescript
// WRONG — fiber errors lost
yield* Effect.fork(backgroundTask)

// RIGHT — join or explicitly handle
const fiber = yield* Effect.fork(backgroundTask)
yield* Fiber.join(fiber)
```

## 6. Closure Variables for Shared State

```typescript
// WRONG — race condition
let counter = 0
const increment = Effect.sync(() => { counter++ })

// RIGHT — Ref for atomic updates
const counter = yield* Ref.make(0)
yield* Ref.update(counter, n => n + 1)
```

## 7. Heavy Computation in Effect.sync

```typescript
// WRONG — blocks fiber runtime
const heavy = Effect.sync(() => computeExpensiveResult())

// RIGHT — yield to other fibers
const heavy = Effect.forEach(
  chunk(items, 100),
  (chunk) => processChunk(chunk).pipe(Effect.tap(() => Effect.yieldNow())),
  { concurrency: 1 }
)
```

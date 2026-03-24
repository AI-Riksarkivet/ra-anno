---
name: Effect-TS + SvelteKit Expert
description: This skill should be used when the user is working with Effect-TS, asks to "write Effect code", "use Effect", "functional TypeScript", "handle errors with Effect", "dependency injection Effect", "Effect Layer", "Effect Schema", or needs expert-level guidance on Effect-TS patterns with Svelte 5 and SvelteKit 2.
user-invocable: true
context: current
---

# Effect-TS + SvelteKit Expert

Expert-level guidance for Effect-TS functional programming with typed errors, dependency injection, concurrency, and production-ready patterns — tailored for **Svelte 5 + SvelteKit 2 + Deno**.

## Core Concepts

### The Effect Type

```typescript
Effect<Success, Error, Requirements>
//     ^        ^       ^
//     |        |       └── Services/dependencies needed (Context)
//     |        └────────── Typed error channel
//     └─────────────────── Success value type
```

**Key insight:** Effects are lazy descriptions of computations. They don't execute until run.

### Creating Effects

```typescript
import { Effect } from "effect"

// From pure values
const success = Effect.succeed(42)
const failure = Effect.fail(new Error("oops"))

// From sync code (may throw)
const trySync = Effect.try({
  try: () => JSON.parse(data),
  catch: (e) => new ParseError(e)
})

// From async code
const tryPromise = Effect.tryPromise({
  try: () => fetch(url).then(r => r.json()),
  catch: (e) => new FetchError(e)
})

// From callbacks
const callback = Effect.async<string, Error>((resume) => {
  someCallbackApi((err, result) => {
    if (err) resume(Effect.fail(err))
    else resume(Effect.succeed(result))
  })
})
```

### Running Effects

```typescript
// Development/testing
Effect.runSync(effect)           // Sync, throws on async/error
Effect.runPromise(effect)        // Returns Promise<A>
Effect.runPromiseExit(effect)    // Returns Promise<Exit<A, E>>

// Production (with runtime)
import { ManagedRuntime } from "effect"
const runtime = ManagedRuntime.make(AppLayer)
await runtime.runPromise(effect)
```

## Building Pipelines

### pipe and Effect.gen

```typescript
import { Effect, pipe } from "effect"

// Using pipe (point-free style)
const program = pipe(
  Effect.succeed(5),
  Effect.map(n => n * 2),
  Effect.flatMap(n => n > 5
    ? Effect.succeed(n)
    : Effect.fail(new Error("too small"))
  ),
  Effect.tap(n => Effect.log(`Result: ${n}`))
)

// Using Effect.gen (generator style - RECOMMENDED)
const program = Effect.gen(function* () {
  const n = yield* Effect.succeed(5)
  const doubled = n * 2
  if (doubled <= 5) {
    return yield* Effect.fail(new Error("too small"))
  }
  yield* Effect.log(`Result: ${doubled}`)
  return doubled
})
```

### Effect.fn (preferred for named functions)

```typescript
// Automatic tracing and telemetry + better stack traces
const fetchUser = Effect.fn("fetchUser")(function* (id: string) {
  const db = yield* Database
  return yield* db.query(id)
})
```

**Recommendation:** Prefer `Effect.gen` for readability. Use `Effect.fn` for named service functions. Use `pipe` for simple transformations.

## Error Handling

### Error Taxonomy

| Category | Examples | Recovery |
|----------|----------|----------|
| **Expected Rejections** | User cancel, deny | Graceful exit, no retry |
| **Domain Errors** | Validation, not found, permissions | Show to user, don't retry |
| **Defects** | Bugs, invariant violations | Log + alert, investigate |
| **Interruptions** | Fiber cancel, timeout | Cleanup, may retry |
| **Unknown/Foreign** | Thrown exceptions | Normalize at boundary |

### Typed Errors

```typescript
import { Data, Effect, Schema } from "effect"

// Option 1: Data.TaggedError (simple)
class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string
}> {}

// Option 2: Schema.TaggedError (with codec for serialization)
class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

// Direct yield of errors (no Effect.fail wrapper needed)
Effect.gen(function* () {
  if (!user) {
    return yield* new NotFoundError({ id })
  }
})

// Defects — for bugs, not domain errors
const divide = (a: number, b: number): Effect.Effect<number> =>
  b === 0
    ? Effect.die(new Error("Division by zero"))
    : Effect.succeed(a / b)
```

### Error Recovery

```typescript
// Catch all errors
Effect.catchAll(effect, (error) => Effect.succeed(fallback))

// Catch specific tagged errors
Effect.catchTag(effect, "NotFoundError", (e) => Effect.succeed(defaultUser))

// Catch multiple tags
Effect.catchTags(effect, {
  NotFoundError: (e) => Effect.succeed(defaultUser),
  ValidationError: (e) => Effect.fail(new HttpError(400, e.message))
})

// Normalize unknown errors at boundary
const safeBoundary = Effect.catchAllDefect(effect, (defect) =>
  Effect.fail(new UnknownError({ cause: defect }))
)

// Handle interruptions differently
Effect.onInterrupt(effect, () => Effect.log("Operation cancelled"))

// Retry on failure
Effect.retry(effect, Schedule.recurs(3))
```

### Pattern Matching (Match Module)

```typescript
import { Match } from "effect"

// Type-safe exhaustive matching on tagged errors
const handleError = Match.type<AppError>().pipe(
  Match.tag("NotFoundError", () => null),
  Match.tag("ValidationError", (e) => e.message),
  Match.tag("NetworkError", () => "Connection failed"),
  Match.exhaustive  // Compile error if case missing
)

// Replace nested catchTag chains
Effect.catchAll(effect, (error) =>
  Match.value(error).pipe(
    Match.tag("A", handleA),
    Match.tag("B", handleB),
    Match.exhaustive
  )
)
```

## Dependency Injection

### Services with Context.Tag

```typescript
import { Context, Effect, Layer } from "effect"

// 1. Define service interface
class UserRepository extends Context.Tag("UserRepository")<
  UserRepository,
  {
    readonly findById: (id: string) => Effect.Effect<User, NotFoundError>
    readonly save: (user: User) => Effect.Effect<void>
  }
>() {}

// 2. Use in effects
const getUser = (id: string) => Effect.gen(function* () {
  const repo = yield* UserRepository
  return yield* repo.findById(id)
})
// Type: Effect<User, NotFoundError, UserRepository>

// 3. Create layer implementation
const UserRepositoryLive = Layer.succeed(UserRepository, {
  findById: (id) => Effect.tryPromise(() => db.users.find(id)),
  save: (user) => Effect.tryPromise(() => db.users.save(user))
})

// 4. Provide to run
const runnable = Effect.provide(getUser("123"), UserRepositoryLive)
```

### Effect.Service (Simplified Pattern)

```typescript
// Combines Tag + Layer in one declaration
class Logger extends Effect.Service<Logger>()("Logger", {
  accessors: true,  // Auto-generate static method accessors
  effect: Effect.gen(function* () {
    const config = yield* Config
    return {
      log: (msg: string) => Effect.sync(() =>
        console.log(`[${config.level}] ${msg}`)
      )
    }
  }),
  dependencies: [ConfigLive]
}) {}

// Use directly via accessors
yield* Logger.log("Hello")

// Access via Layer
Effect.provide(program, Logger.Default)
```

### Context.Reference (defaultable tags)

```typescript
// No Layer required if default value suffices
class MaxRetries extends Context.Reference<MaxRetries>()(
  "MaxRetries",
  { defaultValue: () => 3 }
) {}
```

### Layer Composition

```typescript
// Merge independent layers
const BaseLayer = Layer.merge(ConfigLive, LoggerLive)

// Provide dependencies
const DbLayer = Layer.provide(DatabaseLive, ConfigLive)

// Full composition
const AppLayer = pipe(
  Layer.merge(ConfigLive, LoggerLive),
  Layer.provideMerge(DatabaseLive),
  Layer.provideMerge(UserRepositoryLive)
)
```

## SvelteKit 2 Integration

### Remote Functions with Effect + Schema

SvelteKit 2's `query()`, `command()`, and `form()` integrate with Effect via Schema's StandardSchema support.

**Simple approach (runPromiseExit):**

```typescript
// src/lib/server/effect-remote.ts
import type { RemoteFormInput } from "@sveltejs/kit";
import { command, form, query } from "$app/server";
import { Effect, Schema } from "effect";

export const effectfulQuery = <A, E, ASchema, ISchema>(
  schema: Schema.Schema<ASchema, ISchema, never>,
  handler: (args: ASchema) => Effect.Effect<A, E, never>
) => query(
  Schema.standardSchemaV1(schema),
  async (args) => Effect.runPromiseExit(handler(args))
);

export const effectfulCommand = <A, E, ASchema, ISchema>(
  schema: Schema.Schema<ASchema, ISchema, never>,
  handler: (args: ASchema) => Effect.Effect<A, E, never>
) => command(
  Schema.standardSchemaV1(schema),
  async (args) => Effect.runPromiseExit(handler(args))
);

export const effectfulForm = <
  A, E,
  ASchema extends Record<string, any>,
  ISchema extends RemoteFormInput
>(
  schema: Schema.Schema<ASchema, ISchema, never>,
  handler: (args: ASchema) => Effect.Effect<A, E, never>
) => form(
  Schema.standardSchemaV1(schema),
  async (args) => Effect.runPromiseExit(handler(args))
);
```

**Usage in a .remote.ts file:**

```typescript
// src/routes/api/users/users.remote.ts
import { Effect, Schema } from "effect"
import { effectfulQuery, effectfulCommand } from "$lib/server/effect-remote"

const GetUserArgs = Schema.Struct({ id: Schema.String })

export const getUser = effectfulQuery(
  GetUserArgs,
  (args) => Effect.gen(function* () {
    const repo = yield* UserRepository
    return yield* repo.findById(args.id)
  })
)
```

### Effect in SvelteKit Server Routes (+server.ts)

```typescript
// src/routes/api/data/+server.ts
import { Effect, ManagedRuntime } from "effect"
import type { RequestHandler } from "./$types"

const runtime = ManagedRuntime.make(AppLayer)

export const GET: RequestHandler = async ({ params }) => {
  const result = await runtime.runPromise(
    Effect.gen(function* () {
      const service = yield* DataService
      return yield* service.getData(params.id)
    })
  )
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" }
  })
}
```

### Effect in SvelteKit Load Functions (+page.ts)

```typescript
// src/routes/dashboard/+page.ts
import { Effect } from "effect"
import type { PageLoad } from "./$types"

export const load: PageLoad = async ({ fetch }) => {
  // Wrap fetch in Effect for typed error handling
  const getData = Effect.tryPromise({
    try: () => fetch("/api/data").then(r => r.json()),
    catch: () => new FetchError({ endpoint: "/api/data" })
  })

  const data = await Effect.runPromise(getData)
  return { data }
}
```

### Effect with Svelte 5 Runes

```typescript
// src/lib/stores/data.svelte.ts
import { Effect, ManagedRuntime } from "effect"

const runtime = ManagedRuntime.make(AppLayer)

class DataStore {
  items = $state<Item[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  async load() {
    this.loading = true
    this.error = null

    const exit = await runtime.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* DataService
        return yield* service.fetchAll()
      })
    )

    if (exit._tag === "Success") {
      this.items = exit.value
    } else {
      this.error = `Load failed: ${exit.cause}`
    }
    this.loading = false
  }
}

export const dataStore = new DataStore()
```

## Concurrency

```typescript
// Fork to run concurrently
const fiber = yield* Effect.fork(longRunningTask)
const result = yield* Fiber.join(fiber)
yield* Fiber.interrupt(fiber)

// Race - first to complete wins
const fastest = yield* Effect.race(task1, task2)

// All - run all, collect results (with concurrency limit)
const results = yield* Effect.all(tasks, { concurrency: 5 })

// Collect ALL errors (not just first)
Effect.all([e1, e2, e3], { mode: "validate" })

// Partial success handling
Effect.partition([e1, e2, e3])  // Returns [failures, successes]
```

### Synchronization Primitives

```typescript
// Ref - atomic mutable reference
const counter = yield* Ref.make(0)
yield* Ref.update(counter, n => n + 1)

// Queue - bounded producer/consumer
const queue = yield* Queue.bounded<number>(100)
yield* Queue.offer(queue, 42)
const item = yield* Queue.take(queue)

// Semaphore - limit concurrent access
const sem = yield* Effect.makeSemaphore(3)
yield* sem.withPermits(1)(expensiveOperation)

// Deferred - one-shot signal
const deferred = yield* Deferred.make<string, Error>()
yield* Deferred.succeed(deferred, "done")
```

### SubscriptionRef (Reactive References)

```typescript
// WARNING: Never use unsafeMake — it may not exist in your Effect version.
SubscriptionRef.make(initial)      // Create reactive reference (safe)
SubscriptionRef.get(ref)           // Read current value
SubscriptionRef.set(ref, value)    // Update value (notifies subscribers)
SubscriptionRef.changes(ref)       // Stream of value changes
```

## Resource Management

```typescript
// Acquire/release pattern
const file = Effect.acquireRelease(
  Effect.sync(() => fs.openSync(path, "r")),
  (fd) => Effect.sync(() => fs.closeSync(fd))
)

const program = Effect.scoped(
  Effect.gen(function* () {
    const fd = yield* file
    return yield* readFile(fd)
  })
)

// Finalizers
yield* Effect.addFinalizer((exit) =>
  Effect.log(`Cleanup: ${exit._tag}`)
)
```

## Schema (Validation & Encoding)

```typescript
import { Schema } from "effect"

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  age: Schema.Number,
  email: Schema.optionalWith(Schema.String, { as: "Option" }),
})

// Decode (unknown → typed)
const user = Schema.decodeUnknownSync(User)(data)

// Encode (typed → serializable)
const json = Schema.encodeSync(User)(user)

// StandardSchema for SvelteKit integration
const standard = Schema.standardSchemaV1(User)
```

## Configuration

```typescript
import { Config, Redacted } from "effect"

const port = Config.number("PORT")
const host = Config.string("HOST").pipe(Config.withDefault("localhost"))
const apiKey = Config.redacted("API_KEY")  // Masked in logs

// Nested with prefix
const dbConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.number("PORT"),
}).pipe(Config.nested("DATABASE"))  // DATABASE_HOST, DATABASE_PORT

// Duration strings (human-readable)
Duration.toMillis("5 minutes")    // 300000
Duration.toMillis("30 seconds")   // 30000
```

## Quick Reference

### Common Operators

| Operator | Purpose |
|----------|---------|
| `Effect.map` | Transform success value |
| `Effect.flatMap` | Chain effects (monadic bind) |
| `Effect.tap` | Side effect, keep original value |
| `Effect.andThen` | Sequence, can be value or effect |
| `Effect.catchAll` | Handle all errors |
| `Effect.catchTag` | Handle specific tagged error |
| `Effect.provide` | Inject dependencies |
| `Effect.retry` | Retry with schedule |
| `Effect.timeout` | Add timeout |
| `Effect.fork` | Run concurrently |
| `Effect.all` | Parallel execution |

### Option vs null Rule

- Internal Effect computations → `Option<T>`
- Svelte state/props → `T | null`
- JSON serialization → `T | null` or `T | undefined`
- External API responses → normalize to `Option<T>` at boundary

```typescript
import { Option } from "effect"
const fromApi = Option.fromNullable(response.data)
const toSvelte = Option.getOrNull(maybeValue)
```

## Reference Documents

- **`./references/critical-rules.md`** — Forbidden patterns and mandatory conventions
- **`./references/anti-patterns.md`** — Common mistakes and fixes
- **`./references/streams.md`** — Stream, backpressure, bounded consumption
- **`./references/testing.md`** — Vitest deterministic testing with TestClock
- **`./references/sveltekit.md`** — SvelteKit remote functions, load functions, server routes

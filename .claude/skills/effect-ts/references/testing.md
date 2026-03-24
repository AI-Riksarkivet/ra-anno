# Testing Effect-TS (Vitest)

## The #1 gotcha: `it.effect` uses TestClock

Time starts at 0, does NOT pass unless you advance it. Any `Effect.sleep`, `Schedule.spaced`, retry backoff will stall forever.

```typescript
import { TestClock, Effect, Fiber } from "effect"

// Fork + advance pattern for retries/timeouts
const runWithTime = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  adjust: Parameters<typeof TestClock.adjust>[0] = "1000 millis"
) => Effect.gen(function* () {
  const fiber = yield* Effect.fork(effect);
  yield* TestClock.adjust(adjust);
  return yield* Fiber.join(fiber);
});
```

Use `it.live` when you need wall-clock time.

## Don't use Date.now() in Effect code

```typescript
// WRONG — not controllable under TestClock
const now = Date.now()

// RIGHT
const now = yield* Clock.currentTimeMillis
```

## Test layers with mocks

```typescript
it("should save user", async () => {
  const users = new Map<string, User>()
  const TestDb = Layer.succeed(Database, {
    save: (u) => Effect.sync(() => { users.set(u.id, u) }),
    find: (id) => Effect.sync(() => users.get(id) ?? null)
  })

  const program = saveUser(testUser).pipe(Effect.provide(TestDb))
  await Effect.runPromise(program)
  expect(users.has(testUser.id)).toBe(true)
})
```

## Concurrency gotcha: fork does NOT mean "started"

```typescript
// Deterministic overlap: started latch + gate
const started = yield* Deferred.make<void>()
const gate = yield* Deferred.make<void>()

const underlying = Effect.gen(function* () {
  yield* Deferred.succeed(started, undefined) // Signal: I'm running
  yield* Deferred.await(gate)                 // Block until gate opens
  return "ok"
})

const f1 = yield* Effect.fork(underlying)
const f2 = yield* Effect.fork(underlying)
yield* Deferred.await(started)        // Wait for at least one fiber
yield* Deferred.succeed(gate, undefined)  // Release all
```

## Quick decision table

| Scenario | Use |
|----------|-----|
| Uses timeouts/sleeps/retries | `it.effect` + `TestClock.adjust` |
| Needs wall clock / real delays | `it.live` |
| Allocates scoped resources | `it.scoped` / `it.scopedLive` |

## Don't escape the test runtime

Never call `Effect.runPromise()` inside an `it.effect` test. Stay inside the Effect and `yield*` everything.

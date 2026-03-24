# Critical Rules for Effect-TS

## INEFFECTIVE: try-catch in Effect.gen

Effect failures are returned as exits, not thrown. `try-catch` will NOT catch Effect failures.

```typescript
// WRONG — catches nothing
Effect.gen(function* () {
  try {
    const result = yield* someEffect;
  } catch (error) {
    // Effect failures bypass this entirely
  }
});

// CORRECT
Effect.gen(function* () {
  const result = yield* Effect.result(someEffect);
  if (result._tag === "Failure") { /* handle */ }
});
```

Use `Effect.catchAll` / `Effect.catchTag` / `Effect.result` instead.

## AVOID: Type Assertions

Never use `as never`, `as any`, `as unknown`. Fix the underlying type issue.

## RECOMMENDED: return yield* for Errors

Use `return yield*` when yielding errors — makes termination explicit.

```typescript
Effect.gen(function* () {
  if (someCondition) {
    return yield* Effect.fail(new MyError());
  }
  return yield* someOtherEffect;
});
```

## Use Effect.tryPromise, not Effect.promise

`Effect.promise` turns rejections into defects (untyped). Always prefer `Effect.tryPromise` with error mapping.

```typescript
// WRONG
const data = Effect.promise(() => fetch(url).then(r => r.json()))

// CORRECT
const data = Effect.tryPromise({
  try: () => fetch(url).then(r => r.json()),
  catch: (e) => new FetchError({ message: String(e) })
})
```

## Provide Layers at composition root, not mid-workflow

```typescript
// WRONG — Layer provided deep in call stack
const saved = yield* pipe(saveOrder(validated), Effect.provide(DatabaseLayer))

// CORRECT — Effects declare requirements, layers at top
const processOrder = (order: Order) => Effect.gen(function* () {
  const repo = yield* OrderRepository
  return yield* repo.save(order)
})
// main.ts: Effect.provide(processOrder(order), AppLayer)
```

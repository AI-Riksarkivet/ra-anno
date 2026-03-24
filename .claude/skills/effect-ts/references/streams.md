# Stream Patterns

Streams are lazy, pull-based sequences. Handle with care — infinite streams can hang.

## Create

```typescript
Stream.make(1, 2, 3)
Stream.fromIterable([1, 2, 3])
Stream.fromEffect(fetchUser())
Stream.repeatEffect(Effect.sync(() => Math.random()))
Stream.fromAsyncIterable(asyncGen(), (e) => new StreamError({ cause: e }))
```

## Consume (always bound!)

```typescript
// WRONG — hangs on infinite stream
yield* Stream.runCollect(infiniteStream)

// RIGHT — bounded
yield* Stream.runCollect(Stream.take(stream, 100))
yield* Stream.runCollect(Stream.takeUntil(stream, x => x > 100))
yield* Stream.runCollect(stream).pipe(Effect.timeout("5 seconds"))

// Process each
yield* Stream.runForEach(stream, (v) => Effect.log(`Got: ${v}`))
yield* Stream.runFold(stream, 0, (acc, n) => acc + n)
yield* Stream.runHead(stream)  // Option<A>
```

## Transform

```typescript
Stream.map(stream, x => x * 2)
Stream.filter(stream, x => x > 0)
Stream.flatMap(userIds, id => Stream.fromEffect(fetchUser(id)))
Stream.scan(stream, 0, (acc, x) => acc + x)  // Running totals
```

## Batch

```typescript
Stream.grouped(stream, 100)                    // Chunks of N
Stream.groupedWithin(stream, 100, "1 second")  // By time window
```

## Error Handling

```typescript
Stream.catchAll(stream, (error) => Stream.make(fallback))
Stream.retry(stream, Schedule.exponential("100 millis"))
```

## Gotchas

1. Always bound infinite stream consumption with `take`, `takeUntil`, or timeout
2. Streams are pull-based — slow consumers apply backpressure automatically
3. Use scoped/bracket patterns for resource-backed streams
4. Rechunk for better performance with small items

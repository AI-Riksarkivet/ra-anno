# Effect + SvelteKit 2 Integration

## Remote Functions (query, command, form)

SvelteKit 2's remote functions work with Effect via Schema's StandardSchema support.

### Helper Library

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

export const effectfulBatchQuery = <A, E, ASchema, ISchema>(
  schema: Schema.Schema<ASchema, ISchema, never>,
  handler: (args: ASchema[]) => Effect.Effect<
    (args: ASchema, index?: number) => Effect.Effect<A, E, never>
  >
) => query.batch(
  Schema.standardSchemaV1(schema),
  async (args) => {
    return (arg, index) =>
      Effect.runSyncExit(
        handler(args).pipe(Effect.andThen((fn) => fn(arg, index)))
      );
  }
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

### Usage in .remote.ts

```typescript
// src/routes/users/users.remote.ts
import { Effect, Schema } from "effect"
import { effectfulQuery, effectfulCommand } from "$lib/server/effect-remote"

const UserIdArgs = Schema.Struct({ id: Schema.String })
const CreateUserArgs = Schema.Struct({
  name: Schema.String,
  email: Schema.String,
})

export const getUser = effectfulQuery(
  UserIdArgs,
  ({ id }) => Effect.gen(function* () {
    const repo = yield* UserRepository
    return yield* repo.findById(id)
  })
)

export const createUser = effectfulCommand(
  CreateUserArgs,
  (args) => Effect.gen(function* () {
    const repo = yield* UserRepository
    return yield* repo.create(args)
  })
)
```

### Consuming in Svelte 5 Components

```svelte
<script lang="ts">
  import { getUser, createUser } from "./users.remote.ts"

  let user = $state(null)

  async function loadUser(id: string) {
    const exit = await getUser({ id })
    if (exit._tag === "Success") {
      user = exit.value
    }
  }
</script>
```

## Server Routes (+server.ts)

Use `ManagedRuntime` for server-side routes with dependency injection:

```typescript
// src/lib/server/runtime.ts
import { ManagedRuntime, Layer } from "effect"

export const AppLayer = Layer.mergeAll(
  DatabaseLive,
  LoggerLive,
  CacheLive,
)

export const appRuntime = ManagedRuntime.make(AppLayer)
```

```typescript
// src/routes/api/data/+server.ts
import { Effect } from "effect"
import { appRuntime } from "$lib/server/runtime"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ params }) => {
  const result = await appRuntime.runPromise(
    Effect.gen(function* () {
      const db = yield* Database
      return yield* db.findById(params.id)
    })
  )
  return Response.json(result)
}
```

## Load Functions (+page.ts)

```typescript
// src/routes/dashboard/+page.ts
import { Effect } from "effect"
import type { PageLoad } from "./$types"

export const load: PageLoad = async ({ fetch }) => {
  const program = Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () => fetch("/api/dashboard"),
      catch: () => new FetchError({ endpoint: "/api/dashboard" })
    })
    return yield* Effect.tryPromise({
      try: () => res.json(),
      catch: () => new ParseError({ message: "Invalid JSON" })
    })
  })

  return { data: await Effect.runPromise(program) }
}
```

## Svelte 5 Rune Stores with Effect

```typescript
// src/lib/stores/users.svelte.ts
import { Effect } from "effect"
import { appRuntime } from "$lib/server/runtime"

class UserStore {
  users = $state<User[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  async load() {
    this.loading = true
    this.error = null

    const exit = await appRuntime.runPromiseExit(
      Effect.gen(function* () {
        const repo = yield* UserRepository
        return yield* repo.findAll()
      })
    )

    if (exit._tag === "Success") {
      this.users = exit.value
    } else {
      this.error = `Failed: ${exit.cause}`
    }
    this.loading = false
  }
}

export const userStore = new UserStore()
```

## Key Patterns

1. Use `runPromiseExit` for UI code — gives you typed success/failure without throwing
2. Use `ManagedRuntime` for server-side code with DI
3. Schema + `standardSchemaV1` bridges Effect validation to SvelteKit remote functions
4. Keep Effect logic in `.ts` files, not `.svelte` — easier to test
5. Svelte 5 `$state` runes work great with Effect's Exit type for loading/error states

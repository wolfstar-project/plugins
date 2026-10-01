# Manager cache view (`manager.cache.<method>`) — design

Date: 2026-10-01
Package: `@wolfstar/plugin-gateway` (breaking; `minor` changeset, as for every breaking change under 0.x)

## Goal

Reads go through `client.users.cache.get(id)` instead of `client.users.get(id)` / `client.users.cached(id)`, and
`CachedManager` takes the shape of the discord.js `next` RFC
([`CachedManager.ts`](https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/managers/CachedManager.ts),
[`util/cache.ts`](https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/util/cache.ts)):
`client`, `cache`, an abstract `createStructure`, and `_add`.

## Decisions

| Topic         | Decision                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Compatibility | Clean break. No deprecated aliases.                                                                         |
| Storage       | Unchanged: `@wolfstar/plugin-cache` keeps holding raw API data. `manager.cache` is a structure-facing view. |
| Cache keys    | `cache.get(key)` takes one key, like the reference. Managers build keys with the existing `resolveKey`.     |
| Resolvers     | `resolveKey` and `resolve(value \| key)` are kept as they are today.                                        |
| Member roles  | `GuildMemberRoleManager` mirrors discord.js's API as closely as an asynchronous cache allows (section 7).   |

## Out of scope

- `@wolfstar/plugin-cache` (no change, no changeset).
- A structure-holding `CollectionCache` / a `CacheConstructor` on the client, as in the reference.
- New enumeration methods on the view (`keys` / `values` / `entries`); the existing `listCached` methods keep
  reading the raw store.

## 1. `Cache<Value>` (`src/util/cache.ts`)

Same surface as the reference interface:

```ts
export interface Cache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> {
  /** Whether every method returns synchronously. `false` without knowing better. */
  readonly synchronous: boolean;
  /** Builds a structure from raw data, without resolving relations or touching the store. */
  readonly construct: StructureCreator<Value, Raw>;
  add(data: Partial<Raw> & { id: string }, overwrite?: boolean): Awaitable<Value>;
  get(key: string): Awaitable<Value | undefined>;
  set(key: string, value: Value): Awaitable<this>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
}
```

`synchronous` is the one addition to the reference: it replaces the guarantee `cached()` gave by throwing on an
asynchronous cache. A caller needing a synchronous read checks it before calling `get`.

`add`'s `data` is typed after the reference (`{ id }`), but the key is derived by the manager (`keyOf`), since several
entities are not keyed by `id` alone (members, voice states, presences, thread members, messages, roles, bans, invites).
For those the constraint is relaxed to `Partial<Raw>`.

## 2. `EntityCacheView` (`src/util/EntityCacheView.ts`, internal)

The only implementation of `Cache<Value>`. Constructed by `CachedManager` with:

- `store: () => EntityCache<Raw> | undefined` — a getter, so a store attached to `client.cache` after the manager was
  built is still picked up.
- `hydrate(raw): Awaitable<Value>` — the manager's relation-resolving build, bound to the client.
- `construct(raw): Value` — the manager's `createStructure`.
- `keyOf(raw): string`
- `guard(operation, key, run, fallback)` — the existing `cacheError` / `cacheErrors: "miss"` reporting.

Behaviour:

| Method        | With a store                                                        | Without a store     |
| ------------- | ------------------------------------------------------------------- | ------------------- |
| `get`         | `store.get` → `hydrate`; `undefined` on a miss                      | `undefined`         |
| `set`         | `store.set(key, value.toJSON())`, returns the view                  | no-op, returns view |
| `add`         | `store.upsert(keyOf(data), data, { overwrite })` → `hydrate(added)` | `hydrate(data)`     |
| `has`         | `store.has`                                                         | `false`             |
| `delete`      | `store.delete`                                                      | `false`             |
| `clear`       | `store.clear`                                                       | no-op               |
| `getSize`     | `store.getSize`                                                     | `0`                 |
| `synchronous` | `store.synchronous === true`                                        | `true`              |

Every store call goes through `guard`, so a failing store emits `cacheError` and, under `cacheErrors: "miss"`, resolves
to the "without a store" column. Methods stay synchronous when the store is (`whenAll`), so
`createInMemoryCache` users can call `cache.get(id)` without awaiting.

## 3. `CachedManager` (`src/managers/CachedManager.ts`)

```ts
export abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> {
  public readonly client: GatewayClient;
  public readonly cache: Cache<Value>;

  protected abstract createStructure(data: CacheEntityTypes[Name], ...extras: unknown[]): Value;

  public constructor(client: GatewayClient, name: Name);

  /** @internal */
  public _add(
    data,
    cache = true,
    { id, extras = [] }: { id?: string; extras?: unknown[] } = {},
  ): Promise<Value>;

  public abstract resolveKey(...args: Args): string;
  public resolve(value: Value | string): Promise<Value | null>;

  public fetch(...args: [...Args] | [...Args, FetchOptions]): Promise<Value>;
  public refresh(...args: Args): Promise<Value>;
}
```

Changes against today:

- **Removed (public):** `get`, `cached`, `_get`, `entity`, `construct`, `resolveData`, `hydrate`,
  the deprecated public `createStructure`, the `BaseManager` export alias, and the `EntityCache`-typed `cache` getter.
  The raw store stays reachable as `client.cache?.<name>`.
- **`createStructure`** becomes the abstract, protected creator (today's `construct`), as in the reference.
- **`_add`** keeps its merge semantics; its options are renamed to the reference's `{ id, extras }` (`id` replaces
  `key`). `extras` are forwarded to `createStructure`.
- **`resolveKey`** and **`resolve`** are unchanged: `resolveKey(...args)` builds the cache key, `resolve(value)`
  returns a structure as is or looks a key up in the cache (`null` on a miss).
- **Kept, `@internal`/protected:** `keyOf`, `fetchRaw`, `_hydrate`, `_resolveData`, `build`, `guard`, `cachedGuild`,
  `iterableCache`, `storeRaw`.

Usage:

```ts
const user = await client.users.cache.get(userId);
const member = await client.members.cache.get(client.members.resolveKey(guildId, userId));
const role = await client.roles.resolve(client.roles.resolveKey(guildId, roleId)); // null when not cached
const fetched = await client.users.fetch(userId); // cache first, then REST
```

## 4. Subclass overrides

- **`ChannelManager`**: today `_get` falls back to the thread cache and `_add` hands threads to `client.threads`.
  The fallback moves into a `cache` view subclass/wrapper whose `get`/`has`/`delete` consult the thread store on a
  miss and whose `add`/`set` route thread types to `client.threads.cache`. `channels.cache.get(threadId)` keeps working.
- **`GuildManager._getShallow`** and the other `@internal` relation helpers keep reading the raw store directly
  (`client.cache?.guilds`), since they exist to avoid full hydration.
- Guild-scoped managers (`AutoModerationRuleManager`, `GuildIntegrationManager`, `GuildScheduledEventManager`,
  `GuildSoundboardSoundManager`, `StageInstanceManager`, `GuildBanManager`, …) keep their `guildId` and their own key
  scheme behind `keyFor`.

## 5. Call sites

Mechanical migration across `src/` (actions, structures, `GatewayClient`, the non-cached "view" managers), tests, the
type-level consumption test and the README:

| Before                          | After                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `manager.get(id)`               | `manager.cache.get(id)`                                                                         |
| `manager.get(a, b)`             | `manager.cache.get(manager.resolveKey(a, b))`                                                   |
| `manager.cached(id)`            | `manager.cache.get(id)` (guarded by `cache.synchronous` where the caller must stay synchronous) |
| `manager._get(...)`             | `manager.cache.get(...)`                                                                        |
| `manager.cache?.get(key)` (raw) | `client.cache?.<name>?.get(key)`                                                                |
| `manager.construct(data)`       | `manager.cache.construct(data)`                                                                 |

The `CacheAsynchronous` / `CacheRelationsAsynchronous` error codes are dropped if nothing else throws them.

## 6. Testing

Test-first:

- `tests/entity-cache-view.test.ts` (new): each method against a synchronous store, an asynchronous store, no store,
  and a throwing store under both `cacheErrors` modes; `set` round-trips through `toJSON`; `add` merges unless
  `overwrite`.
- `tests/cached-manager.test.ts`: rewritten for `cache.*`, `_add({ id, extras })`, `resolve`, `fetch`.
- `tests/zero-cache.test.ts`: `cache` is defined and empty without a store.
- `tests/channels.test.ts` / `threads.test.ts`: thread fallback through `channels.cache`.
- Remaining suites: call-site migration only.

Done when `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass, a **minor** changeset for
`@wolfstar/plugin-gateway` documents the migration table above, and the README examples use `cache.<method>`.

## 7. `GuildMemberRoleManager` — discord.js parity

Reference: discord.js
[`GuildMemberRoleManager.js`](https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/managers/GuildMemberRoleManager.js).
The goal is that code written against discord.js keeps working with at most an added `await`.

| discord.js                                                              | Today here                           | After                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `new GuildMemberRoleManager(member)`                                    | `(client, guildId, userId, roleIds)` | `(member)`                                                                                    |
| `member`, `guild`                                                       | missing                              | `member: GuildMember`, `guild: Guild \| null` (the member's cached guild)                     |
| `cache: Collection<Snowflake, Role>`                                    | missing (`fetch(): Role[]`)          | `cache: Awaitable<Collection<Snowflake, Role>>`, `@everyone` included, uncached roles skipped |
| `highest`, `hoist`, `color`, `icon`, `premiumSubscriberRole`, `botRole` | `fetchHighest()`, `fetchHoist()`, …  | getters returning `Awaitable<Role \| null>`, read from `cache`; the `fetch*` methods are kept |
| `add(RoleResolvable \| RoleResolvable[] \| Collection, reason)`         | `add(string \| string[], reason)`    | same input as discord.js; always resolves to the updated `GuildMember`                        |
| `remove(...)`                                                           | same gap                             | same input as discord.js; always resolves to the updated `GuildMember`                        |
| `set(Collection \| RoleResolvable[], reason)`                           | `set(string[], reason)`              | same input as discord.js                                                                      |
| `clone()`                                                               | missing                              | `clone()`                                                                                     |
| `TypeError` on an invalid element / type                                | `IdUnresolvable` only                | `GatewayTypeError` with new codes `InvalidType` / `InvalidElement` (discord.js's messages)    |

Details:

- `cache` and the getters are `Awaitable`: synchronous with `createInMemoryCache`, a promise with Redis. This is the
  only deviation from discord.js, and the same rule as `manager.cache.get`.
- `highest` is `Role | null` (discord.js: `Role`): `@everyone` may not be cached.
- `color` picks the highest role with `colors.primaryColor`, as discord.js does (today: `color !== 0`).
- A single role goes through the idempotent `PUT` / `DELETE` member-role routes and returns a clone of the member with
  the updated role IDs; several roles go through `set`, which `PATCH`es the member.
- `GuildMemberEditOptions.roles` accepts `readonly RoleResolvable[] | ReadonlyCollection<Snowflake, Role>`, so
  `member.edit({ roles })` matches discord.js too.
- Kept, not in discord.js: `guildId`, `userId`, `ids`, `fetch()` and the `fetch*` variants (they fall back to REST when
  a role is not cached).
- New dependency: `@discordjs/collection` (already installed transitively through `@discordjs/core`).
- `RoleResolvable` already exists in `src/types.ts`.

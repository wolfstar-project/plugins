// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: a cache extending
// `CollectionCache` must be accepted as the client's `cacheConstructor` without any cast, and the options the client
// hands to it must be typed.
import type { CacheEntityName } from "@wolfstar/plugin-cache";
import {
  CollectionCache,
  GatewayClient,
  type Cache,
  type CacheConstructor,
  type CacheConstructorOptions,
  type GatewayClientOptions,
  type RawAPIType,
  type StructureCreator,
  type StructureMixin,
  type User,
} from "../../src/index.js";

const base = { discordToken: "token", discordPublicKey: "key", clientId: "1", intents: 0 };

// The default cache is a `CacheConstructor` itself.
export const defaultConstructor: CacheConstructor = CollectionCache;

// The README's example: a cache extending `CollectionCache`, without a constructor of its own.
export class LoggingCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> extends CollectionCache<Value, Raw> {
  public override delete(key: string): boolean {
    console.log(`${this.name}: ${key} removed`);
    return super.delete(key);
  }
}

export const logging = new GatewayClient({ ...base, cacheConstructor: LoggingCache });

// A subclass with its own constructor, forwarding `keyOf`, `refresh`, and `maxSize` with a default bound.
export class BoundedCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> extends CollectionCache<Value, Raw> {
  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: CacheConstructorOptions<Value, Raw>,
  ) {
    super(creator, name, { ...options, maxSize: options.maxSize ?? 10_000 });
  }
}

export const bounded = new GatewayClient({
  ...base,
  cacheConstructor: BoundedCache,
  cacheOptions: { messages: { maxSize: 200 }, presences: { maxSize: 0 } },
});

// The options the client passes are typed: `keyOf` reads raw data, `refresh` returns the instance.
export function readOptions(value: CacheConstructorOptions<User>, user: User): [string, User] {
  const maxSize: number | undefined = value.maxSize;
  void maxSize;
  return [value.keyOf({ id: "1" }), value.refresh(user)];
}

// Whatever the constructor, the managers expose the RFC's `Cache`.
export const users: Cache<User> = bounded.users.cache;

export const invalid: GatewayClientOptions = {
  ...base,
  // @ts-expect-error `cacheOptions` is keyed by entity name.
  cacheOptions: { nothing: { maxSize: 1 } },
};

// @ts-expect-error A class that is not a `Cache` is not a `CacheConstructor`.
export const notACache: CacheConstructor = Map;

import { Structure as BaseStructure } from "@discordjs/structures";
import type { GatewayClient } from "../GatewayClient.js";
import { existingGatewayClient, getGatewayClient } from "../util/container.js";
import { Mixin } from "./Mixin.js";

// `@discordjs/structures` keys a structure's data and its patch/clone methods with symbols it does not export. They
// are created with `Symbol.for`, in the global registry, so the same key yields the very same symbols here. Each is
// typed as a `unique symbol` of our own, which lets the structures declare typed members keyed by them.

/**
 * The symbol under which a {@link Structure} stores its raw API data, shared with `@discordjs/structures`.
 */
export const kData: unique symbol = Symbol.for("djs.structures.data") as never;

/**
 * The symbol of the method patching a {@link Structure}'s raw data in place, shared with `@discordjs/structures`.
 */
export const kPatch: unique symbol = Symbol.for("djs.structures.patch") as never;

/**
 * The symbol of the method cloning a {@link Structure}, shared with `@discordjs/structures`.
 */
export const kClone: unique symbol = Symbol.for("djs.structures.clone") as never;

/**
 * The symbol under which a {@link Structure} stores its relations: the structures its manager resolved from the cache,
 * like a message's author or a channel's guild.
 */
export const kRelations: unique symbol = Symbol.for("wolfstar.structures.relations") as never;

/**
 * The symbol under which a {@link Structure} stores the client that built it, see {@link StructureMixin.client}.
 */
export const kClient: unique symbol = Symbol.for("wolfstar.structures.client") as never;

/**
 * The symbol of the optional method a mixin defines to drop the relations a patch invalidates, called by
 * {@link StructureMixin}'s patch before the data is patched. Mixins cannot override the patch itself: the first mixin
 * defining a member wins, and {@link StructureMixin} comes first.
 *
 * @internal
 */
export const kPatchRelations: unique symbol = Symbol.for(
  "wolfstar.structures.patchRelations",
) as never;

/**
 * The Discord epoch, used to extract timestamps from snowflakes.
 */
const DiscordEpoch = 1_420_070_400_000n;

type Patch<Data> = (this: object, data: Readonly<Partial<Data>>) => unknown;

const kTimestamps: unique symbol = Symbol("wolfstar.structures.timestamps") as never;

/**
 * The members every structure of this package has on top of `@discordjs/structures`' own: relations resolved from the
 * cache, public patch/clone methods, and parsed timestamps.
 *
 * @remarks
 * It is mixed into {@link Structure} and into every class extending one of `@discordjs/structures`' structures, which
 * also have to call {@link initStructure} from their constructor:
 *
 * ```typescript
 * export interface User extends StructureMixin<APIUser> {}
 * export class User extends BaseUser {
 *   public constructor(data: Partial<APIUser>, relations: object = {}) {
 *     super(data);
 *     initStructure(this, data, relations);
 *   }
 * }
 * Mixin(User, [StructureMixin]);
 * ```
 *
 * @typeParam Data The raw API data the structure wraps.
 * @typeParam Relations The relations of the structure, resolved from the cache by its manager.
 */
export class StructureMixin<Data extends object, Relations extends object = object> {
  /**
   * The raw API data of this structure.
   */
  declare protected [kData]: Readonly<Data>;

  /**
   * The relations of this structure, resolved from the cache by its manager. Public only so that
   * {@link StructureMixin.dropRelations} can check relation names against it.
   *
   * @internal
   */
  declare public [kRelations]: Relations;

  declare private [kTimestamps]?: Map<string, number | null>;

  /**
   * The client that built this structure, set by its manager.
   *
   * @internal
   */
  declare public [kClient]?: GatewayClient;

  /**
   * The client that instantiated this structure, like discord.js's `Base#client`: the one whose manager built it, or
   * the most recently constructed {@link GatewayClient} for structures built by hand from a raw payload.
   *
   * @remarks
   * It is not part of the structure's data, so it is neither serialized by `toJSON` nor stored in the cache.
   */
  public get client(): GatewayClient {
    return this[kClient] ?? getGatewayClient();
  }

  /**
   * The ID of this structure, like discord.js's `Base#valueOf`, so that structures compare and sort by ID. Structures
   * without an ID (a member whose user is unknown, a voice state, ...) are their own value.
   */
  public valueOf(): string | this {
    const { id } = this as { id?: unknown };
    return typeof id === "string" ? id : this;
  }

  /**
   * Resolves a relation like discord.js's getters do: what the manager resolved when it built this structure, else a
   * synchronous read of the cache. `null` when neither has it, the cache is asynchronous, or no client exists.
   *
   * @param name The name of the relation.
   * @param read Reads the related structure from the client's cache, synchronously.
   */
  protected lazyRelation<Result>(
    name: string,
    read: (client: GatewayClient) => Result | null | undefined,
  ): Result | null {
    const resolved = (this[kRelations] as Record<string, unknown>)[name] as
      | Result
      | null
      | undefined;
    if (resolved !== null && resolved !== undefined) return resolved;

    const client = this[kClient] ?? existingGatewayClient();
    return client ? (read(client) ?? null) : null;
  }

  /**
   * Patches the raw data of this structure in place, with a shallow merge.
   *
   * @param data The updated data.
   * @returns This structure.
   */
  public [kPatch](data: Readonly<Partial<Data>>): this {
    (this as { [kPatchRelations]?: (data: object) => void })[kPatchRelations]?.(data);
    (BaseStructure.prototype as unknown as Record<typeof kPatch, Patch<Data>>)[kPatch].call(
      this,
      data,
    );
    return this;
  }

  /**
   * Creates a copy of this structure, optionally patching the copy.
   *
   * @param patch The data to patch the copy with.
   * @returns The copy.
   */
  public [kClone](patch?: Readonly<Partial<Data>>): this {
    const clone = (BaseStructure.prototype as unknown as Record<typeof kClone, Patch<Data>>)[
      kClone
    ].call(this, patch ?? ({} as Readonly<Partial<Data>>)) as this;
    clone[kRelations] = { ...this[kRelations] };
    if (this[kClient]) clone[kClient] = this[kClient];
    return clone;
  }

  /** Parses a timestamp once when constructing or patching a structure. */
  protected optimizeTimestamp(key: string, value: string | null | undefined): void {
    if (value !== undefined) {
      (this[kTimestamps] ??= new Map()).set(key, value ? Date.parse(value) : null);
    }
  }

  /** Gets a timestamp previously parsed by `optimizeData`. */
  protected optimizedTimestamp(key: string): number | null {
    return this[kTimestamps]?.get(key) ?? null;
  }

  /**
   * Forgets resolved relations, e.g. when a patch carries fresher data for them.
   *
   * @param names The names of the relations.
   */
  protected dropRelations(...names: (keyof this[typeof kRelations] & string)[]): void {
    const relations: Record<string, unknown> = { ...(this[kRelations] as object) };
    for (const name of names) delete relations[name];
    this[kRelations] = relations as Relations;
  }

  /**
   * Forgets the relations whose ID a patch changes, e.g. a channel's parent when the patch moves it to another
   * category. A patch carrying the same ID keeps the relation.
   *
   * @param data The patch.
   * @param fields The names of the relations, mapped to the raw field holding their ID.
   */
  protected dropChangedRelations(
    data: object,
    fields: Partial<Record<keyof Relations & string, string>>,
  ): void {
    const current = this[kData] as Record<string, unknown>;
    const patch = data as Record<string, unknown>;
    const names = Object.entries(fields as Record<string, string>)
      .filter(([, key]) => key in patch && patch[key] !== current[key])
      .map(([name]) => name);
    if (names.length > 0) this.dropRelations(...(names as never[]));
  }
}

/**
 * Sets up the members {@link StructureMixin} adds, from the constructor of a structure extending one of
 * `@discordjs/structures`'.
 *
 * @param structure The structure being constructed.
 * @param data The raw API data it was constructed with.
 * @param relations The related structures, resolved from the cache by the structure's manager.
 */
export function initStructure(structure: object, data: object, relations: object): void {
  (structure as StructureMixin<object>)[kRelations] = relations;
  // `@discordjs/structures` only runs `optimizeData` from the constructors of the classes implementing it, which the
  // mixins' optimizations are not part of. Running it again is harmless: it only (re)parses fields.
  (structure as unknown as { optimizeData(data: object): void }).optimizeData(data);
}

export interface Structure<
  Data extends object,
  Omitted extends keyof Data | "" = "",
> extends StructureMixin<Data> {}

/**
 * The base class of the structures `@discordjs/structures` has no counterpart for: its `Structure`, with
 * {@link StructureMixin} mixed in.
 *
 * @remarks
 * Structures can be built from any raw payload, be it a gateway dispatch, a cache hit, or a REST response. Their
 * {@link StructureMixin.client | client} is the one whose manager built them, the most recently constructed one
 * otherwise.
 *
 * @typeParam Data The raw API data this structure wraps.
 * @typeParam Omitted The keys the structure's `DataTemplate` strips from the stored data.
 */
export abstract class Structure<
  Data extends object,
  Omitted extends keyof Data | "" = "",
> extends BaseStructure<Data, Omitted> {
  /**
   * @param data The raw API data.
   * @param relations The related structures, resolved from the cache by the structure's manager.
   */
  public constructor(data: Readonly<Partial<Data>>, relations: object = {}) {
    super(data as never);
    initStructure(this, data, relations);
  }
}

Mixin(Structure, [StructureMixin]);

/**
 * Binds a structure to the client that built it, see {@link StructureMixin.client}.
 *
 * @param structure The structure.
 * @param client The client.
 * @returns The structure.
 * @internal
 */
export function bindClient<Value extends object>(structure: Value, client: GatewayClient): Value {
  (structure as StructureMixin<object>)[kClient] = client;
  return structure;
}

/**
 * Gets the timestamp, in milliseconds, a snowflake was created at.
 *
 * @param id The snowflake.
 */
export function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + DiscordEpoch);
}

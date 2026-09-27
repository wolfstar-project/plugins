import { Structure as BaseStructure } from "@discordjs/structures";
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
   * Patches the raw data of this structure in place, with a shallow merge.
   *
   * @param data The updated data.
   * @returns This structure.
   */
  public [kPatch](data: Readonly<Partial<Data>>): this {
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
 * Structures never hold a reference to a client, so they can be built from any raw payload, be it a gateway dispatch,
 * a cache hit, or a REST response.
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
 * Gets the timestamp, in milliseconds, a snowflake was created at.
 *
 * @param id The snowflake.
 */
export function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + DiscordEpoch);
}

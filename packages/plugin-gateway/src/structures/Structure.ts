import { Structure as BaseStructure } from "@discordjs/structures";

// `@discordjs/structures` keys a structure's data and its patch/clone methods with symbols it does not export. They
// are created with `Symbol.for`, in the global registry, so the same key yields the very same symbols here. Each is
// typed as a `unique symbol` of our own, which lets the subclasses below declare typed members keyed by them.

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

/**
 * The base class every structure extends: `@discordjs/structures`' `Structure`, with its data and patch/clone methods
 * made reachable from subclasses outside of discord.js.
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
   * The raw API data of this structure.
   */
  declare protected [kData]: Readonly<Data>;

  /**
   * The relations of this structure, resolved from the cache by its manager. Subclasses narrow its type. Public only
   * so that {@link Structure.dropRelations} can check relation names against it.
   *
   * @internal
   */
  declare public [kRelations]: object;

  /**
   * @param data The raw API data.
   * @param relations The related structures, resolved from the cache by the structure's manager.
   */
  public constructor(data: Readonly<Partial<Data>>, relations: object = {}) {
    super(data as never);
    this[kRelations] = relations;
  }

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

  /**
   * Forgets resolved relations, e.g. when a patch carries fresher data for them.
   *
   * @param names The names of the relations.
   */
  protected dropRelations(...names: (keyof this[typeof kRelations] & string)[]): void {
    const relations: Record<string, unknown> = { ...this[kRelations] };
    for (const name of names) delete relations[name];
    this[kRelations] = relations;
  }
}

/**
 * Gets the timestamp, in milliseconds, a snowflake was created at.
 *
 * @param id The snowflake.
 */
export function snowflakeTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + DiscordEpoch);
}

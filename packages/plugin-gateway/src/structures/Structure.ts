/*!
 * The base of `Structure` (its data template, constructor, `kPatch`, `kClone`, `optimizeData`, and `toJSON`) is adapted
 * from `@discordjs/structures`' `Structure` (https://github.com/discordjs/discord.js/tree/main/packages/structures),
 * Copyright 2023 Noel Buechler and Chai Kohen, licensed under the Apache License, Version 2.0
 * (https://www.apache.org/licenses/LICENSE-2.0). Changed from the original: merged into this package's `Structure`,
 * which adds relations and parsed timestamps, with `kPatch` and `kClone` made public and the mixin constructor hook
 * dropped.
 */

// The data of a structure and its patch/clone methods are keyed with the symbols of `@discordjs/structures`, which it
// does not export. They are created with `Symbol.for`, in the global registry, under the same keys, so they are the very
// same symbols. Each is typed as a `unique symbol` of our own, which lets subclasses declare typed members keyed by them.

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
 * The symbol of the method `Mixin` combines the mixins' `enrichToJSON` hooks into, shared with `@discordjs/structures`.
 */
const kMixinToJSON = Symbol.for("djs.structures.mixin.toJSON");

/**
 * The Discord epoch, used to extract timestamps from snowflakes.
 */
const DiscordEpoch = 1_420_070_400_000n;

/**
 * The base class every structure extends, following `@discordjs/structures`' `Structure`, with its data and
 * patch/clone methods reachable from subclasses outside of discord.js.
 *
 * @remarks
 * Structures never hold a reference to a client, so they can be built from any raw payload, be it a gateway dispatch,
 * a cache hit, or a REST response.
 *
 * @typeParam Data The raw API data this structure wraps.
 * @typeParam _Omitted The keys the structure's `DataTemplate` strips from the stored data, for subclasses to type their
 * constructor with.
 */
export abstract class Structure<Data extends object, _Omitted extends keyof Data | "" = ""> {
  /**
   * The template used for removing data from the raw data stored for each structure.
   *
   * @remarks This template should be overridden in all subclasses to provide more accurate type information.
   * The template in the base {@link Structure} class will have no effect on most subclasses for this reason.
   */
  protected static readonly DataTemplate: Record<string, unknown> = {};

  readonly #timestamps = new Map<string, number | null>();

  /**
   * The raw API data of this structure.
   */
  protected [kData]: Readonly<Data>;

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
    this[kData] = Object.assign(this.getDataTemplate(), data);
    this[kRelations] = relations;
    this.optimizeData(data);
  }

  /**
   * @returns A cloned version of the data template, ready to create a new data object.
   */
  private getDataTemplate(): Data {
    return Object.create((this.constructor as typeof Structure).DataTemplate);
  }

  /**
   * Stores raw data in optimized formats, used in tandem with a data template. Called by the constructor and by
   * `kPatch`.
   *
   * @example `created_timestamp` is an ISO string, which can be stored in optimized form as a number.
   * @param _data The raw data received from the API to optimize.
   * @remarks Implemented in subclasses and mixins where needed; mixins must use the closest ancestor's access modifier.
   * When implementing it, call `super.optimizeData` if any class in the super chain aside from {@link Structure}
   * implements it. Mixins never need to, as `Mixin` walks the prototype chain.
   */
  protected optimizeData(_data: Partial<Data>): void {}

  /** Parses a timestamp once when constructing or patching a structure. */
  protected optimizeTimestamp(key: string, value: string | null | undefined): void {
    if (value !== undefined) this.#timestamps.set(key, value ? Date.parse(value) : null);
  }

  /** Gets a timestamp previously parsed by `optimizeData`. */
  protected optimizedTimestamp(key: string): number | null {
    return this.#timestamps.get(key) ?? null;
  }

  /**
   * Patches the raw data of this structure in place, with a shallow merge.
   *
   * @param data The updated data.
   * @returns This structure.
   */
  public [kPatch](data: Readonly<Partial<Data>>): this {
    this[kData] = Object.assign(this.getDataTemplate(), this[kData], data);
    this.optimizeData(data);
    return this;
  }

  /**
   * Creates a copy of this structure, optionally patching the copy.
   *
   * @param patch The data to patch the copy with.
   * @returns The copy.
   */
  public [kClone](patch?: Readonly<Partial<Data>>): this {
    const data = this.toJSON();
    const clone = new (this.constructor as new (data: Readonly<Partial<Data>>) => this)(
      patch ? Object.assign(data, patch) : data,
    );
    clone[kRelations] = { ...this[kRelations] };
    return clone;
  }

  /**
   * Transforms this structure to its JSON format, with raw API data (or close to it), automatically called by
   * `JSON.stringify()` when this structure is stringified.
   *
   * @remarks
   * The type of this data is determined by omissions at runtime and is only guaranteed for default omissions.
   */
  public toJSON(): Data {
    const data =
      // Spread is way faster than `structuredClone`, but is shallow, so it is only used without nested objects.
      (
        Object.values(this[kData]).some((value) => typeof value === "object" && value !== null)
          ? structuredClone(this[kData])
          : { ...this[kData] }
      ) as Data;
    (this as { [kMixinToJSON]?: (data: Data) => void })[kMixinToJSON]?.(data);
    return data;
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

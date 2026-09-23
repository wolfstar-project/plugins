/**
 * The symbol under which a {@link Structure} stores its raw API data.
 */
export const kData = Symbol("wolfstar.structures.data");

/**
 * The symbol of the method patching a {@link Structure}'s raw data in place.
 */
export const kPatch = Symbol("wolfstar.structures.patch");

/**
 * The symbol of the method cloning a {@link Structure}, optionally patching the clone.
 */
export const kClone = Symbol("wolfstar.structures.clone");

/**
 * The Discord epoch, used to extract timestamps from snowflakes.
 */
const DiscordEpoch = 1_420_070_400_000n;

/**
 * The base class every structure extends: a thin, typed wrapper around a raw API payload.
 *
 * @remarks
 * Modelled after `@discordjs/structures`' `Structure`, which is not used directly as it is only published as
 * pre-release snapshots and keeps its data symbols private, making it impossible to extend outside of discord.js.
 * Structures never hold a reference to a client, so they can be built from any raw payload, be it a gateway dispatch,
 * a cache hit, or a REST response.
 *
 * @typeParam Data The raw API data this structure wraps.
 */
export abstract class Structure<Data extends object> {
  /**
   * The raw API data of this structure.
   */
  protected [kData]: Readonly<Data>;

  public constructor(data: Readonly<Data>) {
    this[kData] = { ...data };
  }

  /**
   * Patches the raw data of this structure in place, with a shallow merge.
   *
   * @param data The updated data.
   * @returns This structure.
   */
  public [kPatch](data: Readonly<Partial<Data>>): this {
    this[kData] = { ...this[kData], ...data };
    return this;
  }

  /**
   * Creates a copy of this structure, optionally patching the copy.
   *
   * @param patch The data to patch the copy with.
   * @returns The copy.
   */
  public [kClone](patch?: Readonly<Partial<Data>>): this {
    const clone = Object.create(Object.getPrototypeOf(this) as object) as this;
    clone[kData] = { ...this[kData], ...patch };
    return clone;
  }

  /**
   * Gets a copy of the raw API data of this structure.
   */
  public toJSON(): Data {
    return { ...this[kData] };
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

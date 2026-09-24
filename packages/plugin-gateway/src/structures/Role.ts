import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { Partialize } from "@discordjs/structures";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * A Discord guild role.
 */
export class Role<Omitted extends keyof CacheEntityTypes["roles"] | "" = ""> extends Structure<
  CacheEntityTypes["roles"],
  Omitted
> {
  /**
   * The template used for removing data from the raw data stored for each role
   */
  public static override readonly DataTemplate: Partial<CacheEntityTypes["roles"]> = {};

  /**
   * @param data - The raw data received from the API for the role
   */
  public constructor(data: Partialize<CacheEntityTypes["roles"], Omitted>) {
    super(data);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get name() {
    return this[kData].name;
  }

  public get color() {
    return this[kData].color;
  }

  public get position() {
    return this[kData].position;
  }

  public get permissions(): bigint {
    return BigInt(this[kData].permissions);
  }

  public get hoist() {
    return this[kData].hoist;
  }

  public get managed() {
    return this[kData].managed;
  }

  public get mentionable() {
    return this[kData].mentionable;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public toString(): `<@&${string}>` {
    return `<@&${this.id}>`;
  }
}

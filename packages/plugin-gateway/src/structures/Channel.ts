import { ChannelType, type APIChannel, type Snowflake } from "discord-api-types/v10";
import type { Guild } from "./Guild.js";
import { kData, type kRelations, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * The raw data of a channel of type `Type`. Channels sent within a guild payload carry their `guild_id` too.
 */
export type ChannelDataType<Type extends ChannelType = ChannelType> = Extract<
  APIChannel,
  { type: Type }
> & { guild_id?: Snowflake };

/**
 * The relations of a channel, resolved from the cache by `client.channels` and `client.threads`.
 */
export interface ChannelRelations {
  guild?: Guild | null;
}

const ThreadTypes: readonly ChannelType[] = [
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
];

/**
 * The base of every channel structure, holding what all channel types share.
 *
 * @remarks
 * Concrete channels (`TextChannel`, `DMChannel`, ...) add their fields through mixins, following
 * `@discordjs/structures`' design. `ChannelManager` picks the right one for a raw channel.
 *
 * @typeParam Type The type of the channel.
 */
export class Channel<Type extends ChannelType = ChannelType> extends Structure<
  ChannelDataType<Type>
> {
  declare public [kRelations]: ChannelRelations;

  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(data: ChannelDataType<Type>, relations: ChannelRelations = {}) {
    super(data, relations);
  }

  public get id(): Snowflake {
    return this[kData].id;
  }

  public get type(): Type {
    return this[kData].type as Type;
  }

  public get flags(): number {
    return this[kData].flags ?? 0;
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Whether this channel is a thread.
   */
  public isThread(): boolean {
    return ThreadTypes.includes(this.type);
  }

  /**
   * Whether this channel is a direct message or a group direct message.
   */
  public isDMBased(): boolean {
    return this.type === ChannelType.DM || this.type === ChannelType.GroupDM;
  }

  public toString(): `<#${string}>` {
    return `<#${this.id}>`;
  }
}

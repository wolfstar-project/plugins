import { Channel as BaseChannelStructure } from "@discordjs/structures";
import { ChannelType, type APIChannel, type Snowflake } from "discord-api-types/v10";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { Guild } from "../guilds/Guild.js";
import type { StageInstance } from "../stageInstances/StageInstance.js";
import type { User } from "../users/User.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, kRelations, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";

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
  /**
   * The parent of a guild channel: its category, or the channel a thread belongs to.
   */
  parent?: AnyChannel | null;
  /**
   * The user a direct message is with.
   */
  recipient?: User | null;
  /**
   * The live stage of a stage channel.
   */
  stageInstance?: StageInstance | null;
  /**
   * Whether the bot is a member of a thread, as the thread member cache knows it.
   */
  joined?: boolean;
}

const ThreadTypes: readonly ChannelType[] = [
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
];

/** Whether a raw channel type belongs in the thread cache. */
export function isThreadChannelType(type: ChannelType): boolean {
  return ThreadTypes.includes(type);
}

export interface Channel<Type extends ChannelType = ChannelType>
  extends
    StructureMixin<ChannelDataType<Type>, ChannelRelations>,
    MixinTypes<BaseChannelStructure<Type>, [BaseChannelMixin<Type>]> {}

/**
 * A channel: `@discordjs/structures`' `Channel`, with what every channel type shares.
 *
 * @remarks
 * Concrete channels (`TextChannel`, `DMChannel`, ...) extend `@discordjs/structures`' own and add their fields through
 * mixins, following its design. `ChannelManager` picks the right one for a raw channel.
 *
 * @typeParam Type The type of the channel.
 */
export class Channel<Type extends ChannelType = ChannelType> extends BaseChannelStructure<Type> {
  /**
   * Whether a value is a channel of this package. The concrete channels extend `@discordjs/structures`' own rather than
   * this class, so `instanceof Channel` matches any `@discordjs/structures` channel carrying {@link StructureMixin}.
   * Subclasses keep the default `instanceof` behavior.
   *
   * @param value The value to check.
   */
  public static override [Symbol.hasInstance](value: unknown): boolean {
    if (this !== Channel) return Function.prototype[Symbol.hasInstance].call(this, value);
    return value instanceof BaseChannelStructure && kRelations in value;
  }

  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(data: ChannelDataType<Type>, relations: ChannelRelations = {}) {
    super(data as never);
    initStructure(this, data, relations);
  }
}

Mixin(Channel, [StructureMixin, BaseChannelMixin]);

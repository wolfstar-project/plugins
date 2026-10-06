import { Collection } from "@discordjs/collection";
import { ChannelType } from "discord-api-types/v10";
import { GatewayTypeError } from "../errors/GatewayError.js";
import type { CategoryChannel } from "../structures/channels/CategoryChannel.js";
import type { Guild } from "../structures/guilds/Guild.js";
import type { NonThreadGuildBasedChannel } from "../types.js";
import { cacheRead, whenAll, type CacheRead } from "../util/cache.js";
import { resolveId, type GuildChannelCreateOptions, type IdResolvable } from "../util/channels.js";
import { BaseManager } from "./BaseManager.js";
import type { AnyChannel } from "./ChannelManager.js";

/**
 * The options to create a channel inside a category with: the guild channel's, minus its category and with no
 * category type, as Discord does not nest categories.
 */
export interface CategoryCreateChannelOptions extends Omit<
  GuildChannelCreateOptions,
  "parent" | "type"
> {
  type?: Exclude<GuildChannelCreateOptions["type"], ChannelType.GuildCategory>;
}

/**
 * Manages the channels of one {@link CategoryChannel}, like discord.js's `CategoryChannelChildManager`.
 *
 * @remarks
 * It holds no cache of its own: {@link CategoryChannelChildManager.cache} is read from the channel cache each time, so
 * it always agrees with `client.channels`. With a remote cache the store must be able to enumerate its entries, or
 * reading it throws `CacheNotIterable`, like `listCached`.
 */
export class CategoryChannelChildManager extends BaseManager {
  /**
   * The category these channels belong to.
   */
  public readonly channel: CategoryChannel;

  /**
   * @param channel The category.
   */
  public constructor(channel: CategoryChannel) {
    super(channel.client);
    this.channel = channel;
  }

  /**
   * The category's guild, from the cache: `null` when it is not cached.
   */
  public get guild(): Guild | null {
    return this.channel.guild;
  }

  /**
   * The channels of the category held in the cache, by ID, threads excluded. Channels that are not cached are not
   * listed. A promise with an asynchronous cache, see {@link CacheRead}.
   */
  public get cache(): CacheRead<Collection<string, NonThreadGuildBasedChannel>> {
    const { guildId } = this.channel;
    if (!guildId) return cacheRead(new Collection());

    return cacheRead(
      whenAll(
        [this.client.channels._inCategory(guildId, this.channel.id)],
        ([channels]) =>
          new Collection(
            channels.map((channel) => [channel.id, channel as NonThreadGuildBasedChannel]),
          ),
      ),
    );
  }

  /**
   * Creates a channel in the category.
   *
   * @param options The channel's name, type, and settings.
   * @throws {GatewayTypeError} `CategoryChildCategory` when the type is a category.
   */
  public async create(options: CategoryCreateChannelOptions): Promise<AnyChannel> {
    if ((options.type as ChannelType | undefined) === ChannelType.GuildCategory) {
      throw new GatewayTypeError("CategoryChildCategory");
    }
    const { guildId } = this.channel;
    if (!guildId) throw new GatewayTypeError("GuildResolve");
    return this.client.guilds.channels(guildId).create({ ...options, parent: this.channel.id });
  }

  /**
   * Gets a cached channel of the category.
   *
   * @param child The channel, or its ID.
   * @returns The channel, `null` when it is not cached or belongs to another category.
   */
  public resolve(child: IdResolvable): CacheRead<NonThreadGuildBasedChannel | null> {
    return cacheRead(
      whenAll([this.client.channels.cache.get(this.resolveId(child))], ([channel]) =>
        channel && "parentId" in channel && channel.parentId === this.channel.id
          ? (channel as NonThreadGuildBasedChannel)
          : null,
      ),
    );
  }

  /**
   * Gets the ID of a channel, or of an ID.
   *
   * @param child The channel, or its ID.
   */
  public resolveId(child: IdResolvable): string {
    return resolveId(child);
  }

  /**
   * The category's cache, like discord.js.
   */
  public valueOf(): CacheRead<Collection<string, NonThreadGuildBasedChannel>> {
    return this.cache;
  }
}

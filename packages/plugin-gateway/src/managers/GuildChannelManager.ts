import {
  ChannelType,
  type APIChannel,
  type RESTPostAPIGuildChannelJSONBody,
} from "discord-api-types/v10";
import { GatewayError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import {
  resolveId,
  toChannelBody,
  type GuildChannelCreateOptions,
  type GuildChannelEditOptions,
  type IdResolvable,
} from "../util/channels.js";
import { computePositions, discordSort, getSortableGroupTypes } from "../util/Util.js";
import type { AnyChannel } from "./ChannelManager.js";
import { BaseManager } from "./BaseManager.js";

/**
 * The options to move a channel or role among its siblings with.
 */
export interface SetPositionOptions {
  /**
   * Whether the position is an offset from the current one.
   */
  relative?: boolean;
  /**
   * The reason for the audit log.
   */
  reason?: string;
}

/**
 * A channel's new position, for {@link GuildChannelManager.setPositions}.
 */
export interface ChannelPosition {
  channel: IdResolvable;
  position?: number;
  /**
   * The new category, `null` to move the channel out of its category.
   */
  parent?: IdResolvable | null;
  /**
   * Whether to copy the new category's overwrites, when `parent` is set.
   */
  lockPermissions?: boolean;
}

/**
 * Manages the channels of one guild. Channels are cached by `client.channels`, which this manager writes to.
 */
export class GuildChannelManager extends BaseManager {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client);
    this.guildId = guildId;
  }

  /**
   * Fetches every channel of the guild, threads excluded, and caches them.
   */
  public async fetch(): Promise<AnyChannel[]> {
    const channels = (await this.client.api.guilds.getChannels(this.guildId)) as APIChannel[];
    return Promise.all(
      channels.map((channel) => this.client.channels._add({ ...channel, guild_id: this.guildId })),
    );
  }

  /**
   * Creates a channel in the guild.
   *
   * @param options The channel's name, type, and settings.
   */
  public async create(options: GuildChannelCreateOptions): Promise<AnyChannel> {
    const body = {
      ...toChannelBody(options),
      type: options.type,
    } as RESTPostAPIGuildChannelJSONBody;
    const channel = await this.client.api.guilds.createChannel(this.guildId, body, {
      reason: options.reason,
    });
    return this.client.channels._add(channel);
  }

  /**
   * Edits a channel of the guild.
   *
   * @param channel The channel, or its ID.
   * @param options The fields to edit, and the reason for the audit log.
   */
  public edit(channel: IdResolvable, options: GuildChannelEditOptions): Promise<AnyChannel> {
    return this.client.channels.edit(resolveId(channel), options);
  }

  /**
   * Deletes a channel of the guild.
   *
   * @param channel The channel, or its ID.
   * @param reason The reason for the audit log.
   */
  public delete(channel: IdResolvable, reason?: string): Promise<void> {
    return this.client.channels.delete(resolveId(channel), reason);
  }

  /**
   * Moves several channels at once.
   *
   * @param positions The channels and their new positions or categories.
   * @param reason The reason for the audit log.
   */
  public async setPositions(positions: readonly ChannelPosition[], reason?: string): Promise<void> {
    const body = positions.map((position) => ({
      id: resolveId(position.channel),
      position: position.position,
      parent_id:
        position.parent === undefined
          ? undefined
          : position.parent === null
            ? null
            : resolveId(position.parent),
      lock_permissions: position.lockPermissions,
    }));
    await this.client.api.guilds.setChannelPositions(this.guildId, body, { reason });

    // The endpoint answers 204: refetch the moved channels rather than guessing the positions Discord shifted.
    await this.fetch();
  }

  /**
   * Moves a channel among the channels it is sorted with, like discord.js's `GuildChannelManager#setPosition`: the
   * channels of its category (the categories, for a category) and of its group, text-like or voice.
   *
   * @param channel The channel, or its ID.
   * @param position The index to move it to, in {@link GuildChannelManager.fetchSorted} order, or the offset to move it
   * by with `relative`. An index out of range leaves the channels where they are.
   * @param options Whether the position is relative, and the reason for the audit log.
   * @returns The moved channel.
   */
  public async setPosition(
    channel: IdResolvable,
    position: number,
    options: SetPositionOptions = {},
  ): Promise<AnyChannel> {
    const id = resolveId(channel);
    const sorted = await this.fetchSorted(id);
    const positions = computePositions(id, position, options.relative ?? false, sorted);
    await this.setPositions(
      positions.map((entry) => ({ channel: entry.id, position: entry.position })),
      options.reason,
    );
    return (await this.client.channels.cache.get(id))!;
  }

  /**
   * Fetches the channels a channel is sorted with, itself included, and caches them.
   *
   * @param channel The channel, or its ID.
   * @returns The channels, in the order Discord displays them.
   */
  public async fetchSorted(channel: IdResolvable): Promise<AnyChannel[]> {
    const id = resolveId(channel);
    const channels = new Map((await this.fetch()).map((entry) => [entry.id, entry]));
    const raw = [...channels.values()].map((entry) => {
      const data = entry.toJSON() as {
        type: ChannelType;
        position?: number;
        parent_id?: string | null;
      };
      return {
        id: entry.id,
        type: data.type,
        position: data.position ?? 0,
        parent_id: data.parent_id,
      };
    });
    const target = raw.find((entry) => entry.id === id);
    if (!target) throw new GatewayError("GuildChannelUnknown", this.guildId, id);

    const isCategory = target.type === ChannelType.GuildCategory;
    const types = getSortableGroupTypes(target.type);
    const siblings = raw.filter(
      (entry) =>
        types.includes(entry.type) &&
        (isCategory || (entry.parent_id ?? null) === (target.parent_id ?? null)),
    );
    return discordSort(siblings).map((entry) => channels.get(entry.id)!);
  }
}

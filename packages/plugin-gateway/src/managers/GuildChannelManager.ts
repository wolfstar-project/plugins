import type { APIChannel, RESTPostAPIGuildChannelJSONBody } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import {
  resolveId,
  toChannelBody,
  type GuildChannelCreateOptions,
  type GuildChannelEditOptions,
  type IdResolvable,
} from "../util/channels.js";
import type { AnyChannel } from "./ChannelManager.js";

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
export class GuildChannelManager {
  public readonly client: GatewayClient;
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    this.client = client;
    this.guildId = guildId;
  }

  /**
   * Fetches every channel of the guild, threads excluded, and caches them.
   */
  public async fetch(): Promise<AnyChannel[]> {
    const channels = (await this.client.core.api.guilds.getChannels(this.guildId)) as APIChannel[];
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
    const channel = await this.client.core.api.guilds.createChannel(this.guildId, body, {
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
    await this.client.core.api.guilds.setChannelPositions(this.guildId, body, { reason });

    // The endpoint answers 204: refetch the moved channels rather than guessing the positions Discord shifted.
    await this.fetch();
  }
}

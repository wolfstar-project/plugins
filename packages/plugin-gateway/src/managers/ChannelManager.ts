import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { applyGatewayDispatch } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIOverwrite,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { AnnouncementChannel } from "../structures/AnnouncementChannel.js";
import { AnnouncementThreadChannel } from "../structures/AnnouncementThreadChannel.js";
import { BaseChannel } from "../structures/BaseChannel.js";
import { isThreadChannelType, type ChannelRelations } from "../structures/Channel.js";
import { CategoryChannel } from "../structures/CategoryChannel.js";
import { DMChannel } from "../structures/DMChannel.js";
import { ForumChannel } from "../structures/ForumChannel.js";
import { GroupDMChannel } from "../structures/GroupDMChannel.js";
import { MediaChannel } from "../structures/MediaChannel.js";
import { PrivateThreadChannel } from "../structures/PrivateThreadChannel.js";
import { PublicThreadChannel } from "../structures/PublicThreadChannel.js";
import { StageChannel } from "../structures/StageChannel.js";
import { TextChannel } from "../structures/TextChannel.js";
import { VoiceChannel } from "../structures/VoiceChannel.js";
import { resolveId, toChannelBody, type GuildChannelEditOptions } from "../util/channels.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";
import { PermissionOverwriteManager } from "./PermissionOverwriteManager.js";

/**
 * Any of the channel structures {@link ChannelManager} builds.
 */
export type AnyChannel =
  | AnnouncementChannel
  | AnnouncementThreadChannel
  | BaseChannel
  | CategoryChannel
  | DMChannel
  | ForumChannel
  | GroupDMChannel
  | MediaChannel
  | PrivateThreadChannel
  | PublicThreadChannel
  | StageChannel
  | TextChannel
  | VoiceChannel;

/**
 * Builds the channel structure matching the type of a raw channel, {@link BaseChannel} for unknown types.
 *
 * @param data The raw channel.
 */
export function createChannel(
  data: CacheEntityTypes["channels"],
  relations: ChannelRelations = {},
): AnyChannel {
  switch (data.type) {
    case ChannelType.AnnouncementThread:
      return new AnnouncementThreadChannel(data, relations);
    case ChannelType.DM:
      return new DMChannel(data, relations);
    case ChannelType.GroupDM:
      return new GroupDMChannel(data, relations);
    case ChannelType.GuildAnnouncement:
      return new AnnouncementChannel(data, relations);
    case ChannelType.GuildCategory:
      return new CategoryChannel(data, relations);
    case ChannelType.GuildForum:
      return new ForumChannel(data, relations);
    case ChannelType.GuildMedia:
      return new MediaChannel(data, relations);
    case ChannelType.GuildStageVoice:
      return new StageChannel(data, relations);
    case ChannelType.GuildText:
      return new TextChannel(data, relations);
    case ChannelType.GuildVoice:
      return new VoiceChannel(data, relations);
    case ChannelType.PrivateThread:
      return new PrivateThreadChannel(data, relations);
    case ChannelType.PublicThread:
      return new PublicThreadChannel(data, relations);
    default:
      return new BaseChannel(data, relations);
  }
}

// The raw fields of a guild channel the managers read, whichever its type.
function overwriteHolder(channel: AnyChannel): {
  guild_id?: string;
  parent_id?: string | null;
  permission_overwrites?: APIOverwrite[];
} {
  return channel.toJSON() as never;
}

// Guild channels carry their guild's ID, except inside a `GUILD_CREATE`, where the cache adds it.
function channelGuildId(data: CacheEntityTypes["channels"]): string | undefined {
  return "guild_id" in data ? (data.guild_id ?? undefined) : undefined;
}

/**
 * Manages the channels known to the client, threads included.
 *
 * @remarks
 * Threads live in their own entity cache, managed by `client.threads`, which {@link ChannelManager.get} falls back
 * to, so a thread ID resolves like any other channel ID.
 */
export class ChannelManager extends CachedManager<"channels", AnyChannel, [channelId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "channels");
  }

  public createStructure(data: CacheEntityTypes["channels"]): AnyChannel {
    return createChannel(data);
  }

  public keyOf(data: CacheEntityTypes["channels"]): string {
    return data.id;
  }

  public override async hydrate(data: CacheEntityTypes["channels"]): Promise<AnyChannel> {
    return createChannel(data, { guild: await this.cachedGuild(channelGuildId(data)) });
  }

  public resolveKey(channelId: string): string {
    return channelId;
  }

  /**
   * Adds a channel to the cache, handing threads to `client.threads`, whose cache holds them.
   *
   * @internal
   */
  public override _add(
    data: CacheEntityTypes["channels"],
    cache = true,
    options?: AddOptions,
  ): Promise<AnyChannel> {
    return isThreadChannelType(data.type)
      ? this.client.threads._add(data as CacheEntityTypes["threads"], cache, options)
      : super._add(data, cache, options);
  }

  /**
   * Gets a channel from the cache, looking it up in the thread cache as well.
   *
   * @param channelId The ID of the channel.
   */
  public override async get(channelId: string): Promise<AnyChannel | undefined> {
    const channel = await super.get(channelId);
    if (channel) return channel;

    return this.client.threads.get(channelId);
  }

  /**
   * Writes a channel to the cache, threads to the thread cache.
   *
   * @param channelId The ID of the channel.
   * @param raw The raw channel.
   */
  protected override async storeRaw(
    channelId: string,
    raw: CacheEntityTypes["channels"],
  ): Promise<void> {
    if (isThreadChannelType(raw.type)) {
      await this.client.cache?.threads.set(channelId, raw as CacheEntityTypes["threads"]);
    } else {
      await this.cache?.set(channelId, raw);
    }
  }

  /**
   * Edits a channel.
   *
   * @param channelId The ID of the channel.
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(channelId: string, options: GuildChannelEditOptions): Promise<AnyChannel> {
    if (options.lockPermissions && options.permissionOverwrites) {
      throw new TypeError("Pass either lockPermissions or permissionOverwrites, not both");
    }

    const body = toChannelBody(options);
    if (options.lockPermissions) {
      const parentId =
        options.parent === undefined
          ? (overwriteHolder(await this.fetch(channelId)).parent_id ?? null)
          : options.parent && resolveId(options.parent);
      if (parentId) {
        body.permission_overwrites = overwriteHolder(
          await this.fetch(parentId),
        ).permission_overwrites;
      }
    }

    const channel = await this.client.core.api.channels.edit(channelId, body, {
      reason: options.reason,
    });
    return this._add(channel);
  }

  /**
   * Deletes a channel, or closes a direct message, and drops it from the cache with its messages.
   *
   * @param channelId The ID of the channel.
   * @param reason The reason for the audit log.
   */
  public async delete(channelId: string, reason?: string): Promise<void> {
    const channel = await this.client.core.api.channels.delete(channelId, {
      reason,
    });
    if (!this.client.cache) return;

    // The same cascade as the `CHANNEL_DELETE` (or `THREAD_DELETE`) that follows.
    await applyGatewayDispatch(this.client.cache, {
      op: GatewayOpcodes.Dispatch,
      s: 0,
      t: isThreadChannelType(channel.type)
        ? GatewayDispatchEvents.ThreadDelete
        : GatewayDispatchEvents.ChannelDelete,
      d: channel,
    } as GatewayDispatchPayload);
  }

  /**
   * Gets the permission overwrites of a channel, cache first.
   *
   * @param channelId The ID of the channel.
   */
  public async permissionOverwrites(channelId: string): Promise<PermissionOverwriteManager> {
    const data = overwriteHolder(await this.fetch(channelId));
    return new PermissionOverwriteManager(
      this.client,
      channelId,
      data.guild_id ?? null,
      data.permission_overwrites ?? [],
    );
  }

  protected async fetchRaw(channelId: string) {
    return this.client.core.api.channels.get(channelId);
  }
}

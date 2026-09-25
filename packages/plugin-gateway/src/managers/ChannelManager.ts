import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { ChannelType, Routes, type APIChannel } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { AnnouncementChannel } from "../structures/AnnouncementChannel.js";
import { AnnouncementThreadChannel } from "../structures/AnnouncementThreadChannel.js";
import { BaseChannel } from "../structures/BaseChannel.js";
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
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

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
export function createChannel(data: CacheEntityTypes["channels"]): AnyChannel {
  switch (data.type) {
    case ChannelType.AnnouncementThread:
      return new AnnouncementThreadChannel(data);
    case ChannelType.DM:
      return new DMChannel(data);
    case ChannelType.GroupDM:
      return new GroupDMChannel(data);
    case ChannelType.GuildAnnouncement:
      return new AnnouncementChannel(data);
    case ChannelType.GuildCategory:
      return new CategoryChannel(data);
    case ChannelType.GuildForum:
      return new ForumChannel(data);
    case ChannelType.GuildMedia:
      return new MediaChannel(data);
    case ChannelType.GuildStageVoice:
      return new StageChannel(data);
    case ChannelType.GuildText:
      return new TextChannel(data);
    case ChannelType.GuildVoice:
      return new VoiceChannel(data);
    case ChannelType.PrivateThread:
      return new PrivateThreadChannel(data);
    case ChannelType.PublicThread:
      return new PublicThreadChannel(data);
    default:
      return new BaseChannel(data);
  }
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

  public resolveKey(channelId: string): string {
    return channelId;
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
    if (createChannel(raw).isThread()) {
      await this.client.cache?.threads.set(channelId, raw as CacheEntityTypes["threads"]);
    } else {
      await this.cache?.set(channelId, raw);
    }
  }

  protected async fetchRaw(channelId: string) {
    return (await container.rest.get(Routes.channel(channelId))) as APIChannel;
  }
}

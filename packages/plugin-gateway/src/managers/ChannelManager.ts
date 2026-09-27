import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import { applyGatewayDispatch, stageInstanceKey, threadMemberKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIOverwrite,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { AnnouncementChannel } from "../structures/channels/AnnouncementChannel.js";
import { AnnouncementThreadChannel } from "../structures/channels/AnnouncementThreadChannel.js";
import { BaseChannel } from "../structures/channels/BaseChannel.js";
import { isThreadChannelType, type ChannelRelations } from "../structures/channels/Channel.js";
import { CategoryChannel } from "../structures/channels/CategoryChannel.js";
import { DMChannel } from "../structures/channels/DMChannel.js";
import { ForumChannel } from "../structures/channels/ForumChannel.js";
import { GroupDMChannel } from "../structures/channels/GroupDMChannel.js";
import { MediaChannel } from "../structures/channels/MediaChannel.js";
import { PrivateThreadChannel } from "../structures/channels/PrivateThreadChannel.js";
import { PublicThreadChannel } from "../structures/channels/PublicThreadChannel.js";
import { StageChannel } from "../structures/channels/StageChannel.js";
import { TextChannel } from "../structures/channels/TextChannel.js";
import { VoiceChannel } from "../structures/channels/VoiceChannel.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { StageInstance } from "../structures/stageInstances/StageInstance.js";
import { bindClient } from "../structures/Structure.js";
import { whenAll } from "../util/cache.js";
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

// A thread, its channel, and the channel's category: no parent chain is any longer.
const MaxParentDepth = 2;

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

  public override _hydrate(data: CacheEntityTypes["channels"]): Awaitable<AnyChannel> {
    return whenAll([this.cachedGuild(channelGuildId(data))], ([guild]) =>
      this._hydrateInGuild(data, guild),
    );
  }

  /**
   * Builds a channel (or a thread) whose guild is already resolved, resolving its other relations from the cache: its
   * parent, within the same guild, the recipient of a direct message, the live stage of a stage channel, and whether
   * the bot joined a thread. Used by
   * `client.threads` and by the guild's own channel relations, which must not resolve the guild again.
   *
   * @param data The raw channel.
   * @param guild The guild of the channel, `null` outside of guilds or when it is not cached.
   * @param depth How many parents deep the channel is, which bounds the parent chain (a thread, its channel, and its
   * category) against a corrupted cache.
   * @internal
   */
  public _hydrateInGuild(
    data: CacheEntityTypes["channels"],
    guild: Guild | null,
    depth = 0,
  ): Awaitable<AnyChannel> {
    const { client } = this;
    const parentId = "parent_id" in data ? data.parent_id : null;
    const recipient = data.type === ChannelType.DM ? data.recipients?.[0] : undefined;
    const guildId = channelGuildId(data) ?? guild?.id;
    const thread = isThreadChannelType(data.type);
    return whenAll(
      [
        parentId && depth < MaxParentDepth ? this.cache?.get(parentId) : undefined,
        recipient ? client.users._resolveData(recipient) : undefined,
        data.type === ChannelType.GuildStageVoice && guildId
          ? client.cache?.stageInstances.get(stageInstanceKey(guildId, data.id))
          : undefined,
        thread
          ? client.cache?.threadMembers.get(threadMemberKey(data.id, client.user?.id ?? client.id))
          : undefined,
      ],
      ([parentData, resolvedRecipient, stageData, me]) =>
        whenAll(
          [parentData ? this._hydrateInGuild(parentData, guild, depth + 1) : null],
          ([parent]) => {
            const relations: ChannelRelations = { guild, parent };
            if (recipient) relations.recipient = resolvedRecipient ?? null;
            if (thread && client.cache) relations.joined = me !== undefined;
            const channel = bindClient(createChannel(data, relations), client);
            if (data.type === ChannelType.GuildStageVoice) {
              // Built here rather than by the stage instance manager, whose relations lead back to this channel.
              relations.stageInstance = stageData
                ? bindClient(new StageInstance(stageData, { guild, channel }), client)
                : null;
            }

            return channel;
          },
        ),
    );
  }

  /**
   * Gets a channel of a guild whose structure is already built, for the guild's own channel relations.
   *
   * @param channelId The ID of the channel.
   * @param guild The guild.
   * @internal
   */
  public _getInGuild(channelId: string, guild: Guild): Awaitable<AnyChannel | null> {
    return whenAll([this.cache?.get(channelId)], ([data]) =>
      data ? this._hydrateInGuild(data, guild) : null,
    );
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
   * Gets a channel from the cache, looking it up in the thread cache as well, which `get` and `cached` rely on.
   *
   * @param channelId The ID of the channel.
   * @internal
   */
  public override _get(channelId: string): Awaitable<AnyChannel | undefined> {
    return whenAll(
      [super._get(channelId)],
      ([channel]) => channel ?? this.client.threads._get(channelId),
    );
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

    const channel = await this.client.api.channels.edit(channelId, body, {
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
    const channel = await this.client.api.channels.delete(channelId, {
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
    return this.client.api.channels.get(channelId);
  }
}

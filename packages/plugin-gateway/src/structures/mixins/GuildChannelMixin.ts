import type {
  APIGuildForumDefaultReactionEmoji,
  APIGuildForumTag,
  APIOverwrite,
  ChannelType,
  ForumLayoutType,
  SortOrderType,
  ThreadAutoArchiveDuration,
  VideoQualityMode,
} from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { getGatewayClient } from "../../util/container.js";
import type { Guild } from "../Guild.js";
import { kData, kRelations } from "../Structure.js";
import type { GuildChannelCreateOptions, GuildChannelEditOptions } from "../../util/channels.js";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import { editChannel } from "./edit.js";

type Data = { guild_id?: string; name?: string | null };

// Every field `clone` copies, whichever the channel type.
type CloneableData = Data & {
  topic?: string | null;
  nsfw?: boolean;
  bitrate?: number;
  user_limit?: number;
  rate_limit_per_user?: number;
  parent_id?: string | null;
  position?: number;
  rtc_region?: string | null;
  video_quality_mode?: VideoQualityMode;
  default_auto_archive_duration?: ThreadAutoArchiveDuration;
  available_tags?: APIGuildForumTag[];
  default_reaction_emoji?: APIGuildForumDefaultReactionEmoji | null;
  default_thread_rate_limit_per_user?: number;
  default_sort_order?: SortOrderType | null;
  default_forum_layout?: ForumLayoutType;
  permission_overwrites?: APIOverwrite[];
};

export interface GuildChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields every guild channel has, threads included.
 */
export class GuildChannelMixin<Type extends ChannelType = ChannelType> {
  /**
   * The ID of the guild, when the payload included it.
   */
  public get guildId(): string | null {
    return (this[kData] as Data).guild_id ?? null;
  }

  /**
   * The guild, from the cache. `null` when the guild is not cached, or when the channel was not built by a manager: use
   * `fetchGuild()` to always get it.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Fetches the guild, cache first. `null` when the payload did not include the guild's ID.
   */
  public async fetchGuild(): Promise<Guild | null> {
    const { guildId } = this;
    return guildId ? getGatewayClient().guilds.fetch(guildId) : null;
  }

  public get name(): string {
    return (this[kData] as Data).name ?? "";
  }

  /**
   * Edits the channel.
   *
   * @param options The fields to edit, and the reason for the audit log.
   */
  public edit(options: GuildChannelEditOptions): Promise<this> {
    return editChannel(this, options);
  }

  public setName(name: string, reason?: string): Promise<this> {
    return editChannel(this, { name, reason });
  }

  /**
   * Creates a copy of the channel in its guild: same type, name, settings, and overwrites.
   *
   * @param options The fields to change on the copy.
   */
  public async clone(options: Partial<GuildChannelCreateOptions> = {}): Promise<AnyChannel> {
    const { guildId } = this;
    if (!guildId) throw new Error(`Channel ${this.id} has no known guild`);

    const data = this[kData] as CloneableData;
    return getGatewayClient()
      .guilds.channels(guildId)
      .create({
        name: data.name ?? "",
        type: this.type,
        topic: data.topic,
        nsfw: data.nsfw,
        bitrate: data.bitrate,
        userLimit: data.user_limit,
        rateLimitPerUser: data.rate_limit_per_user,
        parent: data.parent_id,
        position: data.position,
        rtcRegion: data.rtc_region,
        videoQualityMode: data.video_quality_mode,
        defaultAutoArchiveDuration: data.default_auto_archive_duration,
        availableTags: data.available_tags,
        defaultReactionEmoji: data.default_reaction_emoji,
        defaultThreadRateLimitPerUser: data.default_thread_rate_limit_per_user,
        defaultSortOrder: data.default_sort_order,
        defaultForumLayout: data.default_forum_layout,
        permissionOverwrites: data.permission_overwrites?.map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: BigInt(overwrite.allow),
          deny: BigInt(overwrite.deny),
        })),
        ...options,
      });
  }
}

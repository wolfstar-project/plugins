import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { RawFile } from "@discordjs/rest";
import {
  Routes,
  type APIMessage,
  type APIThreadChannel,
  type APIThreadMember,
  type ChannelType,
  type RESTGetAPIChannelThreadsArchivedPublicResult,
  type RESTGetAPIGuildThreadsResult,
  type RESTPostAPIChannelThreadsJSONBody,
  type RESTPostAPIGuildForumThreadsJSONBody,
  type ThreadAutoArchiveDuration,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnnouncementThreadChannel } from "../structures/AnnouncementThreadChannel.js";
import type { PrivateThreadChannel } from "../structures/PrivateThreadChannel.js";
import type { PublicThreadChannel } from "../structures/PublicThreadChannel.js";
import type { ThreadMember } from "../structures/ThreadMember.js";
import { container } from "../util/container.js";
import {
  resolveMessageOptions,
  type MessageCreateOptions,
  type MessagePayloadResolvable,
} from "../util/messages.js";
import { CachedManager } from "./CachedManager.js";
import { createChannel } from "./ChannelManager.js";

/**
 * Any of the thread structures {@link ThreadManager} builds.
 */
export type AnyThreadChannel =
  | AnnouncementThreadChannel
  | PrivateThreadChannel
  | PublicThreadChannel;

/**
 * The options to create a thread with.
 */
export interface ThreadCreateOptions {
  name: string;
  autoArchiveDuration?: ThreadAutoArchiveDuration;
  rateLimitPerUser?: number;
  /**
   * The type of a thread without a message: public (the default) or private.
   */
  type?: ChannelType.PublicThread | ChannelType.PrivateThread;
  /**
   * Whether non-moderators can add members to a private thread.
   */
  invitable?: boolean;
  /**
   * The first message of a forum or media post.
   */
  message?: MessagePayloadResolvable<MessageCreateOptions>;
  /**
   * The tags of a forum or media post.
   */
  appliedTags?: readonly string[];
  reason?: string;
}

/**
 * The options to fetch archived threads with.
 */
export interface FetchArchivedThreadsOptions {
  /**
   * Public (the default) or private archived threads.
   */
  type?: "public" | "private";
  /**
   * Whether to fetch the private archived threads the bot joined, which needs no `ManageThreads`.
   */
  joined?: boolean;
  /**
   * The archive time (or, with `joined`, the thread ID) to fetch threads before.
   */
  before?: Date | number | string;
  limit?: number;
}

/**
 * Threads fetched in bulk, with the bot's membership of each.
 */
export interface FetchedThreads {
  threads: AnyThreadChannel[];
  members: ThreadMember[];
  /**
   * Whether more archived threads are left to fetch.
   */
  hasMore: boolean;
}

/**
 * Manages the threads known to the client.
 */
export class ThreadManager extends CachedManager<"threads", AnyThreadChannel, [threadId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "threads");
  }

  public createStructure(data: CacheEntityTypes["threads"]): AnyThreadChannel {
    return createChannel(data) as AnyThreadChannel;
  }

  public keyOf(data: CacheEntityTypes["threads"]): string {
    return data.id;
  }

  public override async hydrate(data: CacheEntityTypes["threads"]): Promise<AnyThreadChannel> {
    return createChannel(data, {
      guild: await this.cachedGuild(data.guild_id),
    }) as AnyThreadChannel;
  }

  public resolveKey(threadId: string): string {
    return threadId;
  }

  /**
   * Creates a thread in a channel. With `message`, creates a post of a forum or media channel.
   *
   * @param channelId The ID of the parent channel.
   * @param options The thread's name and settings, and the first message of a post.
   */
  public async create(channelId: string, options: ThreadCreateOptions): Promise<AnyThreadChannel> {
    const common = {
      name: options.name,
      auto_archive_duration: options.autoArchiveDuration,
      rate_limit_per_user: options.rateLimitPerUser,
    };
    let body: RESTPostAPIChannelThreadsJSONBody | RESTPostAPIGuildForumThreadsJSONBody;
    let files: RawFile[] | undefined;
    if (options.message === undefined) {
      body = { ...common, type: options.type, invitable: options.invitable };
    } else {
      const message = resolveMessageOptions(options.message);
      body = { ...common, message: message.body, applied_tags: options.appliedTags?.slice() };
      files = message.files;
    }

    const thread = (await container.rest.post(Routes.threads(channelId), {
      body,
      files,
      reason: options.reason,
    })) as APIThreadChannel & { message?: APIMessage };
    // A forum post comes with its first message.
    if (thread.message) await this.client.messages._add(thread.message);
    return this._add(thread);
  }

  /**
   * Fetches the active threads of a guild, with the bot's membership of each, and caches them.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchActive(guildId: string): Promise<FetchedThreads> {
    const result = (await container.rest.get(
      Routes.guildActiveThreads(guildId),
    )) as RESTGetAPIGuildThreadsResult;
    return this.storeList(result.threads as APIThreadChannel[], result.members, guildId, false);
  }

  /**
   * Fetches the archived threads of a channel, most recently archived first, and caches them.
   *
   * @param channelId The ID of the parent channel.
   * @param options Public or private threads (only the joined ones with `joined`), and the page.
   */
  public async fetchArchived(
    channelId: string,
    options: FetchArchivedThreadsOptions = {},
  ): Promise<FetchedThreads> {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.before !== undefined) {
      // Joined private threads paginate by ID, the others by archive time.
      query.set(
        "before",
        options.joined ? String(options.before) : new Date(options.before).toISOString(),
      );
    }

    const route = options.joined
      ? Routes.channelJoinedArchivedThreads(channelId)
      : Routes.channelThreads(channelId, options.type ?? "public");
    const result = (await container.rest.get(route, {
      query,
    })) as RESTGetAPIChannelThreadsArchivedPublicResult;
    const guildId = (result.threads[0] as { guild_id?: string } | undefined)?.guild_id;
    return this.storeList(
      result.threads as APIThreadChannel[],
      result.members,
      guildId,
      result.has_more,
    );
  }

  private async storeList(
    threads: readonly APIThreadChannel[],
    members: readonly APIThreadMember[],
    guildId: string | undefined,
    hasMore: boolean,
  ): Promise<FetchedThreads> {
    return {
      threads: await Promise.all(threads.map((thread) => this._add(thread))),
      members: await Promise.all(
        members.map((member) =>
          this.client.threadMembers._add(guildId ? { ...member, guild_id: guildId } : member),
        ),
      ),
      hasMore,
    };
  }

  protected async fetchRaw(threadId: string) {
    return (await container.rest.get(Routes.channel(threadId))) as APIThreadChannel;
  }
}

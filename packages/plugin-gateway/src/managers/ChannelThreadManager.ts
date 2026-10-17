import { ChannelType } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type {
  AnyThreadChannel,
  FetchArchivedThreadsOptions,
  FetchedThreads,
  ThreadCreateOptions,
} from "./ThreadManager.js";
import { GatewayError, GatewayTypeError } from "../errors/GatewayError.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the threads of one channel: `client.threads`, with the channel's ID filled in.
 */
export class ChannelThreadManager extends BaseManager {
  public readonly channelId: string;
  public readonly guildId: string | null;

  /**
   * The type of the channel, when known: it tells a forum or media channel, whose threads are posts created with a
   * `message`, from a text or announcement channel.
   */
  public readonly channelType: ChannelType | null;

  public constructor(
    client: GatewayClient,
    channelId: string,
    guildId: string | null,
    channelType: ChannelType | null = null,
  ) {
    super(client);
    this.channelId = channelId;
    this.guildId = guildId;
    this.channelType = channelType;
  }

  /**
   * Creates a thread in the channel, or a post in a forum or media channel (with `message`). discord.js splits this in
   * `GuildTextThreadManager` and `GuildForumThreadManager`; here the manager is shared and the options are checked
   * against the type of the channel.
   *
   * @param options The thread's name and settings.
   * @throws {@link GatewayTypeError} `ThreadPostMessageRequired` in a forum or media channel without `message`,
   * `ThreadOptionsThreadOnly` there with `type` or `invitable`, and `ThreadOptionsPostOnly` with `message` or
   * `appliedTags` in any other channel.
   */
  public async create(options: ThreadCreateOptions): Promise<AnyThreadChannel> {
    const { channelType: type } = this;
    if (type === ChannelType.GuildForum || type === ChannelType.GuildMedia) {
      if (options.message === undefined) {
        throw new GatewayTypeError("ThreadPostMessageRequired");
      }
    } else if (type !== null && options.message !== undefined) {
      throw new GatewayTypeError("ThreadOptionsPostOnly", "message");
    }

    return this.client.threads.create(this.channelId, options);
  }

  /**
   * Fetches the active threads of the channel, and caches them.
   */
  public async fetchActive(): Promise<FetchedThreads> {
    if (!this.guildId) throw new GatewayError("ChannelGuildUnknown", this.channelId);

    // Discord only lists the active threads of a whole guild.
    const { threads, members } = await this.client.threads.fetchActive(this.guildId);
    const own = threads.filter((thread) => thread.parentId === this.channelId);
    const ids = new Set(own.map((thread) => thread.id));
    return {
      threads: own,
      members: members.filter((member) => member.threadId && ids.has(member.threadId)),
      hasMore: false,
    };
  }

  /**
   * Fetches the archived threads of the channel, and caches them.
   *
   * @param options Public or private threads, and the page.
   */
  public fetchArchived(options?: FetchArchivedThreadsOptions): Promise<FetchedThreads> {
    return this.client.threads.fetchArchived(this.channelId, options);
  }
}

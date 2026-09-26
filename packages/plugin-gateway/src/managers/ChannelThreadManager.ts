import type { GatewayClient } from "../GatewayClient.js";
import type {
  AnyThreadChannel,
  FetchArchivedThreadsOptions,
  FetchedThreads,
  ThreadCreateOptions,
} from "./ThreadManager.js";

/**
 * Manages the threads of one channel: `client.threads`, with the channel's ID filled in.
 */
export class ChannelThreadManager {
  public readonly client: GatewayClient;
  public readonly channelId: string;
  public readonly guildId: string | null;

  public constructor(client: GatewayClient, channelId: string, guildId: string | null) {
    this.client = client;
    this.channelId = channelId;
    this.guildId = guildId;
  }

  /**
   * Creates a thread in the channel, or a post in a forum or media channel (with `message`).
   *
   * @param options The thread's name and settings.
   */
  public create(options: ThreadCreateOptions): Promise<AnyThreadChannel> {
    return this.client.threads.create(this.channelId, options);
  }

  /**
   * Fetches the active threads of the channel, and caches them.
   */
  public async fetchActive(): Promise<FetchedThreads> {
    if (!this.guildId) throw new Error(`Channel ${this.channelId} has no known guild`);

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

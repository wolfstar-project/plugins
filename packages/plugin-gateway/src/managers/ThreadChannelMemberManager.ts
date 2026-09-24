import type { GatewayClient } from "../GatewayClient.js";
import type { ThreadMember } from "../structures/ThreadMember.js";
import type { FetchOptions } from "./CachedManager.js";
import type { ThreadMemberListOptions } from "./ThreadMemberManager.js";

/**
 * Manages the members of one thread: `client.threadMembers`, with the thread's ID filled in.
 */
export class ThreadChannelMemberManager {
  public readonly client: GatewayClient;
  public readonly threadId: string;

  public constructor(client: GatewayClient, threadId: string) {
    this.client = client;
    this.threadId = threadId;
  }

  /**
   * Gets a member of the thread from the cache.
   */
  public get(userId: string): Promise<ThreadMember | undefined> {
    return this.client.threadMembers.get(this.threadId, userId);
  }

  /**
   * Gets a member of the thread from the cache, falling back to the API.
   */
  public fetch(userId: string, options?: FetchOptions): Promise<ThreadMember> {
    return options
      ? this.client.threadMembers.fetch(this.threadId, userId, options)
      : this.client.threadMembers.fetch(this.threadId, userId);
  }

  /**
   * Lists the members of the thread.
   */
  public list(options?: ThreadMemberListOptions): Promise<ThreadMember[]> {
    return this.client.threadMembers.list(this.threadId, options);
  }

  /**
   * Adds a user to the thread, the bot by default.
   */
  public add(userId = "@me"): Promise<void> {
    return this.client.threadMembers.add(this.threadId, userId);
  }

  /**
   * Removes a user from the thread, the bot by default.
   */
  public remove(userId = "@me"): Promise<void> {
    return this.client.threadMembers.remove(this.threadId, userId);
  }
}

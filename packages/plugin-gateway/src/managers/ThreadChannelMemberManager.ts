import type { GatewayClient } from "../GatewayClient.js";
import type { ThreadMember } from "../structures/channels/ThreadMember.js";
import type { FetchOptions } from "./CachedManager.js";
import type { ThreadMemberListOptions } from "./ThreadMemberManager.js";
import { scopeCache, type ScopedCache } from "../util/cache.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the members of one thread: `client.threadMembers`, with the thread's ID filled in.
 */
export class ThreadChannelMemberManager extends BaseManager {
  public readonly threadId: string;

  /**
   * The cached members of the thread, by user ID.
   *
   * @example
   * ```typescript
   * const member = await thread.members.cache.get(userId);
   * ```
   */
  public readonly cache: ScopedCache<ThreadMember>;

  public constructor(client: GatewayClient, threadId: string) {
    super(client);
    this.threadId = threadId;
    this.cache = scopeCache(client.threadMembers.cache, (userId) =>
      client.threadMembers.resolveKey(threadId, userId),
    );
  }

  /**
   * Gets a member of the thread from the cache. Same as `cache.get`, always answering a promise.
   */
  public async get(userId: string): Promise<ThreadMember | undefined> {
    return this.cache.get(userId);
  }

  /**
   * Gets a member of the thread from the cache, falling back to the API.
   *
   * @param userId The ID of the user.
   * @param options The cache options, and whether to include the guild member (which always calls the API).
   */
  public fetch(
    userId: string,
    options: FetchOptions & { withMember?: boolean } = {},
  ): Promise<ThreadMember> {
    const { withMember, ...fetchOptions } = options;
    return withMember
      ? this.client.threadMembers.fetchWithMember(this.threadId, userId, { withMember })
      : this.client.threadMembers.fetch(this.threadId, userId, fetchOptions);
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

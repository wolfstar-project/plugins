import { threadMemberKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIThreadMember } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { ThreadMember } from "../structures/ThreadMember.js";
import { container } from "../util/container.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

/**
 * The options to list the members of a thread with.
 */
export interface ThreadMemberListOptions {
  /**
   * Whether to include each member's guild member.
   */
  withMember?: boolean;
  /**
   * How many members to fetch, up to 100. Paginating requires `withMember`.
   */
  limit?: number;
  after?: string;
}

/**
 * Manages the members of every thread known to the client.
 */
export class ThreadMemberManager extends CachedManager<
  "threadMembers",
  ThreadMember,
  [threadId: string, userId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "threadMembers");
  }

  public createStructure(data: CacheEntityTypes["threadMembers"]): ThreadMember {
    return new ThreadMember(data);
  }

  public keyOf(data: CacheEntityTypes["threadMembers"]): string {
    if (!data.id || !data.user_id) {
      throw new TypeError("Cannot key a thread member without its IDs");
    }

    return this.resolveKey(data.id, data.user_id);
  }

  public resolveKey(threadId: string, userId: string): string {
    return threadMemberKey(threadId, userId);
  }

  /**
   * Adds a thread member to the cache, and its guild member to `client.members`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["threadMembers"],
    cache = true,
    options?: AddOptions,
  ): Promise<ThreadMember> {
    const { member, guild_id: guildId } = data;
    if (member?.user && guildId) {
      await this.client.members._add({ ...member, guild_id: guildId }, cache);
    }

    return super._add(data, cache, options);
  }

  public override async hydrate(data: CacheEntityTypes["threadMembers"]): Promise<ThreadMember> {
    const { member, guild_id: guildId, user_id: userId } = data;
    let guildMember = null;
    if (member?.user && guildId) {
      guildMember = await this.client.members.resolveData({ ...member, guild_id: guildId });
    } else if (guildId && userId) {
      guildMember = (await this.client.members.get(guildId, userId)) ?? null;
    }

    return new ThreadMember(data, { guildMember });
  }

  /**
   * Fetches a member of a thread from the API, bypassing the cache, and caches it.
   *
   * @param threadId The ID of the thread.
   * @param userId The ID of the user.
   * @param options Whether to include the guild member.
   */
  public async fetchWithMember(
    threadId: string,
    userId: string,
    options: { withMember?: boolean } = {},
  ): Promise<ThreadMember> {
    const query = new URLSearchParams({ with_member: String(options.withMember ?? false) });
    const member = (await container.rest.get(Routes.threadMembers(threadId, userId), {
      query,
    })) as APIThreadMember;
    return this._add(await this.withGuildId(threadId, member));
  }

  /**
   * Lists the members of a thread, and caches them.
   *
   * @param threadId The ID of the thread.
   * @param options Whether to include the guild members, and the page.
   */
  public async list(
    threadId: string,
    options: ThreadMemberListOptions = {},
  ): Promise<ThreadMember[]> {
    const query = new URLSearchParams({ with_member: String(options.withMember ?? false) });
    if (options.limit) query.set("limit", String(options.limit));
    if (options.after) query.set("after", options.after);

    const members = (await container.rest.get(Routes.threadMembers(threadId), {
      query,
    })) as APIThreadMember[];
    const guildId = await this.guildIdOf(threadId);
    return Promise.all(
      members.map((member) => this._add(guildId ? { ...member, guild_id: guildId } : member)),
    );
  }

  /**
   * Adds a user to a thread.
   *
   * @param threadId The ID of the thread.
   * @param userId The ID of the user, `"@me"` (the default) to join it.
   */
  public async add(threadId: string, userId = "@me"): Promise<void> {
    await container.rest.put(Routes.threadMembers(threadId, userId));
  }

  /**
   * Removes a user from a thread, and from the cache.
   *
   * @param threadId The ID of the thread.
   * @param userId The ID of the user, `"@me"` (the default) to leave it.
   */
  public async remove(threadId: string, userId = "@me"): Promise<void> {
    await container.rest.delete(Routes.threadMembers(threadId, userId));
    const cachedId = userId === "@me" ? (this.client.user?.id ?? this.client.id) : userId;
    await this.cache?.delete(this.resolveKey(threadId, cachedId));
  }

  protected async fetchRaw(threadId: string, userId: string) {
    const member = (await container.rest.get(
      Routes.threadMembers(threadId, userId),
    )) as APIThreadMember;
    return this.withGuildId(threadId, member);
  }

  // Thread members from REST lack the guild's ID, which resolving their guild member needs.
  private async withGuildId(
    threadId: string,
    member: APIThreadMember,
  ): Promise<CacheEntityTypes["threadMembers"]> {
    const guildId = await this.guildIdOf(threadId);
    return guildId ? { ...member, guild_id: guildId } : member;
  }

  private async guildIdOf(threadId: string): Promise<string | undefined> {
    const thread = await this.client.threads.get(threadId);
    return (thread?.toJSON() as { guild_id?: string } | undefined)?.guild_id;
  }
}

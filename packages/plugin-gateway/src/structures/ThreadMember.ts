import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { getGatewayClient } from "../util/container.js";
import type { GuildMember } from "./GuildMember.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";

/**
 * The relations of a {@link ThreadMember}, resolved from the cache by `client.threadMembers`.
 */
export interface ThreadMemberRelations {
  /**
   * The member of the thread's guild, when the payload included it or the cache holds it.
   */
  guildMember?: GuildMember | null;
}

/**
 * A member of a thread: a user who joined it, or was added to it.
 */
export class ThreadMember extends Structure<CacheEntityTypes["threadMembers"]> {
  declare public [kRelations]: ThreadMemberRelations;

  /**
   * @param data The raw thread member.
   * @param relations The guild member as resolved from the cache, by `client.threadMembers`.
   */
  public constructor(
    data: CacheEntityTypes["threadMembers"],
    relations: ThreadMemberRelations = {},
  ) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<CacheEntityTypes["threadMembers"]>>): this {
    if (data.member) this.dropRelations("guildMember");
    return super[kPatch](data);
  }

  /**
   * The ID of the user. Absent only from the thread member the gateway attaches to a thread payload for the bot.
   */
  public get id(): string | null {
    return this[kData].user_id ?? null;
  }

  public get threadId(): string | null {
    return this[kData].id ?? null;
  }

  public get joinedTimestamp(): number {
    return Date.parse(this[kData].join_timestamp);
  }

  public get joinedAt(): Date {
    return new Date(this.joinedTimestamp);
  }

  /**
   * The thread member's notification flags.
   */
  public get flags(): number {
    return this[kData].flags;
  }

  /**
   * The member of the thread's guild, when known.
   */
  public get guildMember(): GuildMember | null {
    return this[kRelations].guildMember ?? null;
  }

  /**
   * Removes the member from the thread.
   */
  public async remove(): Promise<this> {
    const { id, threadId } = this;
    if (!id || !threadId) throw new Error("Cannot remove a thread member without its IDs");
    await getGatewayClient().threadMembers.remove(threadId, id);
    return this;
  }
}

import type { ChannelType } from "discord-api-types/v10";
import type { Channel, ChannelDataType } from "../Channel.js";
import type { ThreadAutoArchiveDuration } from "discord-api-types/v10";
import { ThreadChannelMemberManager } from "../../managers/ThreadChannelMemberManager.js";
import { getGatewayClient } from "../../util/container.js";
import type { Message } from "../Message.js";
import type { ThreadMember } from "../ThreadMember.js";
import { kData } from "../Structure.js";
import { editChannel } from "./edit.js";
import type { APIThreadMetadata } from "discord-api-types/v10";

type Data = {
  parent_id?: string | null;
  owner_id?: string;
  thread_metadata?: APIThreadMetadata;
  message_count?: number;
  member_count?: number;
};
const kArchiveTimestamp: unique symbol = Symbol.for(
  "wolfstar.structures.archiveTimestamp",
) as never;

export interface ThreadChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the metadata of threads.
 */
export class ThreadChannelMixin<Type extends ChannelType = ChannelType> {
  declare protected [kArchiveTimestamp]: number | null | undefined;

  public static optimizeData(this: Channel, data: Partial<ChannelDataType>): void {
    const metadata = (data as Data).thread_metadata;
    if (metadata !== undefined) {
      (this as ThreadChannelMixin)[kArchiveTimestamp] = metadata.archive_timestamp
        ? Date.parse(metadata.archive_timestamp)
        : null;
    }
  }

  public get archived(): boolean {
    return (this[kData] as Data).thread_metadata?.archived ?? false;
  }

  public get locked(): boolean {
    return (this[kData] as Data).thread_metadata?.locked ?? false;
  }

  public get archiveTimestamp(): number | null {
    return this[kArchiveTimestamp] ?? null;
  }

  /**
   * The minutes of inactivity after which the thread is archived.
   */
  public get autoArchiveDuration(): number | null {
    return (this[kData] as Data).thread_metadata?.auto_archive_duration ?? null;
  }

  public get messageCount(): number {
    return (this[kData] as Data).message_count ?? 0;
  }

  public get memberCount(): number {
    return (this[kData] as Data).member_count ?? 0;
  }

  /**
   * Whether non-moderators can add members, for private threads.
   */
  public get invitable(): boolean | null {
    return (this[kData] as Data).thread_metadata?.invitable ?? null;
  }

  /**
   * The members of the thread.
   */
  public get members(): ThreadChannelMemberManager {
    return new ThreadChannelMemberManager(getGatewayClient(), this.id);
  }

  public setArchived(archived = true, reason?: string): Promise<this> {
    return editChannel(this, { archived, reason });
  }

  public setLocked(locked = true, reason?: string): Promise<this> {
    return editChannel(this, { locked, reason });
  }

  /**
   * Sets whether non-moderators can add members to the private thread.
   */
  public setInvitable(invitable = true, reason?: string): Promise<this> {
    return editChannel(this, { invitable, reason });
  }

  public setAutoArchiveDuration(
    autoArchiveDuration: ThreadAutoArchiveDuration,
    reason?: string,
  ): Promise<this> {
    return editChannel(this, { autoArchiveDuration, reason });
  }

  /**
   * Joins the thread.
   */
  public async join(): Promise<this> {
    await getGatewayClient().threadMembers.add(this.id);
    return this;
  }

  /**
   * Leaves the thread.
   */
  public async leave(): Promise<this> {
    await getGatewayClient().threadMembers.remove(this.id);
    return this;
  }

  /**
   * Fetches the message the thread was started from, in its parent channel. Its ID is the thread's.
   */
  public fetchStarterMessage(): Promise<Message> {
    const { parent_id: parentId } = this[kData] as Data;
    if (!parentId) throw new Error(`Thread ${this.id} has no known parent`);
    return getGatewayClient().messages.fetch(parentId, this.id);
  }

  /**
   * Fetches the thread member of the thread's owner.
   */
  public fetchOwner(): Promise<ThreadMember> {
    const { owner_id: ownerId } = this[kData] as Data;
    if (!ownerId) throw new Error(`Thread ${this.id} has no known owner`);
    return getGatewayClient().threadMembers.fetch(this.id, ownerId);
  }
}

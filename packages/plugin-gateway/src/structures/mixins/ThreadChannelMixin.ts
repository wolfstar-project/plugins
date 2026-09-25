import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import type { APIThreadMetadata } from "discord-api-types/v10";

type Data = { thread_metadata?: APIThreadMetadata; message_count?: number; member_count?: number };

export interface ThreadChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the metadata of threads.
 */
export class ThreadChannelMixin<Type extends ChannelType = ChannelType> {
  public get archived(): boolean {
    return (this[kData] as Data).thread_metadata?.archived ?? false;
  }

  public get locked(): boolean {
    return (this[kData] as Data).thread_metadata?.locked ?? false;
  }

  public get archiveTimestamp(): number | null {
    const archiveTimestamp = (this[kData] as Data).thread_metadata?.archive_timestamp;
    return archiveTimestamp ? Date.parse(archiveTimestamp) : null;
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
}

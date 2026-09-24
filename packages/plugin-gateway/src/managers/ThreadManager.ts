import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIThreadChannel } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnnouncementThreadChannel } from "../structures/AnnouncementThreadChannel.js";
import type { PrivateThreadChannel } from "../structures/PrivateThreadChannel.js";
import type { PublicThreadChannel } from "../structures/PublicThreadChannel.js";
import { container } from "../util/container.js";
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

  public resolveKey(threadId: string): string {
    return threadId;
  }

  protected async fetchRaw(threadId: string) {
    return (await container.rest.get(Routes.channel(threadId))) as APIThreadChannel;
  }
}

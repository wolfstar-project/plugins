import { stageInstanceKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIStageInstance,
  type RESTPatchAPIStageInstanceJSONBody,
  type RESTPostAPIStageInstanceJSONBody,
  type StageInstancePrivacyLevel,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { StageInstance } from "../structures/StageInstance.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * The fields of a stage instance that can be edited.
 */
export interface StageInstanceEditOptions {
  topic?: string;
  privacyLevel?: StageInstancePrivacyLevel;
  reason?: string;
}

/**
 * The options to start a stage with.
 */
export interface StageInstanceCreateOptions extends StageInstanceEditOptions {
  topic: string;
  /**
   * Whether to notify the members of the guild that the stage started.
   */
  sendStartNotification?: boolean;
  /**
   * The scheduled event the stage belongs to.
   */
  guildScheduledEvent?: IdResolvable;
}

/**
 * Manages the stage instances of one guild, keyed by the ID of their stage channel.
 */
export class StageInstanceManager extends CachedManager<
  "stageInstances",
  StageInstance,
  [channelId: string]
> {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "stageInstances");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["stageInstances"]): StageInstance {
    return new StageInstance(data);
  }

  public keyOf(data: CacheEntityTypes["stageInstances"]): string {
    return this.resolveKey(data.channel_id);
  }

  public resolveKey(channelId: string): string {
    return stageInstanceKey(this.guildId, channelId);
  }

  public override async hydrate(data: CacheEntityTypes["stageInstances"]): Promise<StageInstance> {
    const [guild, channel] = await Promise.all([
      this.cachedGuild(data.guild_id),
      this.client.channels.get(data.channel_id),
    ]);
    return new StageInstance(data, { guild, channel: channel ?? null });
  }

  /**
   * Starts a stage in a stage channel.
   *
   * @param channel The stage channel, or its ID.
   * @param options The topic and privacy level, and whether to notify the guild.
   */
  public async create(
    channel: IdResolvable,
    options: StageInstanceCreateOptions,
  ): Promise<StageInstance> {
    const body: RESTPostAPIStageInstanceJSONBody = {
      channel_id: resolveId(channel),
      topic: options.topic,
      privacy_level: options.privacyLevel,
      send_start_notification: options.sendStartNotification,
      guild_scheduled_event_id:
        options.guildScheduledEvent && resolveId(options.guildScheduledEvent),
    };
    const instance = (await container.rest.post(Routes.stageInstances(), {
      body,
      reason: options.reason,
    })) as APIStageInstance;
    return this._add(instance);
  }

  /**
   * Edits the stage of a channel.
   *
   * @param channelId The ID of the stage channel.
   * @param options The topic and privacy level, and the reason for the audit log.
   */
  public async edit(channelId: string, options: StageInstanceEditOptions): Promise<StageInstance> {
    const body: RESTPatchAPIStageInstanceJSONBody = {
      topic: options.topic,
      privacy_level: options.privacyLevel,
    };
    const instance = (await container.rest.patch(Routes.stageInstance(channelId), {
      body,
      reason: options.reason,
    })) as APIStageInstance;
    return this._add(instance);
  }

  /**
   * Ends the stage of a channel.
   *
   * @param channelId The ID of the stage channel.
   * @param reason The reason for the audit log.
   */
  public async delete(channelId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.stageInstance(channelId), { reason });
    await this.cache?.delete(this.resolveKey(channelId));
  }

  protected async fetchRaw(channelId: string) {
    return (await container.rest.get(Routes.stageInstance(channelId))) as APIStageInstance;
  }
}

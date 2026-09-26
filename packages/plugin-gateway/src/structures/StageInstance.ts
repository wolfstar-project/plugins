import type { APIStageInstance, StageInstancePrivacyLevel } from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { StageInstanceEditOptions } from "../managers/StageInstanceManager.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import type { GuildScheduledEvent } from "./GuildScheduledEvent.js";
import { kData, kPatch, kRelations, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * The relations of a {@link StageInstance}, resolved from the cache by the guild's stage instance manager.
 */
export interface StageInstanceRelations {
  guild?: Guild | null;
  channel?: AnyChannel | null;
}

/**
 * A live stage: the topic of a stage channel while it is open.
 */
export class StageInstance extends Structure<APIStageInstance> {
  declare public [kRelations]: StageInstanceRelations;

  /**
   * @param data The raw stage instance.
   * @param relations The guild and channel as resolved from the cache, by the guild's stage instance manager.
   */
  public constructor(data: APIStageInstance, relations: StageInstanceRelations = {}) {
    super(data, relations);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  public get topic() {
    return this[kData].topic;
  }

  public get privacyLevel() {
    return this[kData].privacy_level;
  }

  public get guildScheduledEventId(): string | null {
    return this[kData].guild_scheduled_event_id ?? null;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public get channel(): AnyChannel | null {
    return this[kRelations].channel ?? null;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * Fetches the scheduled event the stage belongs to, if any.
   */
  public async fetchGuildScheduledEvent(): Promise<GuildScheduledEvent | null> {
    const { guildScheduledEventId } = this;
    return guildScheduledEventId
      ? getGatewayClient().guilds.scheduledEvents(this.guildId).fetch(guildScheduledEventId)
      : null;
  }

  /**
   * Edits the stage.
   *
   * @param options The topic and privacy level, and the reason for the audit log.
   */
  public async edit(options: StageInstanceEditOptions): Promise<this> {
    const instance = await getGatewayClient()
      .guilds.stageInstances(this.guildId)
      .edit(this.channelId, options);
    return this[kPatch](instance.toJSON());
  }

  public setTopic(topic: string, reason?: string): Promise<this> {
    return this.edit({ topic, reason });
  }

  public setPrivacyLevel(privacyLevel: StageInstancePrivacyLevel, reason?: string): Promise<this> {
    return this.edit({ privacyLevel, reason });
  }

  /**
   * Ends the stage.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().guilds.stageInstances(this.guildId).delete(this.channelId, reason);
    return this;
  }
}

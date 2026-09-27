import { StageInstance as BaseStageInstance } from "@discordjs/structures";
import type { APIStageInstance, StageInstancePrivacyLevel } from "discord-api-types/v10";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { StageInstanceEditOptions } from "../../managers/StageInstanceManager.js";
import type { Guild } from "../guilds/Guild.js";
import type { GuildScheduledEvent } from "../guilds/GuildScheduledEvent.js";
import { Mixin } from "../Mixin.js";
import {
  initStructure,
  kPatch,
  kRelations,
  snowflakeTimestamp,
  StructureMixin,
} from "../Structure.js";

/**
 * The relations of a {@link StageInstance}, resolved from the cache by the guild's stage instance manager.
 */
export interface StageInstanceRelations {
  guild?: Guild | null;
  channel?: AnyChannel | null;
}

export interface StageInstance extends StructureMixin<APIStageInstance, StageInstanceRelations> {}

/**
 * A live stage, the topic of a stage channel while it is open: `@discordjs/structures`' `StageInstance`, with its
 * guild and channel, and actions through the client.
 */
export class StageInstance extends BaseStageInstance {
  /**
   * @param data The raw stage instance.
   * @param relations The guild and channel as resolved from the cache, by the guild's stage instance manager.
   */
  public constructor(data: APIStageInstance, relations: StageInstanceRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public get channel(): AnyChannel | null {
    return this[kRelations].channel ?? null;
  }

  public override get createdTimestamp(): number {
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
      ? this.client.guilds.scheduledEvents(this.guildId).fetch(guildScheduledEventId)
      : null;
  }

  /**
   * Edits the stage.
   *
   * @param options The topic and privacy level, and the reason for the audit log.
   */
  public async edit(options: StageInstanceEditOptions): Promise<this> {
    const instance = await this.client.guilds
      .stageInstances(this.guildId)
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
    await this.client.guilds.stageInstances(this.guildId).delete(this.channelId, reason);
    return this;
  }
}

Mixin(StageInstance, [StructureMixin]);

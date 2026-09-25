import type { ImageURLOptions } from "@discordjs/rest";
import {
  GuildScheduledEventStatus,
  type APIGuildScheduledEvent,
  type APIGuildScheduledEventRecurrenceRule,
} from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type {
  GuildScheduledEventEditOptions,
  GuildScheduledEventSubscriber,
  GuildScheduledEventSubscribersOptions,
} from "../managers/GuildScheduledEventManager.js";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { kData, kPatch, kRelations, snowflakeTimestamp, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * The relations of a {@link GuildScheduledEvent}, resolved from the cache by the guild's event manager.
 */
export interface GuildScheduledEventRelations {
  creator?: User | null;
  guild?: Guild | null;
  channel?: AnyChannel | null;
}

/**
 * An event scheduled in a guild: in a stage or voice channel, or somewhere else.
 */
export class GuildScheduledEvent extends Structure<APIGuildScheduledEvent> {
  declare public [kRelations]: GuildScheduledEventRelations;

  /**
   * @param data The raw event.
   * @param relations The creator, guild, and channel as resolved from the cache, by the guild's event manager.
   */
  public constructor(data: APIGuildScheduledEvent, relations: GuildScheduledEventRelations = {}) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<APIGuildScheduledEvent>>): this {
    if (data.creator) this.dropRelations("creator");
    if (data.channel_id !== undefined) this.dropRelations("channel");
    return super[kPatch](data);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get channelId(): string | null {
    return this[kData].channel_id;
  }

  public get creatorId(): string | null {
    return this[kData].creator_id ?? null;
  }

  public get name() {
    return this[kData].name;
  }

  public get description(): string | null {
    return this[kData].description ?? null;
  }

  public get scheduledStartTimestamp(): number {
    return Date.parse(this[kData].scheduled_start_time);
  }

  public get scheduledStartAt(): Date {
    return new Date(this.scheduledStartTimestamp);
  }

  public get scheduledEndTimestamp(): number | null {
    const end = this[kData].scheduled_end_time;
    return end ? Date.parse(end) : null;
  }

  public get scheduledEndAt(): Date | null {
    const { scheduledEndTimestamp } = this;
    return scheduledEndTimestamp === null ? null : new Date(scheduledEndTimestamp);
  }

  public get privacyLevel() {
    return this[kData].privacy_level;
  }

  public get status() {
    return this[kData].status;
  }

  public get entityType() {
    return this[kData].entity_type;
  }

  public get entityId(): string | null {
    return this[kData].entity_id;
  }

  /**
   * Where an external event takes place.
   */
  public get location(): string | null {
    return this[kData].entity_metadata?.location ?? null;
  }

  /**
   * How many users subscribed, when the payload includes it.
   */
  public get userCount(): number | null {
    return this[kData].user_count ?? null;
  }

  public get image(): string | null {
    return this[kData].image ?? null;
  }

  public get recurrenceRule(): APIGuildScheduledEventRecurrenceRule | null {
    return this[kData].recurrence_rule;
  }

  /**
   * The creator, from the payload or the cache.
   */
  public get creator(): User | null {
    const { creator } = this[kData];
    return this[kRelations].creator ?? (creator ? new User(creator) : null);
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public get channel(): AnyChannel | null {
    return this[kRelations].channel ?? null;
  }

  /**
   * The URL of the event.
   */
  public get url(): string {
    return `https://discord.com/events/${this.guildId}/${this.id}`;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  public coverImageURL(options?: Readonly<ImageURLOptions>): string | null {
    const { image } = this;
    return image ? cdn.guildScheduledEventCover(this.id, image, options) : null;
  }

  public isScheduled(): boolean {
    return this.status === GuildScheduledEventStatus.Scheduled;
  }

  public isActive(): boolean {
    return this.status === GuildScheduledEventStatus.Active;
  }

  public isCompleted(): boolean {
    return this.status === GuildScheduledEventStatus.Completed;
  }

  public isCanceled(): boolean {
    return this.status === GuildScheduledEventStatus.Canceled;
  }

  /**
   * Edits the event.
   *
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(options: GuildScheduledEventEditOptions): Promise<this> {
    const event = await getGatewayClient()
      .guilds.scheduledEvents(this.guildId)
      .edit(this.id, options);
    return this[kPatch](event.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  public setDescription(description: string | null, reason?: string): Promise<this> {
    return this.edit({ description, reason });
  }

  public setScheduledStartTime(scheduledStartTime: Date | number, reason?: string): Promise<this> {
    return this.edit({ scheduledStartTime, reason });
  }

  public setScheduledEndTime(
    scheduledEndTime: Date | number | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ scheduledEndTime, reason });
  }

  public setStatus(status: GuildScheduledEventStatus, reason?: string): Promise<this> {
    return this.edit({ status, reason });
  }

  /**
   * Sets where an external event takes place.
   */
  public setLocation(location: string, reason?: string): Promise<this> {
    return this.edit({ entityMetadata: { location }, reason });
  }

  /**
   * Fetches the users who subscribed to the event, paginated by user ID.
   *
   * @param options How many users, around which user ID, and whether to include their members.
   */
  public fetchSubscribers(
    options?: GuildScheduledEventSubscribersOptions,
  ): Promise<GuildScheduledEventSubscriber[]> {
    return getGatewayClient()
      .guilds.scheduledEvents(this.guildId)
      .fetchSubscribers(this.id, options);
  }

  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().guilds.scheduledEvents(this.guildId).delete(this.id, reason);
    return this;
  }
}

import { scheduledEventKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  type APIGuildScheduledEventEntityMetadata,
  type APIGuildScheduledEventRecurrenceRule,
  type GuildScheduledEventEntityType,
  type GuildScheduledEventPrivacyLevel,
  type GuildScheduledEventStatus,
  type RESTPatchAPIGuildScheduledEventJSONBody,
  type RESTPostAPIGuildScheduledEventJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildScheduledEvent } from "../structures/GuildScheduledEvent.js";
import type { GuildMember } from "../structures/GuildMember.js";
import type { User } from "../structures/User.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

/**
 * The fields of a scheduled event that can be edited.
 */
export interface GuildScheduledEventEditOptions {
  name?: string;
  description?: string | null;
  /**
   * The stage or voice channel, `null` for an external event.
   */
  channel?: IdResolvable | null;
  scheduledStartTime?: Date | number;
  scheduledEndTime?: Date | number | null;
  privacyLevel?: GuildScheduledEventPrivacyLevel;
  entityType?: GuildScheduledEventEntityType;
  /**
   * Where an external event takes place.
   */
  entityMetadata?: APIGuildScheduledEventEntityMetadata | null;
  /**
   * Starts, ends, or cancels the event.
   */
  status?: GuildScheduledEventStatus;
  /**
   * The cover image, as a data URI.
   */
  image?: string | null;
  recurrenceRule?: APIGuildScheduledEventRecurrenceRule | null;
  reason?: string;
}

/**
 * The options to create a scheduled event with.
 */
export interface GuildScheduledEventCreateOptions extends Omit<
  GuildScheduledEventEditOptions,
  "status"
> {
  name: string;
  scheduledStartTime: Date | number;
  privacyLevel: GuildScheduledEventPrivacyLevel;
  entityType: GuildScheduledEventEntityType;
}

/**
 * The options to fetch the subscribers of an event with. `before` and `after` are user IDs.
 */
export interface GuildScheduledEventSubscribersOptions {
  /**
   * How many users to fetch, up to 100.
   */
  limit?: number;
  before?: string;
  after?: string;
  /**
   * Whether to include each user's guild member.
   */
  withMember?: boolean;
}

/**
 * A user subscribed to a scheduled event.
 */
export interface GuildScheduledEventSubscriber {
  user: User;
  member: GuildMember | null;
}

/**
 * Manages the scheduled events of one guild.
 */
export class GuildScheduledEventManager extends CachedManager<
  "scheduledEvents",
  GuildScheduledEvent,
  [eventId: string]
> {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "scheduledEvents");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["scheduledEvents"]): GuildScheduledEvent {
    return new GuildScheduledEvent(data);
  }

  public keyOf(data: CacheEntityTypes["scheduledEvents"]): string {
    return this.resolveKey(data.id);
  }

  public resolveKey(eventId: string): string {
    return scheduledEventKey(this.guildId, eventId);
  }

  /**
   * Adds an event to the cache, and its creator to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["scheduledEvents"],
    cache = true,
    options?: AddOptions,
  ): Promise<GuildScheduledEvent> {
    if (data.creator) await this.client.users._add(data.creator, cache);
    return super._add(data, cache, options);
  }

  public override async hydrate(
    data: CacheEntityTypes["scheduledEvents"],
  ): Promise<GuildScheduledEvent> {
    const [creator, guild, channel] = await Promise.all([
      data.creator
        ? this.client.users.resolveData(data.creator)
        : data.creator_id
          ? this.client.users.get(data.creator_id)
          : undefined,
      this.cachedGuild(data.guild_id),
      data.channel_id ? this.client.channels.get(data.channel_id) : undefined,
    ]);
    return new GuildScheduledEvent(data, {
      creator: creator ?? null,
      guild,
      channel: channel ?? null,
    });
  }

  /**
   * Fetches every scheduled event of the guild, and caches them.
   *
   * @param options Whether to include how many users subscribed to each.
   */
  public async fetchAll(options: { withUserCount?: boolean } = {}): Promise<GuildScheduledEvent[]> {
    const events = await this.client.core.api.guilds.getScheduledEvents(this.guildId, {
      with_user_count: options.withUserCount ?? true,
    });
    return Promise.all(events.map((event) => this._add(event)));
  }

  /**
   * Creates a scheduled event.
   *
   * @param options The event's name, time, place, and privacy.
   */
  public async create(options: GuildScheduledEventCreateOptions): Promise<GuildScheduledEvent> {
    const event = await this.client.core.api.guilds.createScheduledEvent(
      this.guildId,
      toEventBody(options) as RESTPostAPIGuildScheduledEventJSONBody,
      {
        reason: options.reason,
      },
    );
    return this._add(event);
  }

  /**
   * Edits a scheduled event.
   *
   * @param eventId The ID of the event.
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(
    eventId: string,
    options: GuildScheduledEventEditOptions,
  ): Promise<GuildScheduledEvent> {
    const event = await this.client.core.api.guilds.editScheduledEvent(
      this.guildId,
      eventId,
      toEventBody(options),
      {
        reason: options.reason,
      },
    );
    return this._add(event);
  }

  /**
   * Deletes a scheduled event.
   *
   * @param eventId The ID of the event.
   * @param reason The reason for the audit log.
   */
  public async delete(eventId: string, reason?: string): Promise<void> {
    await this.client.core.api.guilds.deleteScheduledEvent(this.guildId, eventId, { reason });
    await this.cache?.delete(this.resolveKey(eventId));
  }

  /**
   * Fetches the users who subscribed to an event, and caches them.
   *
   * @param eventId The ID of the event.
   * @param options How many users, around which user ID, and whether to include their members.
   */
  public async fetchSubscribers(
    eventId: string,
    options: GuildScheduledEventSubscribersOptions = {},
  ): Promise<GuildScheduledEventSubscriber[]> {
    const subscribers = await this.client.core.api.guilds.getScheduledEventUsers(
      this.guildId,
      eventId,
      {
        with_member: options.withMember ?? false,
        limit: options.limit,
        before: options.before,
        after: options.after,
      },
    );
    return Promise.all(
      subscribers.map(async (subscriber) => ({
        user: await this.client.users._add(subscriber.user),
        member: subscriber.member
          ? await this.client.members._add({
              ...subscriber.member,
              user: subscriber.user,
              guild_id: this.guildId,
            })
          : null,
      })),
    );
  }

  protected async fetchRaw(eventId: string) {
    return this.client.core.api.guilds.getScheduledEvent(this.guildId, eventId, {
      with_user_count: true,
    });
  }
}

function toISO(value: Date | number | null | undefined): string | null | undefined {
  return value === undefined || value === null ? value : new Date(value).toISOString();
}

function toEventBody(
  options: GuildScheduledEventEditOptions,
): RESTPatchAPIGuildScheduledEventJSONBody {
  const body: Record<string, unknown> = {
    name: options.name,
    description: options.description,
    channel_id:
      options.channel === undefined
        ? undefined
        : options.channel === null
          ? null
          : resolveId(options.channel),
    scheduled_start_time: toISO(options.scheduledStartTime),
    scheduled_end_time: toISO(options.scheduledEndTime),
    privacy_level: options.privacyLevel,
    entity_type: options.entityType,
    entity_metadata: options.entityMetadata,
    status: options.status,
    image: options.image,
    recurrence_rule: options.recurrenceRule,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return body as RESTPatchAPIGuildScheduledEventJSONBody;
}

import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  PresenceUpdateStatus,
  type GatewayPresenceClientStatus,
  type PresenceUpdateReceiveStatus,
} from "discord-api-types/v10";
import { getGatewayClient } from "../util/container.js";
import { Activity } from "./Activity.js";
import type { Guild } from "./Guild.js";
import type { GuildMember } from "./GuildMember.js";
import { kData, kRelations, Structure } from "./Structure.js";
import type { User } from "./User.js";

/**
 * The status of a presence on each of the user's platforms; a missing platform means the user is offline there.
 */
export type ClientStatus = GatewayPresenceClientStatus;

/**
 * The relations of a {@link Presence}, resolved from the cache by `client.presences`.
 */
export interface PresenceRelations {
  user?: User | null;
  member?: GuildMember | null;
  guild?: Guild | null;
}

/**
 * The presence of a user in a guild: their status and activities.
 */
export class Presence extends Structure<CacheEntityTypes["presences"]> {
  declare public [kRelations]: PresenceRelations;

  /**
   * @param data The raw presence.
   * @param relations The user, member, and guild as resolved from the cache, by `client.presences`.
   */
  public constructor(data: CacheEntityTypes["presences"], relations: PresenceRelations = {}) {
    super(data, relations);
  }

  public get userId() {
    return this[kData].user.id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  /**
   * The status of the user, `offline` when the payload did not include it.
   */
  public get status(): PresenceUpdateReceiveStatus {
    return this[kData].status ?? PresenceUpdateStatus.Offline;
  }

  public get activities(): Activity[] {
    return (this[kData].activities ?? []).map((activity) => new Activity(activity));
  }

  /**
   * The status of the user on each of their platforms, `null` when the payload did not include it.
   */
  public get clientStatus(): ClientStatus | null {
    return this[kData].client_status ?? null;
  }

  /**
   * The user, from the cache. Presence payloads only carry the user's changed fields.
   */
  public get user(): User | null {
    return this[kRelations].user ?? null;
  }

  public get member(): GuildMember | null {
    return this[kRelations].member ?? null;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public fetchMember(): Promise<GuildMember> {
    return getGatewayClient().members.fetch(this.guildId, this.userId);
  }

  public fetchUser(): Promise<User> {
    return getGatewayClient().users.fetch(this.userId);
  }

  /**
   * Whether this presence has the same status, client status, and activities as another.
   *
   * @param presence The presence to compare with.
   */
  public equals(presence: Presence | null | undefined): boolean {
    if (this === presence) return true;
    if (!presence) return false;

    const activities = this.activities;
    const otherActivities = presence.activities;
    return (
      this.status === presence.status &&
      this.clientStatus?.web === presence.clientStatus?.web &&
      this.clientStatus?.mobile === presence.clientStatus?.mobile &&
      this.clientStatus?.desktop === presence.clientStatus?.desktop &&
      activities.length === otherActivities.length &&
      activities.every((activity, index) => activity.equals(otherActivities[index]))
    );
  }
}

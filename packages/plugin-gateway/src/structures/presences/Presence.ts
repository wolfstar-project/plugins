import { cachedGuild, cachedMember, cachedUser } from "../../util/cache.js";
import { Presence as BasePresence } from "@discordjs/structures";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  PresenceUpdateStatus,
  type GatewayPresenceClientStatus,
  type PresenceUpdateReceiveStatus,
} from "discord-api-types/v10";
import { Activity } from "./Activity.js";
import type { Guild } from "../guilds/Guild.js";
import type { GuildMember } from "../guilds/GuildMember.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import type { User } from "../users/User.js";

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

export interface Presence extends StructureMixin<
  CacheEntityTypes["presences"],
  PresenceRelations
> {}

/**
 * The presence of a user in a guild, their status and activities: `@discordjs/structures`' `Presence`, with its user,
 * member, and guild, and actions through the client.
 */
export class Presence extends BasePresence {
  /**
   * @param data The raw presence.
   * @param relations The user, member, and guild as resolved from the cache, by `client.presences`.
   */
  public constructor(data: CacheEntityTypes["presences"], relations: PresenceRelations = {}) {
    super(data);
    initStructure(this, data, relations);
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
  public override get status(): PresenceUpdateReceiveStatus {
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
    return this.lazyRelation("user", (client) => cachedUser(client, this.userId));
  }

  public get member(): GuildMember | null {
    return this.lazyRelation("member", (client) =>
      cachedMember(client, this[kData].guild_id, this.userId),
    );
  }

  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  public fetchMember(): Promise<GuildMember> {
    return this.client.members.fetch(this.guildId, this.userId);
  }

  public fetchUser(): Promise<User> {
    return this.client.users.fetch(this.userId);
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

Mixin(Presence, [StructureMixin]);

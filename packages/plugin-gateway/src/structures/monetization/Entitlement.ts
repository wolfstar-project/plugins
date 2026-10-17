import { Entitlement as BaseEntitlement } from "@discordjs/structures";
import type { APIEntitlement } from "discord-api-types/v10";
import { GatewayTypeError } from "../../errors/GatewayError.js";
import { cachedGuild, cachedUser } from "../../util/cache.js";
import { isDeepEqual } from "../../util/equal.js";
import type { Guild } from "../guilds/Guild.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kPatch, StructureMixin } from "../Structure.js";
import type { User } from "../users/User.js";

/**
 * The relations of an {@link Entitlement}, resolved from the cache.
 */
export interface EntitlementRelations {
  guild?: Guild | null;
  user?: User | null;
}

export interface Entitlement extends StructureMixin<APIEntitlement, EntitlementRelations> {}

/**
 * A user's or a guild's access to a premium offer (a SKU) of the application: `@discordjs/structures`'
 * `Entitlement`, with its guild and user, and actions through the client.
 */
export class Entitlement extends BaseEntitlement {
  /**
   * @param data The raw entitlement.
   * @param relations The guild and user as resolved from the cache.
   */
  public constructor(data: APIEntitlement, relations: EntitlementRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The guild that is granted access to the SKU, from the cache: `null` for an entitlement of a user, or when the
   * guild is not cached.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this.guildId));
  }

  /**
   * The user that is granted access to the SKU, from the cache: `null` for an entitlement of a guild, or when the
   * user is not cached.
   */
  public get user(): User | null {
    return this.lazyRelation("user", (client) => cachedUser(client, this.userId));
  }

  /**
   * The date at which the entitlement is valid from, `null` for a test entitlement. Like discord.js's
   * `Entitlement#startsAt`.
   */
  public get startsAt(): Date | null {
    return this.startsDate;
  }

  /**
   * The date at which the entitlement stops being valid, `null` if it never does. Like discord.js's
   * `Entitlement#endsAt`.
   */
  public get endsAt(): Date | null {
    return this.endsDate;
  }

  public get createdAt(): Date | null {
    return this.createdDate;
  }

  /**
   * Whether the entitlement is active: not deleted, and not ended.
   */
  public isActive(): boolean {
    const { endsTimestamp } = this;
    return !this.deleted && (endsTimestamp === null || endsTimestamp > Date.now());
  }

  /**
   * Whether the entitlement is a test one, created through `entitlements.createTest`.
   */
  public isTest(): boolean {
    return this.startsTimestamp === null;
  }

  /**
   * Whether the entitlement is a subscription of a user.
   */
  public isUserSubscription(): boolean {
    return !this.guildId;
  }

  /**
   * Whether the entitlement is a subscription of a guild.
   */
  public isGuildSubscription(): boolean {
    return Boolean(this.guildId);
  }

  /**
   * Fetches the user that is granted access to the SKU.
   *
   * @throws {GatewayTypeError} `IdUnresolvable` when the entitlement belongs to a guild, without a user.
   */
  public fetchUser(): Promise<User> {
    const { userId } = this;
    if (!userId) return Promise.reject(new GatewayTypeError("IdUnresolvable"));
    return this.client.users.fetch(userId);
  }

  /**
   * Marks the entitlement as consumed. Only available for one-time purchase consumable SKUs.
   */
  public async consume(): Promise<void> {
    await this.client.application.entitlements.consume(this.id);
    this[kPatch]({ consumed: true });
  }

  /**
   * Whether this entitlement has the same data as another one. `false` for anything that is neither an entitlement nor
   * a raw one.
   *
   * @param other The entitlement, or raw entitlement, to compare with.
   */
  public equals(other: unknown): boolean {
    const entitlement =
      other instanceof Entitlement
        ? other
        : typeof other === "object" && other !== null && "sku_id" in other && "id" in other
          ? new Entitlement(other as APIEntitlement)
          : null;
    return entitlement !== null && isDeepEqual(this.toJSON(), entitlement.toJSON());
  }
}

Mixin(Entitlement, [StructureMixin]);

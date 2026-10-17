import { Collection } from "@discordjs/collection";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  EntitlementOwnerType,
  type RESTGetAPIEntitlementsQuery,
  type RESTPostAPIEntitlementJSONBody,
} from "discord-api-types/v10";
import { GatewayTypeError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { Entitlement } from "../structures/monetization/Entitlement.js";
import type { EntitlementResolvable, SKUResolvable, UserResolvable } from "../types.js";
import { resolveSKUId } from "../util/Util.js";
import { CachedManager, type FetchOptions } from "./CachedManager.js";

/**
 * The options to list the entitlements of the application with.
 *
 * @remarks
 * With both `before` and `after`, Discord only respects `before`.
 */
export interface EntitlementFetchOptions {
  /**
   * How many entitlements to fetch, up to 100.
   */
  limit?: number;
  /**
   * Only the entitlements of this guild.
   */
  guild?: Guild | string;
  /**
   * Only the entitlements of this user.
   */
  user?: UserResolvable;
  /**
   * Only the entitlements to these SKUs.
   */
  skus?: readonly SKUResolvable[];
  /**
   * Whether to leave out the entitlements that ended.
   */
  excludeEnded?: boolean;
  /**
   * Whether to leave out the entitlements that were deleted.
   */
  excludeDeleted?: boolean;
  /**
   * Whether to store the fetched entitlements in the cache.
   *
   * @default true
   */
  cache?: boolean;
  /**
   * Only the entitlements before this entitlement ID.
   */
  before?: string;
  /**
   * Only the entitlements after this entitlement ID.
   */
  after?: string;
}

/**
 * The options to create a test entitlement with. It is for a guild or for a user: exactly one of them.
 */
export interface EntitlementCreateOptions {
  /**
   * The SKU to grant.
   */
  sku: SKUResolvable;
  /**
   * The guild to grant it to.
   */
  guild?: Guild | string;
  /**
   * The user to grant it to.
   */
  user?: UserResolvable;
}

/**
 * Manages the entitlements of the application, reached through `client.application.entitlements`: the access users
 * and guilds were granted to its SKUs.
 *
 * @remarks
 * Entitlements are cached as `ENTITLEMENT_CREATE`, `ENTITLEMENT_UPDATE` and `ENTITLEMENT_DELETE` come in, and as they
 * are fetched.
 */
export class EntitlementManager extends CachedManager<
  "entitlements",
  Entitlement,
  [entitlementId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "entitlements");
  }

  protected createStructure(data: CacheEntityTypes["entitlements"]): Entitlement {
    return new Entitlement(data);
  }

  public keyOf(data: CacheEntityTypes["entitlements"]): string {
    return data.id;
  }

  public resolveKey(entitlementId: string): string {
    return entitlementId;
  }

  /**
   * Resolves an {@link EntitlementResolvable} to an entitlement ID.
   *
   * @param entitlement The entitlement, or its ID.
   * @returns The ID, or `null` if the value holds none.
   */
  public override resolveId(entitlement: EntitlementResolvable): string | null {
    return super.resolveId(entitlement as Entitlement | string);
  }

  /**
   * Gets an entitlement from the cache, fetching it from the API (and caching it) on a cache miss.
   *
   * @example
   * ```typescript
   * const entitlement = await client.application.entitlements.fetch(entitlementId);
   * ```
   *
   * @param entitlement The entitlement, or its ID.
   * @param options Whether to skip the cache, and whether to store the result.
   */
  public override fetch(
    entitlement: EntitlementResolvable,
    options?: FetchOptions,
  ): Promise<Entitlement>;
  /**
   * Lists the entitlements of the application from the API.
   *
   * @example
   * ```typescript
   * const active = await client.application.entitlements.fetch({ user, excludeEnded: true });
   * ```
   *
   * @param options What to list.
   */
  public override fetch(
    options?: EntitlementFetchOptions,
  ): Promise<Collection<string, Entitlement>>;
  public override async fetch(
    entitlementOrOptions?: EntitlementResolvable | EntitlementFetchOptions,
    fetchOptions?: FetchOptions,
  ): Promise<Entitlement | Collection<string, Entitlement>> {
    const id =
      entitlementOrOptions === undefined
        ? null
        : this.resolveId(entitlementOrOptions as EntitlementResolvable);
    if (id !== null) return super.fetch(id, fetchOptions ?? {});

    return this.fetchMany((entitlementOrOptions ?? {}) as EntitlementFetchOptions);
  }

  /**
   * Creates a test entitlement, which grants a user or a guild a SKU without a purchase.
   *
   * @remarks
   * The entitlement is not cached by this call: Discord sends its `ENTITLEMENT_CREATE` too, which does.
   *
   * @param options The SKU, and the guild or user to grant it to.
   * @throws {GatewayTypeError} `InvalidType` for a SKU, guild or user that does not resolve, and
   * `EntitlementCreateInvalidOwner` unless exactly one of the guild and user is given.
   */
  public async createTest({ sku, guild, user }: EntitlementCreateOptions): Promise<Entitlement> {
    const skuId = resolveSKUId(sku);
    if (!skuId) throw new GatewayTypeError("InvalidType", "sku", "SKUResolvable");

    if ((guild && user) || (!guild && !user)) {
      throw new GatewayTypeError("EntitlementCreateInvalidOwner");
    }

    const ownerId = guild
      ? this.client.guilds.resolveId(guild)
      : this.client.users.resolveId(user!);
    if (!ownerId) {
      throw guild
        ? new GatewayTypeError("InvalidType", "guild", "GuildResolvable")
        : new GatewayTypeError("InvalidType", "user", "UserResolvable");
    }

    const body: RESTPostAPIEntitlementJSONBody = {
      sku_id: skuId,
      owner_id: ownerId,
      owner_type: guild ? EntitlementOwnerType.Guild : EntitlementOwnerType.User,
    };
    const entitlement = await this.client.api.monetization.createTestEntitlement(
      this.client.application.id,
      body,
    );
    // The response has neither of the dates: a test entitlement does not start nor end.
    return this._add({ starts_at: null, ends_at: null, ...entitlement } as never, false);
  }

  /**
   * Deletes a test entitlement, and drops it from the cache.
   *
   * @param entitlement The entitlement, or its ID.
   * @throws {GatewayTypeError} `InvalidType` when the value does not resolve.
   */
  public async deleteTest(entitlement: EntitlementResolvable): Promise<void> {
    const id = this.requireId(entitlement);
    await this.client.api.monetization.deleteTestEntitlement(this.client.application.id, id);
    await this.cache.delete(this.resolveKey(id));
  }

  /**
   * Marks an entitlement as consumed. Only available for one-time purchase consumable SKUs.
   *
   * @param entitlement The entitlement, or its ID.
   * @throws {GatewayTypeError} `InvalidType` when the value does not resolve.
   */
  public async consume(entitlement: EntitlementResolvable): Promise<void> {
    const id = this.requireId(entitlement);
    await this.client.api.monetization.consumeEntitlement(this.client.application.id, id);
    await this._patchCached(this.resolveKey(id), { consumed: true });
  }

  protected async fetchRaw(entitlementId: string) {
    return this.client.api.monetization.getEntitlement(this.client.application.id, entitlementId);
  }

  private async fetchMany({
    limit,
    guild,
    user,
    skus,
    excludeEnded,
    excludeDeleted,
    cache = true,
    before,
    after,
  }: EntitlementFetchOptions): Promise<Collection<string, Entitlement>> {
    const query: RESTGetAPIEntitlementsQuery = {
      limit,
      guild_id: guild === undefined ? undefined : this.requireGuildId(guild),
      user_id: user === undefined ? undefined : this.requireUserId(user),
      sku_ids: skus?.map((sku) => this.requireSKUId(sku)).join(","),
      exclude_ended: excludeEnded,
      exclude_deleted: excludeDeleted,
      before,
      after,
    };
    const entitlements = await this.client.api.monetization.getEntitlements(
      this.client.application.id,
      query,
    );

    const built = await Promise.all(
      entitlements.map((entitlement) => this._add(entitlement, cache)),
    );
    return new Collection(built.map((entitlement) => [entitlement.id, entitlement]));
  }

  private requireId(entitlement: EntitlementResolvable): string {
    const id = this.resolveId(entitlement);
    if (id === null) {
      throw new GatewayTypeError("InvalidType", "entitlement", "EntitlementResolvable");
    }
    return id;
  }

  private requireGuildId(guild: Guild | string): string {
    const id = this.client.guilds.resolveId(guild);
    if (id === null) throw new GatewayTypeError("InvalidType", "guild", "GuildResolvable");
    return id;
  }

  private requireUserId(user: UserResolvable): string {
    const id = this.client.users.resolveId(user);
    if (id === null) throw new GatewayTypeError("InvalidType", "user", "UserResolvable");
    return id;
  }

  private requireSKUId(sku: SKUResolvable): string {
    const id = resolveSKUId(sku);
    if (id === null) throw new GatewayTypeError("InvalidElement", "array", "skus", sku);
    return id;
  }
}

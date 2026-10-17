import { Collection } from "@discordjs/collection";
import type { RESTGetAPISKUSubscriptionsQuery } from "discord-api-types/v10";
import { GatewayTypeError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import { Subscription } from "../structures/monetization/Subscription.js";
import { bindClient } from "../structures/Structure.js";
import type { SubscriptionResolvable, UserResolvable } from "../types.js";
import { BaseManager } from "./BaseManager.js";

/**
 * The options to list the subscriptions to a SKU with.
 *
 * @remarks
 * With both `before` and `after`, Discord only respects `before`.
 */
export interface SubscriptionFetchOptions {
  /**
   * How many subscriptions to fetch, up to 100.
   */
  limit?: number;
  /**
   * Only the subscriptions of this user.
   */
  user?: UserResolvable;
  /**
   * Only the subscriptions before this subscription ID.
   */
  before?: string;
  /**
   * Only the subscriptions after this subscription ID.
   */
  after?: string;
}

/**
 * Manages the subscriptions to one SKU, reached through `sku.subscriptions` and `client.application.subscriptions`.
 *
 * @remarks
 * Subscriptions are fetched from the API and never cached: nothing keeps a cached subscription up to date for the
 * bot, unlike entitlements.
 */
export class SubscriptionManager extends BaseManager {
  /**
   * The ID of the SKU the subscriptions are to.
   */
  public readonly skuId: string;

  public constructor(client: GatewayClient, skuId: string) {
    super(client);
    this.skuId = skuId;
  }

  /**
   * Resolves a {@link SubscriptionResolvable} to a subscription ID.
   *
   * @param subscription The subscription, or its ID.
   * @returns The ID, or `null` if the value holds none.
   */
  public resolveId(subscription: SubscriptionResolvable): string | null {
    if (typeof subscription === "string") return subscription;
    const id = (subscription as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  }

  /**
   * Fetches a subscription to the SKU.
   *
   * @param subscription The subscription, or its ID.
   */
  public fetch(subscription: SubscriptionResolvable): Promise<Subscription>;
  /**
   * Lists the subscriptions to the SKU.
   *
   * @param options What to list.
   */
  public fetch(options?: SubscriptionFetchOptions): Promise<Collection<string, Subscription>>;
  public async fetch(
    subscriptionOrOptions: SubscriptionResolvable | SubscriptionFetchOptions = {},
  ): Promise<Subscription | Collection<string, Subscription>> {
    const subscriptionId = this.resolveId(subscriptionOrOptions as SubscriptionResolvable);
    if (subscriptionId !== null) {
      const subscription = await this.client.api.monetization.getSKUSubscription(
        this.skuId,
        subscriptionId,
      );
      return this.build(subscription);
    }

    const { limit, user, before, after } = subscriptionOrOptions as SubscriptionFetchOptions;
    const userId = user === undefined ? undefined : this.client.users.resolveId(user);
    if (userId === null) throw new GatewayTypeError("InvalidType", "user", "UserResolvable");

    const query: RESTGetAPISKUSubscriptionsQuery = { limit, user_id: userId, before, after };
    const subscriptions = await this.client.api.monetization.getSKUSubscriptions(this.skuId, query);
    return new Collection(
      subscriptions.map((subscription) => {
        const built = this.build(subscription);
        return [built.id, built];
      }),
    );
  }

  private build(data: ConstructorParameters<typeof Subscription>[0]): Subscription {
    return bindClient(new Subscription(data), this.client);
  }
}

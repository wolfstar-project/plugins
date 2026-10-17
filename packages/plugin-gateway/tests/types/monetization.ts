// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the monetization
// managers return the types of discord.js's `EntitlementManager` and `SubscriptionManager`.
import type { Collection } from "@discordjs/collection";
import type {
  ClientApplication,
  Entitlement,
  EntitlementManager,
  GatewayClient,
  Guild,
  SKU,
  SKUFlagsBitField,
  Subscription,
  SubscriptionManager,
  User,
} from "../../src/index.js";

declare const client: GatewayClient;
declare const application: ClientApplication;
declare const entitlement: Entitlement;
declare const sku: SKU;
declare const guild: Guild;
declare const user: User;

export const entitlements: EntitlementManager = client.application.entitlements;

// One entitlement by ID or structure, with the cache options; many with the filters.
export const one: Promise<Entitlement> = entitlements.fetch("1");
export const oneForced: Promise<Entitlement> = entitlements.fetch(entitlement, { force: true });
export const many: Promise<Collection<string, Entitlement>> = entitlements.fetch();
export const filtered: Promise<Collection<string, Entitlement>> = entitlements.fetch({
  guild,
  user,
  skus: [sku, "1"],
  excludeEnded: true,
  excludeDeleted: true,
  limit: 10,
  before: "1",
  cache: false,
});
export const refreshed: Promise<Entitlement> = entitlements.refresh("1");

export const created: Promise<Entitlement> = entitlements.createTest({ sku, user });
export const createdForGuild: Promise<Entitlement> = entitlements.createTest({
  sku: "1",
  guild: "2",
});
export const deleted: Promise<void> = entitlements.deleteTest(entitlement);
export const consumed: Promise<void> = entitlements.consume("1");
export const consumedBy: Promise<void> = entitlement.consume();

export const cached: Promise<Entitlement | undefined> | Entitlement | undefined =
  entitlements.cache.get("1");

// Subscriptions: one by ID, or the list of a SKU.
export const subscriptions: SubscriptionManager = sku.subscriptions;
export const subscription: Promise<Subscription> = subscriptions.fetch("1");
export const subscriptionList: Promise<Collection<string, Subscription>> = subscriptions.fetch({
  user,
  limit: 10,
  after: "1",
});
export const allSubscriptions: Promise<Collection<string, Subscription>> = subscriptions.fetch();
export const ofApplication: SubscriptionManager = application.subscriptions(sku);

export const skus: Promise<Collection<string, SKU>> = application.fetchSKUs();
export const flags: Readonly<SKUFlagsBitField> = sku.flags;

export const startsAt: Date | null = entitlement.startsAt;
export const entitlementGuild: Guild | null = entitlement.guild;

// @ts-expect-error a test entitlement needs a guild or a user, and a SKU
void entitlements.createTest({ user });
// @ts-expect-error a subscription is fetched by ID, not by a number
void subscriptions.fetch(1);
// @ts-expect-error the entitlements of the application are read-only
client.application.entitlements = entitlements;

import { WebSocketShardEvents } from "@discordjs/ws";
import {
  EntitlementOwnerType,
  EntitlementType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  SKUFlags,
  SKUType,
  SubscriptionStatus,
  type APIEntitlement,
  type APISKU,
  type APISubscription,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { Collection } from "@discordjs/collection";
import { createRedisCache } from "@wolfstar/plugin-cache";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";
import {
  bindClient,
  ClientApplication,
  Entitlement,
  EntitlementManager,
  GatewayClient,
  SKU,
  SKUFlagsBitField,
  Subscription,
  SubscriptionManager,
  type GatewayEventName,
} from "../src/index.js";
import { cacheModes, type CacheMode } from "./fixtures/cacheModes.js";

const clientId = "266624760782258186";
const guildId = "100000000000000010";
const userId = "600000000000000600";
const skuId = "510000000000000051";
const entitlementId = "500000000000000050";
const subscriptionId = "520000000000000052";

const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };

function entitlementData(extra: Partial<APIEntitlement> = {}): APIEntitlement {
  return {
    id: entitlementId,
    sku_id: skuId,
    application_id: clientId,
    user_id: userId,
    type: EntitlementType.ApplicationSubscription,
    deleted: false,
    starts_at: "2026-01-01T00:00:00.000000+00:00",
    ends_at: "2999-01-01T00:00:00.000000+00:00",
    ...extra,
  };
}

function skuData(extra: Partial<APISKU> = {}): APISKU {
  return {
    id: skuId,
    type: SKUType.Subscription,
    application_id: clientId,
    name: "Howl+",
    slug: "howl-plus",
    flags: SKUFlags.Available | SKUFlags.UserSubscription,
    ...extra,
  };
}

function subscriptionData(extra: Partial<APISubscription> = {}): APISubscription {
  return {
    id: subscriptionId,
    user_id: userId,
    sku_ids: [skuId],
    entitlement_ids: [entitlementId],
    renewal_sku_ids: null,
    current_period_start: "2026-01-01T00:00:00.000000+00:00",
    current_period_end: "2026-02-01T00:00:00.000000+00:00",
    status: SubscriptionStatus.Active,
    canceled_at: null,
    ...extra,
  };
}

function createClient(options: Partial<ConstructorParameters<typeof GatewayClient>[0]> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId,
    intents: 0,
    ...options,
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

function record(client: GatewayClient, ...events: GatewayEventName[]) {
  const calls: [string, ...unknown[]][] = [];
  for (const event of events) {
    client.on(event, ((...args: unknown[]) => void calls.push([event, ...args])) as never);
  }
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Entitlement", () => {
  test("GIVEN a user entitlement THEN it exposes the raw fields and the dates", () => {
    const entitlement = new Entitlement(entitlementData());

    expect(entitlement.id).toBe(entitlementId);
    expect(entitlement.skuId).toBe(skuId);
    expect(entitlement.userId).toBe(userId);
    expect(entitlement.guildId).toBeUndefined();
    expect(entitlement.startsTimestamp).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(entitlement.startsAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(entitlement.endsAt).toEqual(new Date("2999-01-01T00:00:00.000Z"));
    expect(entitlement.createdAt).toBeInstanceOf(Date);
    expect(entitlement.isUserSubscription()).toBe(true);
    expect(entitlement.isGuildSubscription()).toBe(false);
    expect(entitlement.isTest()).toBe(false);
    expect(entitlement.isActive()).toBe(true);
  });

  test("GIVEN a guild test entitlement THEN it is a guild subscription, a test, and active until deleted", () => {
    const entitlement = new Entitlement(
      entitlementData({
        user_id: undefined,
        guild_id: guildId,
        starts_at: null,
        ends_at: null,
        type: EntitlementType.TestModePurchase,
      }),
    );

    expect(entitlement.isGuildSubscription()).toBe(true);
    expect(entitlement.isUserSubscription()).toBe(false);
    expect(entitlement.isTest()).toBe(true);
    expect(entitlement.startsAt).toBeNull();
    expect(entitlement.endsAt).toBeNull();
    expect(entitlement.isActive()).toBe(true);
    expect(new Entitlement({ ...entitlement.toJSON(), deleted: true }).isActive()).toBe(false);
  });

  test("GIVEN an end date in the past THEN the entitlement is not active", () => {
    const ended = new Entitlement(entitlementData({ ends_at: "2000-01-01T00:00:00.000000+00:00" }));
    expect(ended.isActive()).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-06-01T00:00:00.000Z"));
    expect(
      new Entitlement(entitlementData({ ends_at: "2026-07-01T00:00:00.000000+00:00" })).isActive(),
    ).toBe(true);
    vi.setSystemTime(Date.parse("2026-08-01T00:00:00.000Z"));
    expect(
      new Entitlement(entitlementData({ ends_at: "2026-07-01T00:00:00.000000+00:00" })).isActive(),
    ).toBe(false);
  });

  test("GIVEN a cached guild and user THEN the relations read them from the cache", async () => {
    const client = createClient();
    await client.guilds._add({ id: guildId, name: "Pack" } as never);
    await client.users._add(user);
    const entitlement = await client.application.entitlements._add(
      entitlementData({ guild_id: guildId }),
    );

    expect(entitlement.guild?.id).toBe(guildId);
    expect(entitlement.user?.id).toBe(userId);
    expect(new Entitlement(entitlementData()).guild).toBeNull();
  });

  test("GIVEN equals THEN it compares the data, and is false for foreign values", () => {
    const entitlement = new Entitlement(entitlementData());

    expect(entitlement.equals(new Entitlement(entitlementData()))).toBe(true);
    expect(entitlement.equals(entitlementData())).toBe(true);
    expect(entitlement.equals(entitlementData({ deleted: true }))).toBe(false);
    expect(entitlement.equals(new Entitlement(entitlementData({ ends_at: null })))).toBe(false);
    expect(entitlement.equals(null)).toBe(false);
    expect(entitlement.equals("500000000000000050")).toBe(false);
    expect(entitlement.equals({ id: entitlementId })).toBe(false);
    expect(entitlement.equals(new Subscription(subscriptionData()))).toBe(false);
  });

  test("GIVEN fetchUser THEN it fetches the user, and rejects without one", async () => {
    const client = createClient();
    const getUser = vi.spyOn(client.api.users, "get").mockResolvedValue(user as never);
    const entitlement = await client.application.entitlements._add(entitlementData());

    expect((await entitlement.fetchUser()).id).toBe(userId);
    expect(getUser).toHaveBeenCalledWith(userId);

    const guildOnly = new Entitlement(entitlementData({ user_id: undefined, guild_id: guildId }));
    await expect(guildOnly.fetchUser()).rejects.toMatchObject({ code: "IdUnresolvable" });
  });
});

describe("SKU", () => {
  test("GIVEN a SKU THEN it has the fields and the flags of discord.js", () => {
    const sku = new SKU(skuData());

    expect(sku.id).toBe(skuId);
    expect(sku.name).toBe("Howl+");
    expect(sku.slug).toBe("howl-plus");
    expect(sku.type).toBe(SKUType.Subscription);
    expect(sku.applicationId).toBe(clientId);
    expect(sku.flags).toBeInstanceOf(SKUFlagsBitField);
    expect(sku.flags.has("Available")).toBe(true);
    expect(sku.flags.has("GuildSubscription")).toBe(false);
    expect(sku.createdAt).toEqual(new Date(sku.createdTimestamp));
    expect(sku.toString()).toBe("Howl+");
  });

  test("GIVEN equals THEN it is false for foreign values", () => {
    const sku = new SKU(skuData());

    expect(sku.equals(new SKU(skuData()))).toBe(true);
    expect(sku.equals(skuData())).toBe(true);
    expect(sku.equals(skuData({ name: "Other" }))).toBe(false);
    expect(sku.equals(undefined)).toBe(false);
    expect(sku.equals({ id: skuId })).toBe(false);
    expect(sku.equals(new Entitlement(entitlementData()))).toBe(false);
  });
});

describe("Subscription", () => {
  test("GIVEN a subscription THEN it exposes its fields and dates", () => {
    const subscription = new Subscription(
      subscriptionData({ canceled_at: "2026-01-15T00:00:00.000000+00:00", country: "IT" }),
    );

    expect(subscription.id).toBe(subscriptionId);
    expect(subscription.userId).toBe(userId);
    expect(subscription.skuIds).toEqual([skuId]);
    expect(subscription.entitlementIds).toEqual([entitlementId]);
    expect(subscription.renewalSkuIds).toBeNull();
    expect(subscription.status).toBe(SubscriptionStatus.Active);
    expect(subscription.country).toBe("IT");
    expect(subscription.currentPeriodStartAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(subscription.currentPeriodEndAt).toEqual(new Date("2026-02-01T00:00:00.000Z"));
    expect(subscription.canceledAt).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    expect(subscription.createdAt).toBeInstanceOf(Date);
    expect(new Subscription(subscriptionData()).canceledAt).toBeNull();
  });

  test("GIVEN equals THEN it is false for foreign values", () => {
    const subscription = new Subscription(subscriptionData());

    expect(subscription.equals(new Subscription(subscriptionData()))).toBe(true);
    expect(subscription.equals(subscriptionData())).toBe(true);
    expect(subscription.equals(subscriptionData({ status: SubscriptionStatus.Ending }))).toBe(
      false,
    );
    expect(subscription.equals(null)).toBe(false);
    expect(subscription.equals({ id: subscriptionId })).toBe(false);
    expect(subscription.equals(new SKU(skuData()))).toBe(false);
  });
});

describe("client.application.entitlements", () => {
  test("GIVEN the application THEN it holds one entitlement manager", () => {
    const client = createClient();

    expect(client.application).toBeInstanceOf(ClientApplication);
    expect(client.application.entitlements).toBeInstanceOf(EntitlementManager);
    expect(client.application.entitlements).toBe(client.application.entitlements);
    expect(client.application.entitlements.client).toBe(client);
  });

  test("GIVEN an ID THEN fetch reads the cache first, and force or a miss calls the API", async () => {
    const client = createClient();
    const getEntitlement = vi
      .spyOn(client.api.monetization, "getEntitlement")
      .mockResolvedValue(entitlementData());
    const { entitlements } = client.application;

    const fetched = await entitlements.fetch(entitlementId);
    expect(getEntitlement).toHaveBeenCalledWith(clientId, entitlementId);
    expect(fetched).toBeInstanceOf(Entitlement);
    expect(fetched.client).toBe(client);
    expect(await entitlements.cache.get(entitlementId)).toBe(fetched);

    expect(await entitlements.fetch(entitlementId)).toBe(fetched);
    expect(await entitlements.fetch(fetched)).toBe(fetched);
    expect(getEntitlement).toHaveBeenCalledTimes(1);

    await entitlements.fetch(entitlementId, { force: true });
    await entitlements.refresh(entitlementId);
    expect(getEntitlement).toHaveBeenCalledTimes(3);
  });

  test("GIVEN cache false THEN a fetched entitlement is not stored", async () => {
    const client = createClient();
    vi.spyOn(client.api.monetization, "getEntitlement").mockResolvedValue(entitlementData());
    const { entitlements } = client.application;

    const fetched = await entitlements.fetch(entitlementId, { cache: false });

    expect(fetched.id).toBe(entitlementId);
    expect(await entitlements.cache.get(entitlementId)).toBeUndefined();
  });

  test("GIVEN no options THEN fetch lists the entitlements as a Collection, and caches them", async () => {
    const client = createClient();
    const other = entitlementData({ id: "500000000000000051" });
    const getEntitlements = vi
      .spyOn(client.api.monetization, "getEntitlements")
      .mockResolvedValue([entitlementData(), other]);
    const { entitlements } = client.application;

    const listed = await entitlements.fetch();

    expect(getEntitlements).toHaveBeenCalledWith(clientId, {
      limit: undefined,
      guild_id: undefined,
      user_id: undefined,
      sku_ids: undefined,
      exclude_ended: undefined,
      exclude_deleted: undefined,
      before: undefined,
      after: undefined,
    });
    expect(listed).toBeInstanceOf(Collection);
    expect([...listed.keys()]).toEqual([entitlementId, "500000000000000051"]);
    expect(listed.get(entitlementId)).toBeInstanceOf(Entitlement);
    expect(await entitlements.cache.get("500000000000000051")).toBe(
      listed.get("500000000000000051"),
    );
  });

  test("GIVEN filters THEN fetch sends them as the query, resolving the guild, user, and SKUs", async () => {
    const client = createClient();
    const getEntitlements = vi
      .spyOn(client.api.monetization, "getEntitlements")
      .mockResolvedValue([entitlementData()]);
    const { entitlements } = client.application;
    const guild = await client.guilds._add({ id: guildId, name: "Pack" } as never);
    const sku = new SKU(skuData());

    const listed = await entitlements.fetch({
      limit: 50,
      guild,
      user: userId,
      skus: [sku, "530000000000000053", { ...skuData(), id: "540000000000000054" }],
      excludeEnded: true,
      excludeDeleted: false,
      before: "9",
      after: "1",
      cache: false,
    });

    expect(getEntitlements).toHaveBeenCalledWith(clientId, {
      limit: 50,
      guild_id: guildId,
      user_id: userId,
      sku_ids: `${skuId},530000000000000053,540000000000000054`,
      exclude_ended: true,
      exclude_deleted: false,
      before: "9",
      after: "1",
    });
    expect(listed.size).toBe(1);
    expect(await entitlements.cache.get(entitlementId)).toBeUndefined();
  });

  test("GIVEN an unresolvable filter THEN fetch rejects instead of listing everything", async () => {
    const client = createClient();
    const getEntitlements = vi.spyOn(client.api.monetization, "getEntitlements");
    const { entitlements } = client.application;

    await expect(entitlements.fetch({ user: {} as never })).rejects.toMatchObject({
      code: "InvalidType",
    });
    await expect(entitlements.fetch({ guild: {} as never })).rejects.toMatchObject({
      code: "InvalidType",
    });
    await expect(entitlements.fetch({ skus: [{} as never] })).rejects.toMatchObject({
      code: "InvalidElement",
    });
    expect(getEntitlements).not.toHaveBeenCalled();
  });

  test("GIVEN createTest THEN it posts the owner of the SKU, and builds an uncached entitlement", async () => {
    const client = createClient();
    const createTestEntitlement = vi
      .spyOn(client.api.monetization, "createTestEntitlement")
      .mockResolvedValue({
        id: entitlementId,
        sku_id: skuId,
        application_id: clientId,
        user_id: userId,
        type: EntitlementType.TestModePurchase,
        deleted: false,
      });
    const { entitlements } = client.application;

    const byUser = await entitlements.createTest({ sku: skuId, user: userId });
    expect(createTestEntitlement).toHaveBeenLastCalledWith(clientId, {
      sku_id: skuId,
      owner_id: userId,
      owner_type: EntitlementOwnerType.User,
    });
    expect(byUser).toBeInstanceOf(Entitlement);
    expect(byUser.isTest()).toBe(true);
    expect(await entitlements.cache.get(entitlementId)).toBeUndefined();

    await entitlements.createTest({ sku: new SKU(skuData()), guild: guildId });
    expect(createTestEntitlement).toHaveBeenLastCalledWith(clientId, {
      sku_id: skuId,
      owner_id: guildId,
      owner_type: EntitlementOwnerType.Guild,
    });
  });

  test("GIVEN a bad createTest THEN it rejects without a request", async () => {
    const client = createClient();
    const createTestEntitlement = vi.spyOn(client.api.monetization, "createTestEntitlement");
    const { entitlements } = client.application;

    await expect(entitlements.createTest({ sku: {} as never, user: userId })).rejects.toMatchObject(
      { code: "InvalidType" },
    );
    await expect(entitlements.createTest({ sku: skuId })).rejects.toMatchObject({
      code: "EntitlementCreateInvalidOwner",
    });
    await expect(
      entitlements.createTest({ sku: skuId, user: userId, guild: guildId }),
    ).rejects.toMatchObject({ code: "EntitlementCreateInvalidOwner" });
    await expect(entitlements.createTest({ sku: skuId, user: {} as never })).rejects.toMatchObject({
      code: "InvalidType",
    });
    await expect(entitlements.createTest({ sku: skuId, guild: {} as never })).rejects.toMatchObject(
      { code: "InvalidType" },
    );
    expect(createTestEntitlement).not.toHaveBeenCalled();
  });

  test("GIVEN deleteTest THEN it deletes the entitlement and drops it from the cache", async () => {
    const client = createClient();
    const deleteTestEntitlement = vi
      .spyOn(client.api.monetization, "deleteTestEntitlement")
      .mockResolvedValue(undefined);
    const { entitlements } = client.application;
    const cached = await entitlements._add(entitlementData());

    await entitlements.deleteTest(cached);

    expect(deleteTestEntitlement).toHaveBeenCalledWith(clientId, entitlementId);
    expect(await entitlements.cache.get(entitlementId)).toBeUndefined();
    await expect(entitlements.deleteTest({} as never)).rejects.toMatchObject({
      code: "InvalidType",
    });
  });

  test("GIVEN consume THEN it consumes the entitlement and marks the cached one", async () => {
    const client = createClient();
    const consumeEntitlement = vi
      .spyOn(client.api.monetization, "consumeEntitlement")
      .mockResolvedValue(undefined);
    const { entitlements } = client.application;
    const cached = await entitlements._add(entitlementData());
    expect(cached.consumed).toBeUndefined();

    await entitlements.consume(entitlementId);

    expect(consumeEntitlement).toHaveBeenCalledWith(clientId, entitlementId);
    expect((await entitlements.cache.get(entitlementId))?.consumed).toBe(true);
    await expect(entitlements.consume({} as never)).rejects.toMatchObject({ code: "InvalidType" });
  });

  test("GIVEN entitlement.consume THEN it consumes through the manager and patches itself", async () => {
    const client = createClient();
    const consumeEntitlement = vi
      .spyOn(client.api.monetization, "consumeEntitlement")
      .mockResolvedValue(undefined);
    const detached = await client.application.entitlements._add(entitlementData(), false);

    await detached.consume();

    expect(consumeEntitlement).toHaveBeenCalledWith(clientId, entitlementId);
    expect(detached.consumed).toBe(true);
  });
});

describe.each(Object.keys(cacheModes) as CacheMode[])(
  "entitlement events with %s cache",
  (mode) => {
    const events = ["entitlementCreate", "entitlementUpdate", "entitlementDelete"] as const;

    test("GIVEN the dispatches THEN the cache follows them and the events carry the structures", async () => {
      const client = createClient(cacheModes[mode]());
      const calls = record(client, ...events);
      const { entitlements } = client.application;

      await dispatch(client, GatewayDispatchEvents.EntitlementCreate, entitlementData());
      await dispatch(
        client,
        GatewayDispatchEvents.EntitlementUpdate,
        entitlementData({ ends_at: "2999-06-01T00:00:00.000000+00:00" }),
      );
      const cachedAfterUpdate = await entitlements.cache.get(entitlementId);
      await dispatch(client, GatewayDispatchEvents.EntitlementDelete, entitlementData());

      expect(calls.map(([event]) => event)).toEqual([
        "entitlementCreate",
        "entitlementUpdate",
        "entitlementDelete",
      ]);
      const [[, created], [, old, updated], [, deleted]] = calls as [
        [string, Entitlement],
        [string, Entitlement | null, Entitlement],
        [string, Entitlement],
      ];
      expect(created).toBeInstanceOf(Entitlement);
      expect(created.id).toBe(entitlementId);
      // Without a cache there is nothing to compare an update with.
      if (mode === "none") {
        expect(old).toBeNull();
        expect(cachedAfterUpdate).toBeUndefined();
      } else if (mode === "partial") {
        // The partial cache holds users and guilds only.
        expect(old).toBeNull();
        expect(cachedAfterUpdate).toBeUndefined();
      } else {
        expect(old?.endsAt).toEqual(new Date("2999-01-01T00:00:00.000Z"));
        expect(cachedAfterUpdate?.endsAt).toEqual(new Date("2999-06-01T00:00:00.000Z"));
      }
      expect(updated.endsAt).toEqual(new Date("2999-06-01T00:00:00.000Z"));
      expect(deleted.id).toBe(entitlementId);
      expect(await entitlements.cache.get(entitlementId)).toBeUndefined();
    });
  },
);

describe("entitlements in an asynchronous store", () => {
  test("GIVEN a Redis cache THEN dispatches and fetches go through the shared store", async () => {
    const redis = new FakeRedis();
    const client = createClient({ cache: createRedisCache({ redis }) });
    const peer = createClient({ cache: createRedisCache({ redis }) });
    const calls = record(client, "entitlementUpdate");

    await dispatch(client, GatewayDispatchEvents.EntitlementCreate, entitlementData());
    await dispatch(
      client,
      GatewayDispatchEvents.EntitlementUpdate,
      entitlementData({ deleted: true }),
    );

    // Another process sharing the store reads what the first one cached, without calling the API.
    const getEntitlement = vi.spyOn(peer.api.monetization, "getEntitlement");
    const shared = await peer.application.entitlements.fetch(entitlementId);
    expect(getEntitlement).not.toHaveBeenCalled();
    expect(shared.deleted).toBe(true);
    expect(shared.startsAt).toEqual(new Date("2026-01-01T00:00:00.000Z"));

    const [[, old, updated]] = calls as [[string, Entitlement, Entitlement]];
    expect(old.deleted).toBe(false);
    expect(updated.deleted).toBe(true);
  });
});

describe("SubscriptionManager", () => {
  test("GIVEN a SKU THEN subscriptions is a manager of that SKU, built on each access", () => {
    const client = createClient();
    const sku = bindClient(new SKU(skuData()), client);

    expect(sku.subscriptions).toBeInstanceOf(SubscriptionManager);
    expect(sku.subscriptions.skuId).toBe(skuId);
    expect(sku.subscriptions.client).toBe(client);
  });

  test("GIVEN an ID or a subscription THEN fetch gets that subscription of the SKU", async () => {
    const client = createClient();
    const getSKUSubscription = vi
      .spyOn(client.api.monetization, "getSKUSubscription")
      .mockResolvedValue(subscriptionData());
    const subscriptions = client.application.subscriptions(skuId);

    const fetched = await subscriptions.fetch(subscriptionId);
    expect(getSKUSubscription).toHaveBeenLastCalledWith(skuId, subscriptionId);
    expect(fetched).toBeInstanceOf(Subscription);
    expect(fetched.client).toBe(client);

    await subscriptions.fetch(fetched);
    await subscriptions.fetch(subscriptionData());
    expect(getSKUSubscription).toHaveBeenCalledTimes(3);
  });

  test("GIVEN options THEN fetch lists the subscriptions of the SKU as a Collection, without caching", async () => {
    const client = createClient();
    const getSKUSubscriptions = vi
      .spyOn(client.api.monetization, "getSKUSubscriptions")
      .mockResolvedValue([subscriptionData(), subscriptionData({ id: "520000000000000053" })]);
    const subscriptions = client.application.subscriptions(new SKU(skuData()));

    const listed = await subscriptions.fetch({ user: userId, limit: 10, before: "9", after: "1" });

    expect(getSKUSubscriptions).toHaveBeenLastCalledWith(skuId, {
      limit: 10,
      user_id: userId,
      before: "9",
      after: "1",
    });
    expect(listed).toBeInstanceOf(Collection);
    expect([...listed.keys()]).toEqual([subscriptionId, "520000000000000053"]);

    await subscriptions.fetch();
    expect(getSKUSubscriptions).toHaveBeenLastCalledWith(skuId, {
      limit: undefined,
      user_id: undefined,
      before: undefined,
      after: undefined,
    });
    expect("cache" in subscriptions).toBe(false);
  });

  test("GIVEN an unresolvable user or SKU THEN it rejects without a request", async () => {
    const client = createClient();
    const getSKUSubscriptions = vi.spyOn(client.api.monetization, "getSKUSubscriptions");

    await expect(
      client.application.subscriptions(skuId).fetch({ user: {} as never }),
    ).rejects.toMatchObject({ code: "InvalidType" });
    expect(() => client.application.subscriptions({} as never)).toThrow(
      expect.objectContaining({ code: "InvalidType" }),
    );
    expect(getSKUSubscriptions).not.toHaveBeenCalled();
  });
});

describe("client.application.fetchSKUs", () => {
  test("GIVEN the SKUs of the application THEN they are SKUs bound to the client, by ID", async () => {
    const client = createClient();
    const getSKUs = vi
      .spyOn(client.api.monetization, "getSKUs")
      .mockResolvedValue([skuData(), skuData({ id: "510000000000000052", name: "Howl++" })]);

    const skus = await client.application.fetchSKUs();

    expect(getSKUs).toHaveBeenCalledWith(clientId);
    expect(skus).toBeInstanceOf(Collection);
    expect([...skus.keys()]).toEqual([skuId, "510000000000000052"]);
    const sku = skus.get(skuId)!;
    expect(sku).toBeInstanceOf(SKU);
    expect(sku.client).toBe(client);
    expect(sku.subscriptions.client).toBe(client);
    expect(sku.subscriptions.skuId).toBe(skuId);
  });
});

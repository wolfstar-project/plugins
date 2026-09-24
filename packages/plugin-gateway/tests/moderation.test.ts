import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { banKey, createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  AuditLogEvent,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  Routes,
  type APIAutoModerationRule,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AutoModerationActionExecution,
  GatewayClient,
  GuildAuditLogsEntry,
  GuildBan,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "100000000000000010";
const userId = "600000000000000600";
const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

function rule(extra: Partial<APIAutoModerationRule> = {}): APIAutoModerationRule {
  return {
    id: "900000000000000090",
    guild_id: guildId,
    name: "No howling",
    creator_id: userId,
    event_type: AutoModerationRuleEventType.MessageSend,
    trigger_type: AutoModerationRuleTriggerType.Keyword,
    trigger_metadata: { keyword_filter: ["awoo"], allow_list: ["wolf"] },
    actions: [{ type: AutoModerationActionType.BlockMessage }],
    enabled: true,
    exempt_roles: [],
    exempt_channels: [],
    ...extra,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bans", () => {
  test("GIVEN list THEN the bans are cached with their reason, and remove drops them", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue([{ user, reason: "spam" }]);
    const remove = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const bans = client.guilds.bans(guildId);

    const [ban] = await bans.list({ limit: 10 });

    expect(ban).toBeInstanceOf(GuildBan);
    expect(ban!.reason).toBe("spam");
    expect(ban!.user.username).toBe("wolf");
    expect((await bans.get(userId))?.reason).toBe("spam");

    await ban!.remove("appeal");

    expect(remove).toHaveBeenCalledWith(Routes.guildBan(guildId, userId), { reason: "appeal" });
    expect(await client.cache!.bans.get(banKey(guildId, userId))).toBeUndefined();
  });

  test("GIVEN GUILD_BAN_ADD and GUILD_BAN_REMOVE THEN the ban events are emitted", async () => {
    const client = createClient();
    const added = record(client, "guildBanAdd");
    const removed = record(client, "guildBanRemove");

    await dispatch(client, GatewayDispatchEvents.GuildBanAdd, { guild_id: guildId, user });
    await dispatch(client, GatewayDispatchEvents.GuildBanRemove, { guild_id: guildId, user });

    expect(added[0]![0].user.id).toBe(userId);
    expect(added[0]![0].reason).toBeNull();
    expect(removed[0]![0].user.id).toBe(userId);
    expect(await client.cache!.bans.get(banKey(guildId, userId))).toBeUndefined();
  });
});

describe("audit logs", () => {
  const entry = {
    id: "800000000000000080",
    action_type: AuditLogEvent.MemberBanAdd,
    user_id: userId,
    target_id: "7",
    reason: "spam",
  };

  test("GIVEN fetchAuditLogs THEN the entries resolve their executor", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue({
      audit_log_entries: [entry, { ...entry, id: "2", action_type: AuditLogEvent.MemberKick }],
      users: [user],
      webhooks: [],
      auto_moderation_rules: [rule()],
      threads: [],
      integrations: [],
      application_commands: [],
      guild_scheduled_events: [],
    });

    const logs = await client.guilds.fetchAuditLogs(guildId, {
      user: userId,
      type: AuditLogEvent.MemberBanAdd,
      limit: 2,
    });

    const [, options] = get.mock.calls[0]!;
    expect((options as { query: URLSearchParams }).query.toString()).toBe(
      `user_id=${userId}&action_type=${AuditLogEvent.MemberBanAdd}&limit=2`,
    );
    expect(logs.entries[0]).toBeInstanceOf(GuildAuditLogsEntry);
    expect(logs.entries[0]!.executor?.username).toBe("wolf");
    expect(logs.entries.map((value) => value.actionType)).toEqual(["Create", "Delete"]);
    expect(logs.autoModerationRules[0]!.name).toBe("No howling");
    expect(await client.cache!.users.get(userId)).toBeDefined();
  });

  test("GIVEN GUILD_AUDIT_LOG_ENTRY_CREATE THEN the entry is emitted", async () => {
    const client = createClient();
    await client.cache!.users.set(userId, user);
    const calls = record(client, "guildAuditLogEntryCreate");

    await dispatch(client, GatewayDispatchEvents.GuildAuditLogEntryCreate, {
      ...entry,
      guild_id: guildId,
    });

    const [[emitted]] = calls;
    expect(emitted.reason).toBe("spam");
    expect(emitted.executor?.id).toBe(userId);
  });
});

describe("auto moderation", () => {
  test("GIVEN create THEN the body is converted and the rule cached", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(rule());
    const rules = client.guilds.autoModerationRules(guildId);

    await rules.create({
      name: "No howling",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keyword_filter: ["awoo"] },
      actions: [{ type: AutoModerationActionType.BlockMessage }],
      exemptRoles: ["5"],
    });

    expect(post).toHaveBeenCalledWith(Routes.guildAutoModerationRules(guildId), {
      body: {
        name: "No howling",
        event_type: AutoModerationRuleEventType.MessageSend,
        trigger_type: AutoModerationRuleTriggerType.Keyword,
        trigger_metadata: { keyword_filter: ["awoo"] },
        actions: [{ type: AutoModerationActionType.BlockMessage }],
        exempt_roles: ["5"],
      },
      reason: undefined,
    });
    expect(await rules.get(rule().id)).toBeDefined();
  });

  test("GIVEN setKeywordFilter THEN the rest of the trigger is kept", async () => {
    const client = createClient();
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(
        rule({ trigger_metadata: { keyword_filter: ["howl"], allow_list: ["wolf"] } }),
      );
    const cached = await client.guilds.autoModerationRules(guildId).hydrate(rule());

    await cached.setKeywordFilter(["howl"]);

    expect(patch).toHaveBeenCalledWith(Routes.guildAutoModerationRule(guildId, rule().id), {
      body: { trigger_metadata: { keyword_filter: ["howl"], allow_list: ["wolf"] } },
      reason: undefined,
    });
    expect(cached.triggerMetadata.keyword_filter).toEqual(["howl"]);
  });

  test("GIVEN rule and execution dispatches THEN their events are emitted", async () => {
    const client = createClient();
    const updated = record(client, "autoModerationRuleUpdate");
    const executed = record(client, "autoModerationActionExecution");

    await dispatch(client, GatewayDispatchEvents.AutoModerationRuleCreate, rule());
    await dispatch(
      client,
      GatewayDispatchEvents.AutoModerationRuleUpdate,
      rule({ enabled: false }),
    );
    await dispatch(client, GatewayDispatchEvents.AutoModerationActionExecution, {
      guild_id: guildId,
      action: { type: AutoModerationActionType.BlockMessage },
      rule_id: rule().id,
      rule_trigger_type: AutoModerationRuleTriggerType.Keyword,
      user_id: userId,
      content: "awoo",
      matched_keyword: "awoo",
      matched_content: "awoo",
    });

    const [[previous, current]] = updated;
    expect(previous?.enabled).toBe(true);
    expect(current.enabled).toBe(false);
    expect(executed[0]![0]).toBeInstanceOf(AutoModerationActionExecution);
    expect(executed[0]![0].matchedKeyword).toBe("awoo");
  });
});

import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import {
  autoModerationRuleKey,
  createInMemoryCache,
  emojiKey,
  integrationKey,
  inviteKey,
  memberKey,
  presenceKey,
  roleKey,
  scheduledEventKey,
  soundboardSoundKey,
  stageInstanceKey,
  voiceStateKey,
} from "@wolfstar/plugin-cache";
import {
  AuditLogEvent,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  GuildOnboardingMode,
  GuildOnboardingPromptType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  InviteType,
  StageInstancePrivacyLevel,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GuildEmoji,
  GuildInvite,
  ReactionEmoji,
  Role,
  Webhook,
  kPatch,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const stageId = "200000000000000040";
const userId = "600000000000000600";
const roleId = "700000000000000070";
const emojiId = "900000000000000090";
const eventId = "300000000000000030";
const ruleId = "400000000000000040";
const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };
const member = { user, roles: [], joined_at: "2026-01-01T00:00:00.000Z", deaf: false, mute: false };

function createClient(cache = true) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: cache ? createInMemoryCache() : null,
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

const rule = {
  id: ruleId,
  guild_id: guildId,
  name: "No howling",
  creator_id: userId,
  event_type: AutoModerationRuleEventType.MessageSend,
  trigger_type: AutoModerationRuleTriggerType.Keyword,
  trigger_metadata: { keyword_filter: ["awoo"] },
  actions: [{ type: AutoModerationActionType.BlockMessage }],
  enabled: true,
  exempt_roles: [],
  exempt_channels: [],
};
const emoji = { id: emojiId, name: "howl", roles: [], animated: false, guild_id: guildId };

async function seed(client: GatewayClient) {
  const cache = client.cache!;
  await cache.guilds.set(guildId, { id: guildId, name: "Pack", features: [], icon: null } as never);
  await cache.channels.set(channelId, {
    id: channelId,
    type: ChannelType.GuildText,
    name: "general",
    guild_id: guildId,
  } as never);
  await cache.channels.set(stageId, {
    id: stageId,
    type: ChannelType.GuildStageVoice,
    name: "stage",
    guild_id: guildId,
  } as never);
  await cache.users.set(userId, user as never);
  await cache.members.set(memberKey(guildId, userId), { ...member, guild_id: guildId } as never);
  await cache.roles.set(roleKey(guildId, roleId), {
    id: roleId,
    name: "Alpha",
    guild_id: guildId,
    color: 0,
    hoist: false,
    position: 1,
    permissions: "0",
    managed: true,
    mentionable: false,
    flags: 0,
  } as never);
  await cache.emojis.set(emojiKey(guildId, emojiId), emoji as never);
  await cache.autoModerationRules.set(autoModerationRuleKey(guildId, ruleId), rule as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("member relations", () => {
  test("GIVEN a cached voice state and presence THEN member.voice and member.presence resolve", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.voiceStates.set(voiceStateKey(guildId, userId), {
      guild_id: guildId,
      channel_id: stageId,
      user_id: userId,
      session_id: "session",
      deaf: false,
      mute: false,
      self_deaf: false,
      self_mute: true,
      self_video: false,
      suppress: false,
      request_to_speak_timestamp: null,
    } as never);
    await client.cache!.presences.set(presenceKey(guildId, userId), {
      user: { id: userId },
      guild_id: guildId,
      status: "online",
      activities: [],
      client_status: {},
    } as never);

    const resolved = (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!;

    expect(resolved.voice?.channel?.id).toBe(stageId);
    expect(resolved.voice?.member).toBe(resolved);
    expect(resolved.presence?.status).toBe("online");
    expect(resolved.presence?.member).toBe(resolved);
    // The voice state's own member resolves the member's voice state in turn, without looping.
    expect(
      (await client.voiceStates.cache.get(client.voiceStates.resolveKey(guildId, userId)))?.member
        ?.voice?.selfMute,
    ).toBe(true);
  });

  test("GIVEN no voice state nor presence THEN they are null", async () => {
    const client = createClient();
    await seed(client);

    const resolved = (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!;

    expect(resolved.voice).toBeNull();
    expect(resolved.presence).toBeNull();
  });
});

describe("guild structure relations", () => {
  test("GIVEN fetchGuildTemplate THEN the creator is the cached user", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      code: "howl",
      name: "Pack template",
      description: null,
      usage_count: 0,
      creator_id: userId,
      creator: { ...user, username: "creator" },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      source_guild_id: guildId,
      serialized_source_guild: {},
      is_dirty: null,
    });

    const template = await client.fetchGuildTemplate("howl");

    expect(template.creator.username).toBe("creator");
    expect(template.creator).toBe(template.creator);
    expect((await client.users.cache.get(userId))?.username).toBe("creator");
  });

  test("GIVEN a stage with a cached scheduled event THEN stageInstance.guildScheduledEvent resolves", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.scheduledEvents.set(scheduledEventKey(guildId, eventId), {
      id: eventId,
      guild_id: guildId,
      channel_id: stageId,
      name: "Full moon",
      scheduled_start_time: "2026-01-01T00:00:00.000Z",
      scheduled_end_time: null,
      privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
      status: GuildScheduledEventStatus.Active,
      entity_type: GuildScheduledEventEntityType.StageInstance,
      entity_id: null,
      entity_metadata: null,
    } as never);
    const stage = {
      id: "500000000000000050",
      guild_id: guildId,
      channel_id: stageId,
      topic: "Howling",
      privacy_level: StageInstancePrivacyLevel.GuildOnly,
      discoverable_disabled: true,
      guild_scheduled_event_id: eventId,
    };
    await client.cache!.stageInstances.set(stageInstanceKey(guildId, stageId), stage as never);

    const instance = (await client.guilds
      .stageInstances(guildId)
      .cache.get(client.guilds.stageInstances(guildId).resolveKey(stageId)))!;
    expect(instance.guildScheduledEvent?.name).toBe("Full moon");

    instance[kPatch]({ guild_scheduled_event_id: null });
    expect(instance.guildScheduledEvent).toBeNull();
    expect(
      client.guilds.stageInstances(guildId).cache.construct(stage).guildScheduledEvent,
    ).toBeNull();
  });

  test("GIVEN a sound with a cached emoji THEN sound.emoji is the guild emoji, else the payload's", async () => {
    const client = createClient();
    await seed(client);
    const sound = {
      sound_id: "110000000000000011",
      name: "awoo",
      volume: 1,
      emoji_id: emojiId,
      emoji_name: null,
      guild_id: guildId,
      available: true,
    };
    await client.cache!.soundboardSounds.set(
      soundboardSoundKey(guildId, sound.sound_id),
      sound as never,
    );

    const cached = (await client.guilds
      .soundboardSounds(guildId)
      .cache.get(client.guilds.soundboardSounds(guildId).resolveKey(sound.sound_id)))!;
    expect(cached.emoji).toBeInstanceOf(GuildEmoji);
    expect(cached.emoji?.name).toBe("howl");

    const uncached = client.guilds.soundboardSounds(guildId).cache.construct(sound as never);
    expect(uncached.emoji).toBeInstanceOf(ReactionEmoji);
    expect(uncached.emoji?.id).toBe(emojiId);
  });

  test("GIVEN an integration with a cached role THEN integration.role resolves", async () => {
    const client = createClient();
    await seed(client);
    const integration = {
      id: "120000000000000012",
      name: "Twitch",
      type: "twitch",
      enabled: true,
      account: { id: "1", name: "wolf" },
      role_id: roleId,
      guild_id: guildId,
    };
    await client.cache!.integrations.set(
      integrationKey(guildId, integration.id),
      integration as never,
    );

    const resolved = (await client.guilds
      .integrations(guildId)
      .cache.get(client.guilds.integrations(guildId).resolveKey(integration.id)))!;
    expect(resolved.role).toBeInstanceOf(Role);
    expect(resolved.role?.name).toBe("Alpha");
    // Built without relations, the role is read from the cache by the getter.
    expect(
      client.guilds.integrations(guildId).cache.construct(integration as never).role?.name,
    ).toBe("Alpha");
  });

  test("GIVEN invites THEN channel is the cached channel, else the partial one", async () => {
    const client = createClient();
    await seed(client);
    const invite = {
      code: "wolves",
      type: InviteType.Guild,
      guild_id: guildId,
      channel_id: channelId,
      uses: 0,
    };
    await client.cache!.invites.set(inviteKey(guildId, "wolves"), invite as never);
    expect(
      (
        (await client.guilds
          .invites(guildId)
          .cache.get(client.guilds.invites(guildId).resolveKey("wolves")))!.channel as {
          name: string;
        }
      ).name,
    ).toBe("general");

    vi.spyOn(container.rest, "get").mockResolvedValue({
      code: "pack",
      type: InviteType.Guild,
      guild: { id: guildId, name: "Stale", features: [], icon: null },
      channel: { id: "299999999999999999", name: "partial", type: ChannelType.GuildText },
    });
    const fetched = await client.fetchInvite("pack");
    expect(fetched).toBeInstanceOf(GuildInvite);
    expect((fetched.channel as { name: string }).name).toBe("partial");
    expect((fetched as GuildInvite).guild?.name).toBe("Pack");
  });

  test("GIVEN a welcome screen THEN its channels and emojis come from the cache", async () => {
    const client = createClient();
    await seed(client);
    vi.spyOn(container.rest, "get").mockResolvedValue({
      description: "Awoo",
      welcome_channels: [
        { channel_id: channelId, description: "Chat", emoji_id: emojiId, emoji_name: "howl" },
        { channel_id: "299999999999999999", description: "Gone", emoji_id: null, emoji_name: "🐺" },
      ],
    });

    const screen = await client.guilds.fetchWelcomeScreen(guildId);
    const [cached, uncached] = screen.welcomeChannels;

    expect(cached!.channel?.id).toBe(channelId);
    expect(cached!.emoji).toBeInstanceOf(GuildEmoji);
    expect(uncached!.channel).toBeNull();
    expect(uncached!.emoji).toBeInstanceOf(ReactionEmoji);
  });

  test("GIVEN an onboarding THEN its prompts resolve the guild, channels, roles, and emojis", async () => {
    const client = createClient();
    await seed(client);
    vi.spyOn(container.rest, "get").mockResolvedValue({
      guild_id: guildId,
      default_channel_ids: [channelId, "299999999999999999"],
      enabled: true,
      mode: GuildOnboardingMode.OnboardingDefault,
      prompts: [
        {
          id: "130000000000000013",
          type: GuildOnboardingPromptType.MultipleChoice,
          title: "Pack?",
          single_select: false,
          required: false,
          in_onboarding: true,
          options: [
            {
              id: "140000000000000014",
              title: "Alpha",
              description: null,
              channel_ids: [channelId],
              role_ids: [roleId, "799999999999999999"],
              emoji: { id: emojiId, name: "howl", animated: false },
            },
          ],
        },
      ],
    });

    const onboarding = await client.guilds.fetchOnboarding(guildId);
    const [prompt] = onboarding.prompts;
    const [option] = prompt!.options;

    expect([...onboarding.defaultChannels.keys()]).toEqual([channelId]);
    expect(prompt!.guild?.id).toBe(guildId);
    expect(option!.guild?.id).toBe(guildId);
    expect(option!.channels.get(channelId)?.id).toBe(channelId);
    expect([...option!.roles.keys()]).toEqual([roleId]);
    expect(option!.emoji).toBeInstanceOf(GuildEmoji);
  });
});

describe("auto moderation and audit log relations", () => {
  const execution = {
    guild_id: guildId,
    action: { type: AutoModerationActionType.BlockMessage },
    rule_id: ruleId,
    rule_trigger_type: AutoModerationRuleTriggerType.Keyword,
    user_id: userId,
    channel_id: channelId,
    content: "awoo",
    matched_keyword: "awoo",
    matched_content: "awoo",
  };

  test("GIVEN an execution THEN its member, channel, and rule come from the cache", async () => {
    const client = createClient();
    await seed(client);
    const calls = record(client, "autoModerationActionExecution");

    await dispatch(client, GatewayDispatchEvents.AutoModerationActionExecution, execution);

    const [[emitted]] = calls;
    expect(emitted.member?.id).toBe(userId);
    expect(emitted.channel?.id).toBe(channelId);
    expect(emitted.autoModerationRule?.name).toBe("No howling");
  });

  test("GIVEN an execution without a cache THEN its relations are null", async () => {
    const client = createClient(false);
    const calls = record(client, "autoModerationActionExecution");

    await dispatch(client, GatewayDispatchEvents.AutoModerationActionExecution, execution);

    const [[emitted]] = calls;
    expect(emitted.member).toBeNull();
    expect(emitted.channel).toBeNull();
    expect(emitted.autoModerationRule).toBeNull();
  });

  test("GIVEN audit log entries THEN their targets come from the cache, else the changes", async () => {
    const client = createClient();
    await seed(client);
    const calls = record(client, "guildAuditLogEntryCreate");
    const entry = (action: AuditLogEvent, targetId: string | null, extra = {}) => ({
      id: "800000000000000080",
      guild_id: guildId,
      action_type: action,
      user_id: userId,
      target_id: targetId,
      ...extra,
    });

    await dispatch(
      client,
      GatewayDispatchEvents.GuildAuditLogEntryCreate,
      entry(AuditLogEvent.MemberKick, userId),
    );
    await dispatch(
      client,
      GatewayDispatchEvents.GuildAuditLogEntryCreate,
      entry(AuditLogEvent.RoleUpdate, roleId),
    );
    await dispatch(
      client,
      GatewayDispatchEvents.GuildAuditLogEntryCreate,
      entry(AuditLogEvent.ChannelDelete, "299999999999999999", {
        changes: [{ key: "name", old_value: "gone" }],
      }),
    );
    await dispatch(
      client,
      GatewayDispatchEvents.GuildAuditLogEntryCreate,
      entry(AuditLogEvent.AutoModerationRuleUpdate, ruleId),
    );
    await dispatch(
      client,
      GatewayDispatchEvents.GuildAuditLogEntryCreate,
      entry(AuditLogEvent.WebhookCreate, "150000000000000015", {
        changes: [{ key: "name", new_value: "Howler" }],
      }),
    );
    await dispatch(
      client,
      GatewayDispatchEvents.GuildAuditLogEntryCreate,
      entry(AuditLogEvent.EmojiUpdate, "999"),
    );

    const targets = calls.map(([emitted]) => emitted.target);
    expect(calls[0]![0].targetType).toBe("User");
    expect((targets[0] as { username: string }).username).toBe("wolf");
    expect(targets[1]).toBeInstanceOf(Role);
    expect(targets[2]).toEqual({ id: "299999999999999999", name: "gone" });
    expect((targets[3] as { name: string }).name).toBe("No howling");
    expect(targets[4]).toBeInstanceOf(Webhook);
    expect((targets[4] as Webhook).name).toBe("Howler");
    expect(targets[5]).toEqual({ id: "999" });
  });

  test("GIVEN fetchAuditLogs THEN user targets come from the page", async () => {
    const client = createClient(false);
    vi.spyOn(container.rest, "get").mockResolvedValue({
      audit_log_entries: [
        { id: "1", action_type: AuditLogEvent.MemberBanAdd, user_id: userId, target_id: userId },
      ],
      users: [user],
      webhooks: [],
      auto_moderation_rules: [],
      threads: [],
      integrations: [],
      application_commands: [],
      guild_scheduled_events: [],
    });

    const logs = await client.guilds.fetchAuditLogs(guildId);

    expect((logs.entries[0]!.target as { id: string }).id).toBe(userId);
  });
});

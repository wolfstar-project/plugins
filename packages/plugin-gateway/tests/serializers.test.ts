import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventRecurrenceRuleFrequency,
  GuildScheduledEventRecurrenceRuleWeekday,
  GuildScheduledEventStatus,
  InteractionType,
  MessageActivityType,
  MessageReferenceType,
  MessageType,
  NameplatePalette,
  Routes,
  type APIMessage,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  basename,
  BaseInvite,
  cleanCodeBlockContent,
  cleanContent,
  discordSort,
  Embed,
  findName,
  flatten,
  ForumChannel,
  GatewayClient,
  GatewayError,
  GatewayTypeError,
  getSortableGroupTypes,
  GuildScheduledEvent,
  GuildTemplate,
  makeError,
  makePlainError,
  Message,
  moveElementInArray,
  parseWebhookURL,
  resolveBase64,
  resolveFile,
  resolveGuildTemplateCode,
  resolveImage,
  resolveInviteCode,
  resolveSKUId,
  Role,
  snakeCase,
  toChannelBody,
  toSnakeCase,
  transformAPIAuditLogChange,
  transformAPIAutoModerationAction,
  transformAPIAutoModerationRuleTriggerMetadata,
  transformAPIGuildDefaultReaction,
  transformAPIGuildForumTag,
  transformAPIGuildScheduledEventRecurrenceRule,
  transformAPIIncidentsData,
  transformAPIMessageInteractionMetadata,
  transformAPIRoleTags,
  transformAutoModerationAction,
  transformAutoModerationRuleTriggerMetadata,
  transformCollectibles,
  transformGuildDefaultReaction,
  transformGuildForumTag,
  transformGuildScheduledEventRecurrenceRule,
  User,
  verifyString,
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

async function* stream() {
  yield "wo";
  yield new TextEncoder().encode("lf");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toSnakeCase", () => {
  test("GIVEN camel-cased keys THEN they become snake-cased, deeply", () => {
    expect(snakeCase("byNWeekday")).toBe("by_n_weekday");
    expect(snakeCase("mentionRaidProtectionEnabled")).toBe("mention_raid_protection_enabled");
    expect(snakeCase("already_snake")).toBe("already_snake");
    expect(
      toSnakeCase({ keywordFilter: ["a"], nested: [{ channelId: "1" }], at: new Date(0) }),
    ).toEqual({ keyword_filter: ["a"], nested: [{ channel_id: "1" }], at: new Date(0) });
  });

  test("GIVEN something with toJSON THEN its JSON is transformed", () => {
    expect(toSnakeCase({ toJSON: () => ({ customId: "x" }) })).toEqual({ custom_id: "x" });
  });
});

describe("auto moderation transformers", () => {
  test("GIVEN raw trigger metadata THEN it is camel-cased with defaults", () => {
    expect(transformAPIAutoModerationRuleTriggerMetadata({ keyword_filter: ["awoo"] })).toEqual({
      keywordFilter: ["awoo"],
      regexPatterns: [],
      presets: [],
      allowList: [],
      mentionTotalLimit: null,
      mentionRaidProtectionEnabled: false,
    });
  });

  test("GIVEN camel-cased or raw trigger metadata THEN it is snake-cased for the API", () => {
    expect(
      transformAutoModerationRuleTriggerMetadata({
        keywordFilter: ["awoo"],
        mentionTotalLimit: null,
        mentionRaidProtectionEnabled: true,
      }),
    ).toEqual({ keyword_filter: ["awoo"], mention_raid_protection_enabled: true });
    expect(transformAutoModerationRuleTriggerMetadata({ allow_list: ["wolf"] })).toEqual({
      allow_list: ["wolf"],
    });
  });

  test("GIVEN actions THEN they convert both ways", () => {
    expect(
      transformAPIAutoModerationAction({
        type: AutoModerationActionType.Timeout,
        metadata: { duration_seconds: 60 },
      }),
    ).toEqual({
      type: AutoModerationActionType.Timeout,
      metadata: { durationSeconds: 60, channelId: null, customMessage: null },
    });
    expect(
      transformAutoModerationAction({
        type: AutoModerationActionType.SendAlertMessage,
        metadata: { channel: { id: "5" } },
      }),
    ).toEqual({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel_id: "5" } });
    expect(transformAutoModerationAction({ type: AutoModerationActionType.BlockMessage })).toEqual({
      type: AutoModerationActionType.BlockMessage,
    });
  });

  test("GIVEN camel-cased create options THEN the body is snake-cased", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue({
      id: "900000000000000090",
      guild_id: guildId,
      name: "No howling",
      creator_id: userId,
      event_type: AutoModerationRuleEventType.MessageSend,
      trigger_type: AutoModerationRuleTriggerType.Keyword,
      trigger_metadata: { keyword_filter: ["awoo"] },
      actions: [{ type: AutoModerationActionType.Timeout, metadata: { duration_seconds: 60 } }],
      enabled: true,
      exempt_roles: [],
      exempt_channels: [],
    });

    const rule = await client.guilds.autoModerationRules(guildId).create({
      name: "No howling",
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { keywordFilter: ["awoo"] },
      actions: [{ type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } }],
    });

    expect(post).toHaveBeenCalledWith(Routes.guildAutoModerationRules(guildId), {
      body: {
        name: "No howling",
        event_type: AutoModerationRuleEventType.MessageSend,
        trigger_type: AutoModerationRuleTriggerType.Keyword,
        trigger_metadata: { keyword_filter: ["awoo"] },
        actions: [{ type: AutoModerationActionType.Timeout, metadata: { duration_seconds: 60 } }],
      },
      reason: undefined,
    });
    expect(rule.actions[0]!.metadata.durationSeconds).toBe(60);
    expect(rule.triggerMetadata.keywordFilter).toEqual(["awoo"]);
  });
});

describe("channel transformers", () => {
  test("GIVEN forum tags THEN they convert both ways, raw ones passing through", () => {
    const raw = { id: "1", name: "Howl", moderated: false, emoji_id: null, emoji_name: "🐺" };
    expect(transformAPIGuildForumTag(raw)).toEqual({
      id: "1",
      name: "Howl",
      moderated: false,
      emoji: { id: null, name: "🐺" },
    });
    expect(transformAPIGuildForumTag({ ...raw, emoji_name: null } as typeof raw).emoji).toBeNull();
    expect(transformGuildForumTag({ name: "Howl", emoji: { id: null, name: "🐺" } })).toEqual({
      name: "Howl",
      emoji_id: null,
      emoji_name: "🐺",
    });
    expect(transformGuildForumTag(raw)).toBe(raw);
  });

  test("GIVEN default reactions THEN they convert both ways", () => {
    expect(transformAPIGuildDefaultReaction({ emoji_id: "7", emoji_name: null })).toEqual({
      id: "7",
      name: null,
    });
    expect(transformGuildDefaultReaction({ id: null, name: "🐺" })).toEqual({
      emoji_id: null,
      emoji_name: "🐺",
    });
  });

  test("GIVEN camel-cased forum options THEN the channel body is snake-cased", () => {
    expect(
      toChannelBody({
        availableTags: [{ name: "Howl", moderated: true, emoji: null }],
        defaultReactionEmoji: { id: "7", name: null },
      }),
    ).toEqual({
      available_tags: [{ name: "Howl", moderated: true, emoji_id: null, emoji_name: null }],
      default_reaction_emoji: { emoji_id: "7", emoji_name: null },
    });
  });

  test("GIVEN a forum channel THEN its tags and default reaction are camel-cased", () => {
    const forum = new ForumChannel({
      id: "2",
      type: ChannelType.GuildForum,
      available_tags: [
        { id: "1", name: "Howl", moderated: false, emoji_id: "7", emoji_name: null },
      ],
      default_reaction_emoji: { emoji_id: null, emoji_name: "🐺" },
    } as never);
    expect(forum.availableTags).toEqual([
      { id: "1", name: "Howl", moderated: false, emoji: { id: "7", name: null } },
    ]);
    expect(forum.defaultReactionEmoji).toEqual({ id: null, name: "🐺" });
  });
});

describe("guild transformers", () => {
  test("GIVEN recurrence rules THEN they convert both ways", () => {
    const rule = transformAPIGuildScheduledEventRecurrenceRule({
      start: "2024-06-01T00:00:00.000Z",
      end: null,
      frequency: GuildScheduledEventRecurrenceRuleFrequency.Weekly,
      interval: 1,
      by_weekday: [GuildScheduledEventRecurrenceRuleWeekday.Friday],
      by_n_weekday: null,
      by_month: null,
      by_month_day: null,
      by_year_day: null,
      count: null,
    });
    expect(rule.startTimestamp).toBe(Date.parse("2024-06-01T00:00:00.000Z"));
    expect(rule.startAt).toEqual(new Date("2024-06-01T00:00:00.000Z"));
    expect(rule.endAt).toBeNull();
    expect(rule.byWeekday).toEqual([GuildScheduledEventRecurrenceRuleWeekday.Friday]);

    expect(
      transformGuildScheduledEventRecurrenceRule({
        startAt: Date.parse("2024-06-01T00:00:00.000Z"),
        frequency: GuildScheduledEventRecurrenceRuleFrequency.Weekly,
        interval: 1,
        byWeekday: [GuildScheduledEventRecurrenceRuleWeekday.Friday],
      }),
    ).toEqual({
      start: "2024-06-01T00:00:00.000Z",
      frequency: GuildScheduledEventRecurrenceRuleFrequency.Weekly,
      interval: 1,
      by_weekday: [GuildScheduledEventRecurrenceRuleWeekday.Friday],
    });
  });

  test("GIVEN a scheduled event THEN its rule and metadata are camel-cased", () => {
    const event = new GuildScheduledEvent({
      id: "1",
      guild_id: guildId,
      channel_id: null,
      name: "Howl",
      scheduled_start_time: "2024-06-01T00:00:00.000Z",
      scheduled_end_time: null,
      privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
      status: GuildScheduledEventStatus.Scheduled,
      entity_type: GuildScheduledEventEntityType.External,
      entity_id: null,
      entity_metadata: { location: "The woods" },
      recurrence_rule: null,
    } as never);
    expect(event.entityMetadata).toEqual({ location: "The woods" });
    expect(event.recurrenceRule).toBeNull();
  });

  test("GIVEN a camel-cased recurrence rule THEN create sends it snake-cased", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue({
      id: "1",
      guild_id: guildId,
      name: "Howl",
    });

    await client.guilds.scheduledEvents(guildId).create({
      name: "Howl",
      scheduledStartTime: Date.parse("2024-06-01T00:00:00.000Z"),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      recurrenceRule: {
        startAt: new Date("2024-06-01T00:00:00.000Z"),
        frequency: GuildScheduledEventRecurrenceRuleFrequency.Daily,
        interval: 1,
      },
    });

    expect(post.mock.calls[0]![1]).toMatchObject({
      body: {
        recurrence_rule: {
          start: "2024-06-01T00:00:00.000Z",
          frequency: GuildScheduledEventRecurrenceRuleFrequency.Daily,
          interval: 1,
        },
      },
    });
  });

  test("GIVEN incidents data THEN the times become dates", () => {
    expect(
      transformAPIIncidentsData({
        invites_disabled_until: "2024-06-01T00:00:00.000Z",
        dms_disabled_until: null,
      }),
    ).toEqual({
      invitesDisabledUntil: new Date("2024-06-01T00:00:00.000Z"),
      dmsDisabledUntil: null,
      dmSpamDetectedAt: null,
      raidDetectedAt: null,
    });
  });

  test("GIVEN role tags THEN present null tags become true", () => {
    expect(transformAPIRoleTags({ bot_id: "5", premium_subscriber: null })).toEqual({
      botId: "5",
      premiumSubscriberRole: true,
    });
    const role = new Role({
      id: "3",
      name: "Boosters",
      tags: { premium_subscriber: null, guild_connections: null },
    } as never);
    expect(role.tags).toEqual({ premiumSubscriberRole: true, guildConnections: true });
  });

  test("GIVEN audit log changes THEN old and new values are renamed", () => {
    expect(transformAPIAuditLogChange({ key: "nick", old_value: "a", new_value: "b" })).toEqual({
      key: "nick",
      old: "a",
      new: "b",
    });
    expect(transformAPIAuditLogChange({ key: "nick", new_value: "b" } as never)).toEqual({
      key: "nick",
      new: "b",
    });
  });
});

describe("user transformers", () => {
  test("GIVEN a user THEN its decoration, collectibles, and primary guild are camel-cased", () => {
    const structure = new User({
      ...user,
      avatar_decoration_data: { asset: "a_1", sku_id: "2" },
      collectibles: {
        nameplate: { sku_id: "3", asset: "plate", label: "Wolf", palette: NameplatePalette.Forest },
      },
      primary_guild: {
        identity_guild_id: guildId,
        identity_enabled: true,
        tag: "WOLF",
        badge: "b",
      },
    });
    expect(structure.avatarDecorationData).toEqual({ asset: "a_1", skuId: "2" });
    expect(structure.collectibles).toEqual({
      nameplate: { skuId: "3", asset: "plate", label: "Wolf", palette: NameplatePalette.Forest },
    });
    expect(structure.primaryGuild).toEqual({
      identityGuildId: guildId,
      identityEnabled: true,
      tag: "WOLF",
      badge: "b",
    });
    expect(transformCollectibles({})).toEqual({ nameplate: null });
  });
});

describe("message transformers", () => {
  function message(extra: Partial<APIMessage> = {}): APIMessage {
    return {
      id: "700000000000000700",
      channel_id: "200000000000000200",
      author: user,
      content: "",
      timestamp: "2024-06-01T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
      ...extra,
    } as APIMessage;
  }

  test("GIVEN a message THEN its nested objects are camel-cased", () => {
    const msg = new Message(
      message({
        message_reference: {
          type: MessageReferenceType.Default,
          channel_id: "200000000000000200",
          message_id: "700000000000000701",
        },
        activity: { type: MessageActivityType.Join, party_id: "party" },
        call: { participants: [userId], ended_timestamp: "2024-06-01T01:00:00.000Z" },
        role_subscription_data: {
          role_subscription_listing_id: "4",
          tier_name: "Alpha",
          total_months_subscribed: 3,
          is_renewal: true,
        },
        mention_channels: [
          { id: "8", guild_id: guildId, type: ChannelType.GuildText, name: "howls" },
        ],
      }) as never,
    );

    expect(msg.reference).toEqual({
      channelId: "200000000000000200",
      guildId: undefined,
      messageId: "700000000000000701",
      type: MessageReferenceType.Default,
    });
    expect(msg.activity).toEqual({ partyId: "party", type: MessageActivityType.Join });
    expect(msg.call?.endedAt).toEqual(new Date("2024-06-01T01:00:00.000Z"));
    expect(msg.call?.participants).toEqual([userId]);
    expect(msg.roleSubscriptionData).toEqual({
      roleSubscriptionListingId: "4",
      tierName: "Alpha",
      totalMonthsSubscribed: 3,
      isRenewal: true,
    });
    expect(msg.mentions.crosspostedChannels).toEqual([
      { channelId: "8", guildId, type: ChannelType.GuildText, name: "howls" },
    ]);
  });

  test("GIVEN a forward THEN its snapshots are messages carrying the forwarded IDs", () => {
    const msg = new Message(
      message({
        message_reference: {
          type: MessageReferenceType.Forward,
          channel_id: "200000000000000201",
          message_id: "700000000000000702",
        },
        message_snapshots: [{ message: { content: "awoo" } as never }],
      }) as never,
    );
    const [snapshot] = msg.messageSnapshots;
    expect(snapshot).toBeInstanceOf(Message);
    expect(snapshot!.id).toBe("700000000000000702");
    expect(snapshot!.channelId).toBe("200000000000000201");
    expect(snapshot!.content).toBe("awoo");
  });

  test("GIVEN interaction metadata THEN its users are User structures", () => {
    const metadata = transformAPIMessageInteractionMetadata({
      id: "1",
      type: InteractionType.ModalSubmit,
      user,
      authorizing_integration_owners: {},
      original_response_message_id: "2",
      triggering_interaction_metadata: {
        id: "3",
        type: InteractionType.MessageComponent,
        user,
        authorizing_integration_owners: {},
        interacted_message_id: "4",
      },
    });
    expect(metadata.user).toBeInstanceOf(User);
    expect(metadata.originalResponseMessageId).toBe("2");
    expect(metadata.triggeringInteractionMetadata?.interactedMessageId).toBe("4");
    expect(metadata.targetUser).toBeNull();
  });

  test("GIVEN an embed THEN its assets, author, and footer are camel-cased", () => {
    const embed = new Embed({
      author: { name: "Wolf", icon_url: "https://a/i.png", proxy_icon_url: "https://p/i.png" },
      thumbnail: { url: "https://a/t.png", proxy_url: "https://p/t.png", width: 1, height: 2 },
      footer: { text: "Howl", icon_url: "https://a/f.png" },
    });
    expect(embed.author).toEqual({
      name: "Wolf",
      url: undefined,
      iconURL: "https://a/i.png",
      proxyIconURL: "https://p/i.png",
    });
    expect(embed.thumbnail).toEqual({
      url: "https://a/t.png",
      proxyURL: "https://p/t.png",
      width: 1,
      height: 2,
    });
    expect(embed.footer).toEqual({
      text: "Howl",
      iconURL: "https://a/f.png",
      proxyIconURL: undefined,
    });
    expect(embed.image).toBeNull();
    expect(embed.length).toBe(8);
  });
});

describe("DataResolver", () => {
  test("GIVEN invite and template URLs THEN their codes are extracted", () => {
    expect(resolveInviteCode("https://discord.gg/awoo")).toBe("awoo");
    expect(resolveInviteCode("https://discord.com/invite/awoo")).toBe("awoo");
    expect(resolveInviteCode("awoo")).toBe("awoo");
    expect(resolveGuildTemplateCode("https://discord.new/howl")).toBe("howl");
    expect(resolveGuildTemplateCode("https://discord.com/template/howl")).toBe("howl");
    expect(BaseInvite.InvitesPattern.test("discord.gg/awoo")).toBe(true);
    expect(GuildTemplate.GuildTemplatesPattern.test("discord.new/howl")).toBe(true);
  });

  test("GIVEN contents THEN they resolve to a data URI", async () => {
    const bytes = new TextEncoder().encode("wolf");
    expect(resolveBase64(bytes, "image/png")).toBe("data:image/png;base64,d29sZg==");
    expect(resolveBase64("data:image/png;base64,AA==")).toBe("data:image/png;base64,AA==");
    expect(await resolveImage(bytes)).toBe("data:image/jpg;base64,d29sZg==");
    expect(await resolveImage(new Blob([bytes], { type: "image/gif" }))).toBe(
      "data:image/gif;base64,d29sZg==",
    );
    expect(await resolveImage("data:image/png;base64,AA==")).toBe("data:image/png;base64,AA==");
    expect(await resolveImage(null)).toBeNull();
  });

  test("GIVEN files THEN they are read, and invalid ones rejected", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gateway-"));
    const file = join(directory, "wolf.txt");
    await writeFile(file, "wolf");

    expect(new TextDecoder().decode((await resolveFile(file)).data)).toBe("wolf");
    expect((await resolveFile(new ArrayBuffer(2))).data).toHaveLength(2);
    expect(new TextDecoder().decode((await resolveFile(stream())).data)).toBe("wolf");
    await expect(resolveFile(directory)).rejects.toBeInstanceOf(GatewayError);
    await expect(resolveFile(42 as never)).rejects.toBeInstanceOf(GatewayTypeError);
  });

  test("GIVEN an image path THEN editing a role icon uploads it as a data URI", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gateway-"));
    const file = join(directory, "icon.png");
    await writeFile(file, "wolf");
    const client = createClient();
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue({ id: "3", name: "Wolves", position: 1 });

    await client.roles.edit(guildId, "3", { icon: file });

    expect(patch.mock.calls[0]![1]).toMatchObject({
      body: { icon: "data:image/jpg;base64,d29sZg==" },
    });
  });
});

describe("Util", () => {
  test("GIVEN mentions THEN cleanContent replaces the known ones", () => {
    const text =
      "<@123456789012345678> <@&223456789012345678> <#323456789012345678> </howl:423456789012345678> <:wolf:523456789012345678> <@999999999999999999>";
    expect(
      cleanContent(text, {
        users: { "123456789012345678": "Wolf" },
        roles: new Map([["223456789012345678", "Pack"]]),
        channels: { "323456789012345678": "den" },
      }),
    ).toBe("@Wolf @Pack #den /howl :wolf: <@999999999999999999>");
    expect(cleanCodeBlockContent("```js```")).toBe("`​``js`​``");
  });

  test("GIVEN a webhook URL THEN its ID and token are parsed", () => {
    const token = "a".repeat(68);
    expect(parseWebhookURL(`https://discord.com/api/webhooks/123456789012345678/${token}`)).toEqual(
      { id: "123456789012345678", token },
    );
    expect(parseWebhookURL("https://example.com")).toBeNull();
  });

  test("GIVEN positioned items THEN discordSort orders roles and channels like Discord", () => {
    const roles = [
      { id: "2", position: 1 },
      { id: "3", position: 1 },
      { id: "1", position: 0 },
    ];
    expect(discordSort(roles).map((role) => role.id)).toEqual(["1", "3", "2"]);
    const channels = [
      { id: "3", position: 1, type: ChannelType.GuildText },
      { id: "2", position: 1, type: ChannelType.GuildText },
    ];
    expect(
      discordSort(new Map(channels.map((channel) => [channel.id, channel]))).map(
        (channel) => channel.id,
      ),
    ).toEqual(["2", "3"]);
    expect(getSortableGroupTypes(ChannelType.GuildStageVoice)).toContain(ChannelType.GuildVoice);
  });

  test("GIVEN the remaining helpers THEN they behave like discord.js's", () => {
    const array = ["a", "b", "c"];
    expect(moveElementInArray(array, "a", 1, true)).toBe(1);
    expect(array).toEqual(["b", "a", "c"]);
    expect(verifyString("wolf")).toBe("wolf");
    expect(() => verifyString("", TypeError, "empty", false)).toThrow(TypeError);
    expect(basename("https://cdn.example/wolf.png?size=64")).toBe("wolf.png");
    expect(basename("wolf.png", ".png")).toBe("wolf");
    expect(findName({ path: "/tmp/wolf.gif" })).toBe("wolf.gif");
    expect(findName(new Uint8Array())).toBe("file.jpg");
    expect(resolveSKUId("5")).toBe("5");
    expect(resolveSKUId({ id: "6" } as never)).toBe("6");
    const error = makeError({ name: "HowlError", message: "awoo", stack: "stack" });
    expect(makePlainError(error)).toEqual({ name: "HowlError", message: "awoo", stack: "stack" });
    expect(
      flatten({
        id: "1",
        _hidden: 1,
        roles: new Map([["2", {}]]),
        nested: { toJSON: () => "json" },
      }),
    ).toEqual({ id: "1", roles: ["2"], nested: "json" });
  });
});

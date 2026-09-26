import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, integrationKey } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  GuildOnboardingMode,
  GuildOnboardingPromptType,
  GuildWidgetStyle,
  PresenceUpdateStatus,
  Routes,
  type APIGuildIntegration,
  type APIGuildOnboarding,
  type APITemplate,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GuildOnboarding,
  GuildTemplate,
  Integration,
  WelcomeScreen,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const roleId = "300000000000000030";
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

async function cacheGuild(client: GatewayClient, extra: object = {}) {
  await client.cache!.guilds.set(guildId, {
    id: guildId,
    name: "Pack",
    features: [],
    ...extra,
  } as never);
  return (await client.guilds.get(guildId))!;
}

function integration(extra: Partial<APIGuildIntegration> = {}): APIGuildIntegration {
  return {
    id: "400000000000000040",
    name: "Twitch",
    type: "twitch",
    enabled: true,
    account: { id: "wolfstream", name: "wolfstream" },
    user,
    ...extra,
  };
}

function template(extra: Partial<APITemplate> = {}): APITemplate {
  return {
    code: "howl",
    name: "Pack template",
    description: null,
    usage_count: 3,
    creator_id: userId,
    creator: user,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    source_guild_id: guildId,
    serialized_source_guild: {} as never,
    is_dirty: null,
    ...extra,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("integrations", () => {
  test("GIVEN fetchAll THEN integrations and their users are cached", async () => {
    const client = createClient();
    const guild = await cacheGuild(client);
    vi.spyOn(container.rest, "get").mockResolvedValue([integration()]);

    const [twitch] = await guild.fetchIntegrations();

    expect(twitch).toBeInstanceOf(Integration);
    expect(twitch!.account.name).toBe("wolfstream");
    expect(twitch!.guild?.id).toBe(guildId);
    expect(await client.cache!.integrations.get(integrationKey(guildId, twitch!.id))).toBeDefined();
    expect(await client.cache!.users.get(userId)).toBeDefined();
  });

  test("GIVEN fetch of an unknown integration THEN it rejects", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue([integration()]);

    await expect(client.guilds.integrations(guildId).fetch("1")).rejects.toThrow(RangeError);
  });

  test("GIVEN delete THEN the integration is dropped from the cache", async () => {
    const client = createClient();
    const remove = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const twitch = await client.guilds
      .integrations(guildId)
      ._add({ ...integration(), guild_id: guildId });

    await twitch.delete("Gone");

    expect(remove).toHaveBeenCalledWith(Routes.guildIntegration(guildId, twitch.id), {
      reason: "Gone",
    });
    expect(await client.guilds.integrations(guildId).get(twitch.id)).toBeUndefined();
  });

  test("GIVEN integration dispatches THEN update and delete carry the cached integration", async () => {
    const client = createClient();
    const updated = record(client, "integrationUpdate");
    const deleted = record(client, "integrationDelete");
    const synced = record(client, "guildIntegrationsUpdate");

    await dispatch(client, GatewayDispatchEvents.IntegrationCreate, {
      ...integration(),
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.IntegrationUpdate, {
      ...integration({ name: "YouTube" }),
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.IntegrationDelete, {
      id: integration().id,
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildIntegrationsUpdate, { guild_id: guildId });

    expect(updated[0]![0]?.name).toBe("Twitch");
    expect(updated[0]![1].name).toBe("YouTube");
    expect(deleted[0]![0]?.name).toBe("YouTube");
    expect(synced[0]).toEqual([null, { guild_id: guildId }]);
  });
});

describe("templates", () => {
  test("GIVEN fetchGuildTemplate with a URL THEN the code is resolved", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(template());

    const fetched = await client.fetchGuildTemplate("https://discord.new/howl");

    expect(get).toHaveBeenCalledWith(Routes.template("howl"), { signal: undefined });
    expect(fetched).toBeInstanceOf(GuildTemplate);
    expect(fetched.url).toBe("https://discord.new/howl");
    expect(fetched.creator.id).toBe(userId);
  });

  test("GIVEN createTemplate and sync THEN the template is patched", async () => {
    const client = createClient();
    const guild = await cacheGuild(client);
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(template());
    vi.spyOn(container.rest, "put").mockResolvedValue(template({ usage_count: 4 }));

    const created = await guild.createTemplate("Pack template", "Awoo");
    await created.sync();

    expect(post).toHaveBeenCalledWith(Routes.guildTemplates(guildId), {
      body: { name: "Pack template", description: "Awoo" },
    });
    expect(created.guild?.id).toBe(guildId);
    expect(created.usageCount).toBe(4);
  });

  test("GIVEN createGuild THEN the new guild is cached", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "post").mockResolvedValue({ id: "7", name: "Den", features: [] });

    const guild = await client.templates.createGuild("howl", { name: "Den" });

    expect(guild.name).toBe("Den");
    expect(await client.cache!.guilds.get("7")).toBeDefined();
  });
});

describe("welcome screen", () => {
  test("GIVEN editWelcomeScreen THEN emojis are resolved and enabled reads the guild's features", async () => {
    const client = createClient();
    const guild = await cacheGuild(client, { features: ["WELCOME_SCREEN_ENABLED"] });
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue({
      description: "Welcome",
      welcome_channels: [
        { channel_id: channelId, description: "Rules", emoji_id: null, emoji_name: "🐺" },
      ],
    });

    const screen = await guild.editWelcomeScreen({
      enabled: true,
      welcomeChannels: [
        { channel: channelId, description: "Rules", emoji: "🐺" },
        { channel: channelId, description: "Howls", emoji: "<:howl:123456789012345678>" },
      ],
    });

    expect(patch.mock.calls[0]![1]).toMatchObject({
      body: {
        enabled: true,
        welcome_channels: [
          { channel_id: channelId, emoji_id: null, emoji_name: "🐺" },
          { channel_id: channelId, emoji_id: "123456789012345678", emoji_name: "howl" },
        ],
      },
    });
    expect(screen).toBeInstanceOf(WelcomeScreen);
    expect(screen.enabled).toBe(true);
    expect(screen.welcomeChannels[0]!.emoji?.name).toBe("🐺");
  });
});

describe("widget", () => {
  test("GIVEN setWidgetSettings THEN the guild is patched in place and in the cache", async () => {
    const client = createClient();
    const guild = await cacheGuild(client);
    vi.spyOn(container.rest, "patch").mockResolvedValue({ enabled: true, channel_id: channelId });

    await guild.setWidgetSettings({ enabled: true, channel: channelId });

    expect(guild.widgetEnabled).toBe(true);
    expect(guild.widgetChannelId).toBe(channelId);
    expect((await client.guilds.get(guildId))?.widgetChannelId).toBe(channelId);
  });

  test("GIVEN fetchWidget THEN its members and image URL are exposed", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      id: guildId,
      name: "Pack",
      instant_invite: null,
      channels: [],
      members: [
        {
          id: "0",
          username: "wolf",
          discriminator: "0000",
          avatar: null,
          status: PresenceUpdateStatus.Online,
          activity: { name: "Howling" },
          avatar_url: "https://cdn.discordapp.com/widget-avatars/x",
        },
      ],
      presence_count: 1,
    });

    const widget = await client.fetchGuildWidget(guildId);

    expect(widget.members[0]!.activity).toBe("Howling");
    expect(widget.imageURL(GuildWidgetStyle.Banner2)).toBe(
      `https://discord.com/api/v10/guilds/${guildId}/widget.png?style=banner2`,
    );
  });
});

describe("onboarding", () => {
  test("GIVEN editOnboarding with new prompts THEN they get placeholder IDs", async () => {
    const client = createClient();
    const onboarding: APIGuildOnboarding = {
      guild_id: guildId,
      prompts: [
        {
          id: "1",
          title: "Pick a pack",
          type: GuildOnboardingPromptType.MultipleChoice,
          single_select: true,
          required: false,
          in_onboarding: true,
          options: [
            {
              id: "2",
              title: "Wolves",
              description: null,
              channel_ids: [],
              role_ids: [roleId],
              emoji: { id: null, name: "🐺" },
            },
          ],
        },
      ],
      default_channel_ids: [channelId],
      enabled: true,
      mode: GuildOnboardingMode.OnboardingDefault,
    };
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(onboarding);

    const edited = await client.guilds.editOnboarding(guildId, {
      prompts: [
        { title: "Pick a pack", options: [{ title: "Wolves", roles: [roleId], emoji: "🐺" }] },
      ],
      defaultChannels: [channelId],
      enabled: true,
    });

    const { body } = put.mock.calls[0]![1] as { body: any };
    expect(body.prompts[0].id).toMatch(/^\d+$/);
    expect(body.prompts[0].options[0]).toMatchObject({
      title: "Wolves",
      role_ids: [roleId],
      emoji_name: "🐺",
    });
    expect(edited).toBeInstanceOf(GuildOnboarding);
    expect(edited.prompts[0]!.options[0]!.emoji?.name).toBe("🐺");
    expect(edited.defaultChannelIds).toEqual([channelId]);
  });
});

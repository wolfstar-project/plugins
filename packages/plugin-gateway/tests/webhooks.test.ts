import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, messageKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageType,
  Routes,
  WebhookType,
  type APIWebhook,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  Webhook,
  type AnnouncementChannel,
  type TextChannel,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const webhookId = "700000000000000070";

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
}

function webhook(extra: Partial<APIWebhook> = {}): APIWebhook {
  return {
    id: webhookId,
    type: WebhookType.Incoming,
    guild_id: guildId,
    channel_id: channelId,
    name: "Howler",
    avatar: null,
    application_id: null,
    token: "secret",
    ...extra,
  };
}

async function cachedChannel(client: GatewayClient, type = ChannelType.GuildText) {
  await client.cache!.channels.set(channelId, {
    id: channelId,
    type,
    name: "general",
    guild_id: guildId,
  } as never);
  return client.channels.get(channelId);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webhooks", () => {
  test("GIVEN a text channel THEN it creates and fetches webhooks", async () => {
    const client = createClient();
    const channel = (await cachedChannel(client)) as TextChannel;
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(webhook());
    vi.spyOn(container.rest, "get").mockResolvedValue([webhook()]);

    const created = await channel.createWebhook({ name: "Howler", reason: "alerts" });
    const fetched = await channel.fetchWebhooks();

    expect(post).toHaveBeenCalledWith(Routes.channelWebhooks(channelId), {
      body: { name: "Howler", avatar: undefined },
      reason: "alerts",
    });
    expect(created).toBeInstanceOf(Webhook);
    expect(created.isIncoming()).toBe(true);
    expect(created.url).toBe(`https://discord.com/api/webhooks/${webhookId}/secret`);
    expect(fetched.map((value) => value.id)).toEqual([webhookId]);
  });

  test("GIVEN send THEN it posts with the token, waits for the message, and caches it", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue({
      id: "1",
      channel_id: channelId,
      webhook_id: webhookId,
      author: {
        id: webhookId,
        username: "Howler",
        discriminator: "0000",
        global_name: null,
        avatar: null,
      },
      content: "Awoo",
      timestamp: "2026-01-01T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
    });

    const message = await new Webhook(webhook()).send({ content: "Awoo", threadId: "5" });

    const [route, options] = post.mock.calls[0]!;
    expect(route).toBe(Routes.webhook(webhookId, "secret"));
    expect(options).toMatchObject({ body: { content: "Awoo" }, auth: false });
    expect((options as { query: URLSearchParams }).query.toString()).toBe("wait=true&thread_id=5");
    expect(message.webhookId).toBe(webhookId);
    expect(await client.cache!.messages.get(messageKey(channelId, "1"))).toBeDefined();
    expect(await client.cache!.users.get(webhookId)).toBeUndefined();
  });

  test("GIVEN edit THEN it uses the token unless the webhook moves channel", async () => {
    createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(webhook({ name: "Alpha" }));
    const value = new Webhook(webhook());

    await value.edit({ name: "Alpha" });
    await value.edit({ channel: "9" });

    expect(patch).toHaveBeenNthCalledWith(1, Routes.webhook(webhookId, "secret"), {
      body: { name: "Alpha", avatar: undefined, channel_id: undefined },
      reason: undefined,
      auth: false,
    });
    expect(patch).toHaveBeenNthCalledWith(2, Routes.webhook(webhookId), {
      body: { name: undefined, avatar: undefined, channel_id: "9" },
      reason: undefined,
      auth: true,
    });
    expect(value.name).toBe("Alpha");
  });

  test("GIVEN a webhook without token THEN posting throws", () => {
    createClient();
    expect(() => new Webhook(webhook({ token: undefined })).send("Awoo")).toThrow(/no token/);
  });

  test("GIVEN client.fetchWebhook with a token THEN it skips the bot's authorization", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(webhook());

    await client.fetchWebhook(webhookId, "secret");

    expect(get).toHaveBeenCalledWith(Routes.webhook(webhookId, "secret"), { auth: false });
  });

  test("GIVEN addFollower THEN the announcement channel is followed", async () => {
    const client = createClient();
    const channel = (await cachedChannel(
      client,
      ChannelType.GuildAnnouncement,
    )) as AnnouncementChannel;
    const post = vi
      .spyOn(container.rest, "post")
      .mockResolvedValue({ channel_id: channelId, webhook_id: webhookId });

    await expect(channel.addFollower("9")).resolves.toBe(webhookId);
    expect(post).toHaveBeenCalledWith(Routes.channelFollowers(channelId), {
      body: { webhook_channel_id: "9" },
      reason: undefined,
    });
  });
});

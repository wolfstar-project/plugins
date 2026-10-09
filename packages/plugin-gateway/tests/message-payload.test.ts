import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  AllowedMentionsTypes,
  MessageFlags,
  MessageReferenceType,
  WebhookType,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GatewayClient, MessagePayload, Webhook, type GatewayClientOptions } from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const webhookId = "700000000000000070";
const token = "a".repeat(68);

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
    ...options,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MessagePayload", () => {
  test("GIVEN a string THEN it is the content", async () => {
    const client = createClient();
    const { body, files } = await MessagePayload.create(client, "Awoo").resolve();
    expect(body).toEqual({ content: "Awoo" });
    expect(files).toBeUndefined();
  });

  test("GIVEN camel case options THEN they are turned into the REST body", async () => {
    const client = createClient();
    const { body } = await MessagePayload.create(client, {
      content: "Awoo",
      tts: true,
      nonce: "abc",
      enforceNonce: true,
      embeds: [{ toJSON: () => ({ title: "Built" }) }, { title: "Raw" }],
      allowedMentions: { parse: [AllowedMentionsTypes.User], repliedUser: false },
      flags: ["SuppressEmbeds"],
      stickers: ["1", { id: "2" }],
      reply: { messageReference: { id: "3", channelId } },
    }).resolve();

    expect(body).toEqual({
      content: "Awoo",
      tts: true,
      nonce: "abc",
      enforce_nonce: true,
      embeds: [{ title: "Built" }, { title: "Raw" }],
      allowed_mentions: { parse: [AllowedMentionsTypes.User], replied_user: false },
      flags: MessageFlags.SuppressEmbeds,
      sticker_ids: ["1", "2"],
      message_reference: {
        type: MessageReferenceType.Default,
        message_id: "3",
        channel_id: channelId,
        fail_if_not_exists: true,
      },
    });
  });

  test("GIVEN raw REST keys THEN they are passed through", async () => {
    const client = createClient();
    const { body } = await MessagePayload.create(client, {
      allowed_mentions: { parse: [] },
      sticker_ids: ["1"],
    }).resolve();
    expect(body).toEqual({ allowed_mentions: { parse: [] }, sticker_ids: ["1"] });
  });

  test("GIVEN client defaults THEN mentions and replies use them", async () => {
    const client = createClient({ allowedMentions: { parse: [] }, failIfNotExists: false });
    const { body } = await MessagePayload.create(client, {
      reply: { messageReference: "3" },
    }).resolve();
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.message_reference).toMatchObject({ message_id: "3", fail_if_not_exists: false });
  });

  test("GIVEN forward THEN it references the message as a forward", async () => {
    const client = createClient();
    const { body } = await MessagePayload.create(client, {
      forward: { message: "3", channel: channelId, guild: guildId },
    }).resolve();
    expect(body.message_reference).toEqual({
      type: MessageReferenceType.Forward,
      message_id: "3",
      channel_id: channelId,
      guild_id: guildId,
    });
    expect(() =>
      MessagePayload.create(client, { forward: { message: "3" } }).resolveBody(),
    ).toThrow(/needs its channel/);
  });

  test("GIVEN files THEN they are resolved and described in attachments", async () => {
    const client = createClient();
    const { body, files } = await MessagePayload.create(client, {
      files: [
        new Uint8Array([1, 2]),
        { attachment: new Uint8Array([3]), name: "howl.ogg", description: "A howl", spoiler: true },
        { name: "raw.txt", data: "raw" },
      ],
    }).resolve();

    expect(files).toEqual([
      { name: "file.jpg", data: new Uint8Array([1, 2]) },
      { name: "SPOILER_howl.ogg", data: new Uint8Array([3]) },
      { name: "raw.txt", data: "raw" },
    ]);
    expect(body.attachments).toEqual([
      { id: "0" },
      { id: "1", description: "A howl" },
      { id: "2" },
    ]);
  });

  test("GIVEN a camel case poll THEN it is turned into the REST poll", async () => {
    const client = createClient();
    const { body } = await MessagePayload.create(client, {
      poll: {
        question: { text: "Howl?" },
        answers: [
          { text: "Yes", emoji: "🐺" },
          { text: "No", emoji: "<:no:123456789012345678>" },
        ],
        duration: 24,
        allowMultiselect: true,
      },
    }).resolve();
    expect(body.poll).toEqual({
      question: { text: "Howl?" },
      answers: [
        { poll_media: { text: "Yes", emoji: { name: "🐺" } } },
        { poll_media: { text: "No", emoji: { name: "no", id: "123456789012345678" } } },
      ],
      duration: 24,
      allow_multiselect: true,
      layout_type: undefined,
    });
  });

  test("GIVEN a poll answer emoji as a bare ID THEN it is sent as an ID", async () => {
    const client = createClient();
    const { body } = await MessagePayload.create(client, {
      poll: {
        question: { text: "Howl?" },
        answers: [{ text: "Yes", emoji: "123456789012345678" }],
        duration: 24,
        allowMultiselect: false,
      },
    }).resolve();
    expect(body.poll?.answers[0]?.poll_media.emoji).toEqual({ id: "123456789012345678" });
  });

  test("GIVEN an edit THEN null clears fields", async () => {
    const client = createClient();
    const { body } = await MessagePayload.create(
      client,
      { content: null, embeds: null },
      { edit: true },
    ).resolve();
    expect(body).toEqual({ content: "", embeds: [] });
  });

  test("GIVEN webhook options THEN only webhooks send them", async () => {
    const client = createClient();
    const options = {
      content: "Awoo",
      username: "Wolf",
      avatarURL: "https://a",
      threadName: "Post",
    };
    expect((await MessagePayload.create(client, options).resolve()).body).toEqual({
      content: "Awoo",
    });
    expect(
      (await MessagePayload.create(client, options, { webhook: true }).resolve()).body,
    ).toEqual({ content: "Awoo", username: "Wolf", avatar_url: "https://a", thread_name: "Post" });
  });

  test("GIVEN an invalid nonce THEN it throws", () => {
    const client = createClient();
    expect(() => MessagePayload.create(client, { nonce: "x".repeat(26) }).resolveBody()).toThrow(
      RangeError,
    );
  });

  test("GIVEN a payload THEN create returns it as is", () => {
    const client = createClient();
    const payload = MessagePayload.create(client, "Awoo");
    expect(MessagePayload.create(client, payload)).toBe(payload);
  });
});

describe("Webhook relations", () => {
  test("GIVEN file URLs and paths THEN their names drop the query string and fragment", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("wolf"));

    const names = await Promise.all(
      [
        "https://cdn.example/wolf.png?size=64",
        "https://cdn.example/wolf.gif#frag",
        "https://cdn.example/",
      ].map(async (url) => (await MessagePayload.resolveFile(url)).name),
    );

    expect(names).toEqual(["wolf.png", "wolf.gif", "file.jpg"]);
  });

  test("GIVEN a fetched webhook THEN its guild and channel come from the cache", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, { id: guildId, name: "Pack" } as never);
    await client.cache!.channels.set(channelId, {
      id: channelId,
      type: 0,
      name: "general",
      guild_id: guildId,
    } as never);
    vi.spyOn(container.rest, "get").mockResolvedValue({
      id: webhookId,
      type: WebhookType.Incoming,
      guild_id: guildId,
      channel_id: channelId,
      name: "Howler",
      avatar: null,
      application_id: null,
      token,
    });

    const webhook = await client.webhooks.fetch(webhookId, token);

    expect(webhook).toBeInstanceOf(Webhook);
    expect(webhook.guild?.id).toBe(guildId);
    expect(webhook.channel?.id).toBe(channelId);
    expect(webhook.client).toBe(client);
  });
});

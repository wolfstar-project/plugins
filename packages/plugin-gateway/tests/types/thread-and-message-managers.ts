// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the options of
// `threads.create` follow discord.js' `GuildTextThreadCreateOptions` and `GuildForumThreadCreateOptions`, and the
// signatures of `crosspost` and of sending a message follow `GuildMessageManager` and `ChannelManager#createMessage`.
import type { ChannelType, ThreadAutoArchiveDuration } from "discord-api-types/v10";
import type {
  AnyThreadChannel,
  ChannelMessageManager,
  DMChannel,
  ForumChannel,
  GatewayClient,
  Message,
  MessagePayload,
  TextChannel,
  ThreadCreateOptions,
} from "../../src/index.js";

declare const text: TextChannel;
declare const forum: ForumChannel;
declare const client: GatewayClient;
declare const payload: MessagePayload;
declare const archive: ThreadAutoArchiveDuration;
declare const privateThread: ChannelType.PrivateThread;

// A thread takes `type` and `invitable`, a forum or media post takes `message` and `appliedTags`.
export const thread: Promise<AnyThreadChannel> = text.threads.create({
  name: "hunt",
  type: privateThread,
  invitable: false,
  autoArchiveDuration: archive,
  rateLimitPerUser: 30,
  reason: "why",
});
export const post: Promise<AnyThreadChannel> = forum.threads.create({
  name: "Pack news",
  message: "Awoo",
  appliedTags: ["1"],
  autoArchiveDuration: archive,
  rateLimitPerUser: 30,
});
export const postWithPayload: Promise<AnyThreadChannel> = client.threads.create("1", {
  name: "Pack news",
  message: payload,
});

// The options of one kind are a compile error with the other.
// @ts-expect-error a thread without a message has no tags
void text.threads.create({ name: "hunt", appliedTags: ["1"] });
// @ts-expect-error a post is always a public thread
void forum.threads.create({ name: "hunt", message: "Awoo", type: privateThread });
// @ts-expect-error a post is always a public thread
void forum.threads.create({ name: "hunt", message: "Awoo", invitable: true });

// `message` tells the two apart.
declare const options: ThreadCreateOptions;
if (options.message === undefined) {
  const noTags: undefined = options.appliedTags;
  void noTags;
} else {
  // @ts-expect-error a post has no thread type
  const type: ChannelType = options.type;
  void type;
}

// `crosspost` takes a message or its ID and resolves to the published message, like `GuildMessageManager#crosspost`.
declare const messages: ChannelMessageManager;
declare const message: Message;
export const published: Promise<Message> = messages.crosspost("1");
export const publishedByStructure: Promise<Message> = messages.crosspost(message);
export const publishedByClient: Promise<Message> = client.messages.crosspost("1", "2");
// @ts-expect-error a number is not a message
void messages.crosspost(1);

// `ChannelManager#createMessage` takes a channel or its ID, and a string, options, or a payload.
export const created: Promise<Message> = client.channels.createMessage("1", "hi");
export const createdByStructure: Promise<Message> = client.channels.createMessage(text, {
  content: "hi",
});
export const createdPayload: Promise<Message> = client.channels.createMessage("1", payload);
// @ts-expect-error a number is not a message
void client.channels.createMessage("1", 1);
// @ts-expect-error a number is not a channel
void client.channels.createMessage(1, "hi");

// `client.messages.send` does the same with an ID.
export const sent: Promise<Message> = client.messages.send("1", "hi");
export const sentOptions: Promise<Message> = client.messages.send("1", { content: "hi" });
export const sentPayload: Promise<Message> = client.messages.send("1", payload);
export const sentByChannel: Promise<Message> = text.send({ content: "hi" });
export const sentByManager: Promise<Message> = text.messages.send("hi");
// @ts-expect-error a number is not a message
void client.messages.send("1", 1);

// A direct message has the same manager, and `crosspost` throws there at runtime.
declare const dm: DMChannel;
export const dmMessages: ChannelMessageManager = dm.messages;

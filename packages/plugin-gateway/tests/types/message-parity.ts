// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: `Message` follows
// discord.js' typings.
import type {
  Guild,
  GroupDMChannel,
  Message,
  MessageMentions,
  MessageSnapshot,
  PartialMessage,
  SharedClientTheme,
  TextBasedChannel,
  TextChannel,
  Webhook,
} from "../../src/index.js";

declare const message: Message;
declare const inGuild: Message<true>;
declare const outside: Message<false>;
declare const either: Message | PartialMessage;
declare const groupDm: GroupDMChannel;
declare const text: TextChannel;

export const guildId: string = inGuild.guildId;
export const noGuildId: null = outside.guildId;
export const maybeGuildId: string | null = message.guildId;
export const noGuild: null = outside.guild;
export const guild: Guild | null = inGuild.guild;
export const mentionsGuild: Guild | null = (inGuild.mentions as MessageMentions<true>).guild;
export const noMentionsGuild: null = (outside.mentions as MessageMentions<false>).guild;
export const channel: TextBasedChannel | null = outside.channel;

if (message.inGuild()) {
  const narrowed: Message<true> = message;
  void narrowed;
}

// `partial` is the discriminant between a message and a partial one.
if (either.partial) {
  const partial: PartialMessage = either;
  // @ts-expect-error a partial message may lack its content
  const content: string = either.content;
  void partial;
  void content;
} else {
  const full: Message = either;
  void full;
}

// @ts-expect-error a partial message is not a message
export const notAMessage: Message = null as unknown as PartialMessage;

export const isFalse: false = message.partial;

// `reply` and `edit` never resolve to a message of a group DM.
export async function omitted() {
  const reply = await message.reply("hi");
  const replyChannel: Exclude<typeof reply.channel, GroupDMChannel> = reply.channel;
  const edited = await message.edit("hi");
  const editedChannel: Exclude<typeof edited.channel, GroupDMChannel> = edited.channel;
  void replyChannel;
  void editedChannel;
  await message.fetch(false);
  await message.fetch();
}

// `forward` takes an ID or a channel, but not a group DM.
void message.forward("1");
void message.forward(text);
// @ts-expect-error a group DM channel can not be forwarded to
void message.forward(groupDm);

// A snapshot carries only the data a forwarded message keeps.
declare const snapshot: MessageSnapshot;
export const snapshotContent: string = snapshot.content;
export const snapshotPartial: true = snapshot.partial;
export const snapshotAuthor: unknown = snapshot.author;

export const theme: SharedClientTheme | null = message.sharedClientTheme;
export const webhook: Promise<Webhook> = message.fetchWebhook();

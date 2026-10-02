// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the members sharing a
// name with discord.js have its return types.
import type { Collection } from "@discordjs/collection";
import type {
  Attachment,
  GatewayEventMap,
  Message,
  MessageReaction,
  Sticker,
  User,
} from "../../src/index.js";

declare const message: Message;
declare const reaction: MessageReaction;
declare const user: User;
declare const removeAll: GatewayEventMap["messageReactionRemoveAll"];

export const attachments: Collection<string, Attachment> = message.attachments;
export const stickers: Collection<string, Sticker> = message.stickers;
export const snapshots: Collection<string, Message> = message.messageSnapshots;
export const reactions: Collection<string, MessageReaction> = message.reactions.cache;
export const reacted: Promise<MessageReaction> = message.react("🐺");
export const reactedAgain: Promise<MessageReaction> = reaction.react();
export const removedAll: Collection<string, MessageReaction> = removeAll[1];
export const value: string | User = user.valueOf();

// @ts-expect-error `react()` no longer resolves to the message.
export const notTheMessage: Promise<Message> = message.react("🐺");

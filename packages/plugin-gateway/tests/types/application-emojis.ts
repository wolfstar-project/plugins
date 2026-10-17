// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`:
// `client.application.emojis` is fetch-only and its methods resolve to discord.js's types.
import type { Collection } from "@discordjs/collection";
import type {
  ApplicationEmoji,
  ApplicationEmojiManager,
  ClientApplication,
  Emoji,
  GatewayClient,
  User,
} from "../../src/index.js";

declare const client: GatewayClient;
declare const emoji: ApplicationEmoji;

export const manager: ApplicationEmojiManager = client.application.emojis;
export const viaApplication: ClientApplication = emoji.application;
export const one: Promise<ApplicationEmoji> = client.application.emojis.fetch("1");
export const all: Promise<Collection<string, ApplicationEmoji>> = client.application.emojis.fetch();
export const created: Promise<ApplicationEmoji> = client.application.emojis.create({
  attachment: "data:image/png;base64,AAAA",
  name: "howl",
});
export const edited: Promise<ApplicationEmoji> = client.application.emojis.edit(emoji, {
  name: "awoo",
});
export const deleted: Promise<void> = client.application.emojis.delete("1");
export const author: User = emoji.author;
export const fetchedAuthor: Promise<User> = emoji.fetchAuthor();
export const renamed: Promise<ApplicationEmoji> = emoji.setName("awoo");
export const base: Emoji = emoji;
export const same: boolean = emoji.equals({ id: "1", name: "howl" });

// @ts-expect-error `emojis` is read-only.
client.application.emojis = manager;

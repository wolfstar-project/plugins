// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the small manager
// methods read like discord.js's.
import type { Awaitable } from "@wolfstar/plugin-cache";
import type {
  CacheRead,
  Guild,
  GuildChannelManager,
  GuildEmojiManager,
  GuildManager,
} from "../../src/index.js";

declare const guild: Guild;
declare const guilds: GuildManager;
declare const channels: GuildChannelManager;
declare const emojis: GuildEmojiManager;

export const count: CacheRead<number> = channels.channelCountWithoutThreads;
export const widget: string = guilds.widgetImageURL(guild);
export const identifier: Awaitable<string | null> = emojis.resolveIdentifier("🐺");
export const cache = guilds.valueOf();

// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the small manager
// methods read like discord.js's.
import type { Collection } from "@discordjs/collection";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type {
  CacheRead,
  Guild,
  GuildChannelManager,
  GuildEmojiManager,
  GuildManager,
  GuildSoundboardSoundsRequestOptions,
  SoundboardSound,
} from "../../src/index.js";

declare const guild: Guild;
declare const guilds: GuildManager;
declare const channels: GuildChannelManager;
declare const emojis: GuildEmojiManager;
declare const soundboardOptions: GuildSoundboardSoundsRequestOptions;

export const count: CacheRead<number> = channels.channelCountWithoutThreads;
export const widget: string = guilds.widgetImageURL(guild);
export const identifier: Awaitable<string | null> = emojis.resolveIdentifier("🐺");
export const cache = guilds.valueOf();
export const soundboardSounds: Promise<Collection<string, Collection<string, SoundboardSound>>> =
  guilds.fetchSoundboardSounds(["1"], soundboardOptions);

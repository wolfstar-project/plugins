// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the discord.js
// `*Resolvable` types accept the structures of this package and reject the ones they do not cover.
import type { Awaitable } from "@wolfstar/plugin-cache";
import type {
  AnyChannel,
  ChannelResolvable,
  ColorResolvable,
  DMChannel,
  GatewayClient,
  GuildBasedChannel,
  GuildChannelResolvable,
  GuildMember,
  GuildResolvable,
  Presence,
  PresenceResolvable,
  ThreadMember,
  Message,
  PermissionOverwriteResolvable,
  PublicThreadChannel,
  Role,
  TextBasedChannelResolvable,
  ThreadChannelResolvable,
  User,
  UserResolvable,
  VoiceBasedChannel,
  VoiceChannel,
} from "../../src/index.js";

declare const client: GatewayClient;
declare const channel: AnyChannel;
declare const dm: DMChannel;
declare const member: GuildMember;
declare const message: Message;
declare const role: Role;
declare const thread: PublicThreadChannel;
declare const threadMember: ThreadMember;
declare const presence: Presence;
declare const user: User;
declare const voice: VoiceChannel;

export const anyChannel: ChannelResolvable = channel;
export const threadChannel: ThreadChannelResolvable = thread;
export const textBased: TextBasedChannelResolvable = voice;
export const voiceBased: VoiceBasedChannel = voice;
export const users: UserResolvable[] = [user, member, message, "123456789012345678"];
export const presences: PresenceResolvable[] = [
  presence,
  user,
  member,
  message,
  threadMember,
  "123456789012345678",
];
export const resolvedPresence: Awaitable<Presence | null> = client.presences.resolve(member);
export const resolvedPresenceInGuild: Awaitable<Presence | null> = client.presences.resolve(
  "123456789012345678",
  "123456789012345678",
);
export const presenceUserId: string | null = client.presences.resolveId(threadMember);
export const overwriteTargets: PermissionOverwriteResolvable[] = [role, user, member];
export const guilds: GuildResolvable[] = [member, role, voice, "123456789012345678"];
export const colors: ColorResolvable[] = [
  0xffffff,
  "#ffffff",
  "Blurple",
  "Random",
  [255, 255, 255],
];

// @ts-expect-error DM channels do not belong to a guild.
export const guildChannel: GuildChannelResolvable = dm;
// @ts-expect-error `GuildBasedChannel` excludes DM channels.
export const guildBased: GuildBasedChannel = dm;
// @ts-expect-error Threads are not a guild's direct channels.
export const guildFromThread: GuildResolvable = thread;
// @ts-expect-error Unknown color names are rejected.
export const badColor: ColorResolvable = "NotAColor";
// @ts-expect-error A role is not something holding a user.
export const presenceFromRole: PresenceResolvable = role;
// @ts-expect-error The guild ID is a string.
export const presenceGuildNumber = client.presences.resolve("123456789012345678", 1);

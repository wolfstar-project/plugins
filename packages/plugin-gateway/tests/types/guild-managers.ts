// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the managers of a guild
// are the client's, built for that guild: their methods lose the `guildId` argument, and their cache takes one ID.
import type { Awaitable } from "@wolfstar/plugin-cache";
import type {
  Cache,
  GatewayClient,
  Guild,
  GuildMember,
  GuildMemberManager,
  Presence,
  PresenceManager,
  Role,
  RoleManager,
  VoiceState,
  VoiceStateManager,
} from "../../src/index.js";

declare const guild: Guild;
declare const client: GatewayClient;

// The same classes as the client's managers.
export const members: GuildMemberManager<true> = guild.members;
export const roles: RoleManager<true> = guild.roles;
export const guildVoiceStates: VoiceStateManager<true> = guild.voiceStates;
export const guildPresences: PresenceManager<true> = guild.presences;
export const clientMembers: GuildMemberManager = client.members;

// The client's managers keep the guild's ID.
export const clientKicked: Promise<void> = client.members.kick("10", "1", "reason");
export const clientMe: Awaitable<GuildMember | null> = client.members.me("10");
export const clientFetched: Promise<Role> = client.roles.fetch("10", "1", { force: true });

export const memberCache: Cache<GuildMember> = guild.members.cache;
export const cachedMember: Awaitable<GuildMember | undefined> = guild.members.cache.get("1");
export const me: GuildMember | null = guild.members.me;
export const fetchedMember: Promise<GuildMember> = guild.members.fetch("1");
export const forcedMember: Promise<GuildMember> = guild.members.fetch("1", { force: true });
export const kicked: Promise<void> = guild.members.kick("1", "reason");
export const listed: Promise<GuildMember[]> = guild.members.list({ limit: 10 });
export const pruned: Promise<number | null> = guild.members.prune();

export const cachedRole: Awaitable<Role | undefined> = guild.roles.cache.get("1");
export const created: Promise<Role> = guild.roles.create({ name: "pack" });
export const everyone: Promise<Role> = guild.roles.everyone();
export const moved: Promise<Role[]> = guild.roles.setPosition("1", 2, { relative: true });

export const cachedVoiceState: Awaitable<VoiceState | undefined> = guild.voiceStates.cache.get("1");
export const voiceStates: Promise<VoiceState[]> = guild.voiceStates.listCached();

export const cachedPresence: Awaitable<Presence | undefined> = guild.presences.cache.get("1");
export const presences: Promise<Presence[]> = guild.presences.listCached();

// The guild's ID is not an argument anymore.
// @ts-expect-error -- `kick` takes the user ID and the reason
void guild.members.kick("10", "1", "reason");
// @ts-expect-error -- `fetch` takes one ID
void guild.roles.fetch("10", "1");
// @ts-expect-error -- `listCached` takes no argument
void guild.voiceStates.listCached("10");
// @ts-expect-error -- the client's manager needs the guild's ID
void client.members.kick("1");

import type { GatewayClient } from "../GatewayClient.js";
import type { CachedManager } from "../managers/CachedManager.js";

/**
 * The entities of `@wolfstar/plugin-cache` a manager builds structures for.
 *
 * @internal
 */
export const ManagedEntityNames = [
  "autoModerationRules",
  "bans",
  "channels",
  "emojis",
  "guilds",
  "integrations",
  "invites",
  "members",
  "messages",
  "presences",
  "roles",
  "scheduledEvents",
  "soundboardSounds",
  "stageInstances",
  "stickers",
  "threadMembers",
  "threads",
  "users",
  "voiceStates",
] as const;

export type ManagedEntityName = (typeof ManagedEntityNames)[number];

type AnyManager = CachedManager<any, any, any>;

function guildIdOf(data: object): string {
  return (data as { guild_id?: string }).guild_id ?? "";
}

const managers: {
  [Name in ManagedEntityName]: (client: GatewayClient, data: object) => AnyManager;
} = {
  autoModerationRules: (client, data) => client.guilds.autoModerationRules(guildIdOf(data)),
  bans: (client, data) => client.guilds.bans(guildIdOf(data)),
  channels: (client) => client.channels,
  emojis: (client, data) => client.guilds.emojis(guildIdOf(data)),
  guilds: (client) => client.guilds,
  integrations: (client, data) => client.guilds.integrations(guildIdOf(data)),
  invites: (client, data) => client.guilds.invites(guildIdOf(data)),
  members: (client) => client.members,
  messages: (client) => client.messages,
  presences: (client) => client.presences,
  roles: (client) => client.roles,
  scheduledEvents: (client, data) => client.guilds.scheduledEvents(guildIdOf(data)),
  soundboardSounds: (client, data) => client.guilds.soundboardSounds(guildIdOf(data)),
  stageInstances: (client, data) => client.guilds.stageInstances(guildIdOf(data)),
  stickers: (client, data) => client.guilds.stickers(guildIdOf(data)),
  threadMembers: (client) => client.threadMembers,
  threads: (client) => client.threads,
  users: (client) => client.users,
  voiceStates: (client) => client.voiceStates,
};

/**
 * Gets the manager building the structures of an entity. Guild-scoped managers are created for the guild the data
 * belongs to.
 *
 * @param client The client.
 * @param name The name of the entity.
 * @param data The raw data the manager is needed for.
 * @internal
 */
export function managerOf(
  client: GatewayClient,
  name: ManagedEntityName,
  data: object,
): AnyManager {
  return managers[name](client, data);
}

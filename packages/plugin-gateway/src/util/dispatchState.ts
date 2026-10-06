import { Collection } from "@discordjs/collection";
import type { Awaitable } from "@wolfstar/plugin-cache";
import { GatewayDispatchEvents } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { MessageReaction } from "../structures/messages/MessageReaction.js";
import { bindClient } from "../structures/Structure.js";

/**
 * Carries the previous state a dispatch handler reads before the cache write (`DispatchHandler#before`) across
 * processes: {@link DispatchStateCodec.serialize} turns it into plain, codec-safe data on the gateway process, and
 * {@link DispatchStateCodec.revive} builds the structures again on a worker.
 */
export interface DispatchStateCodec {
  serialize(state: unknown): unknown;
  /**
   * @param client The client of the worker.
   * @param state What `serialize` returned, after a trip through the wire.
   * @param data The dispatch data.
   */
  revive(client: GatewayClient, state: unknown, data: any): Awaitable<unknown>;
}

type Hydrator = { _build(data: any): Awaitable<unknown> };
type ManagerOf = (client: GatewayClient, data: any) => Hydrator;
type Serializable = { toJSON(): unknown };

// `_build`, not `_resolveData`: the latter returns the cached entity, which the dispatch has already updated.
function single(manager: ManagerOf): DispatchStateCodec {
  return {
    serialize: (state) => (state === undefined ? undefined : (state as Serializable).toJSON()),
    revive: (client, state, data) =>
      state === undefined ? undefined : manager(client, data)._build(state),
  };
}

function list(manager: ManagerOf, scope: (data: any) => object = () => ({})): DispatchStateCodec {
  return {
    serialize: (state) =>
      Array.isArray(state) ? state.map((item) => (item as Serializable).toJSON()) : undefined,
    revive: (client, state, data) =>
      Array.isArray(state)
        ? Promise.all(
            state.map((item) => manager(client, data)._build({ ...item, ...scope(data) })),
          )
        : undefined,
  };
}

// A cache failure leaves the relation unresolved: the previous state is still worth emitting.
async function cachedOrUndefined<T>(read: () => Awaitable<T | undefined>): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

async function reviveReaction(client: GatewayClient, json: any, data: any) {
  const messages = client.messages;
  const message = await cachedOrUndefined(() =>
    messages.cache.get(messages.resolveKey(data.channel_id, data.message_id)),
  );
  const emojiId = json?.emoji?.id as string | null | undefined;
  const cachedEmoji =
    data.guild_id && emojiId
      ? await cachedOrUndefined(() => {
          const emojis = client.guilds.emojis(data.guild_id);
          return emojis.cache.get(emojis.resolveKey(emojiId));
        })
      : undefined;

  return bindClient(
    new MessageReaction(
      { channel_id: data.channel_id, message_id: data.message_id, ...json },
      { message: message ?? null, emoji: cachedEmoji ?? null },
    ),
    client,
  );
}

const reaction: DispatchStateCodec = {
  serialize: (state) => (state === undefined ? undefined : (state as Serializable).toJSON()),
  revive: (client, state, data) =>
    state === undefined ? undefined : reviveReaction(client, state, data),
};

// A collection of reactions by emoji, see `ReactionManager#cache`: it travels as the list of its values.
const reactions: DispatchStateCodec = {
  serialize: (state) =>
    state instanceof Collection ? state.map((item) => (item as Serializable).toJSON()) : undefined,
  revive: async (client, state, data) => {
    if (!Array.isArray(state)) return undefined;
    const revived = await Promise.all(state.map((item) => reviveReaction(client, item, data)));
    return new Collection(revived.map((item) => [item.valueOf(), item]));
  },
};

/**
 * How the state of each dispatch type that has a `before` travels, see {@link DispatchStateCodec}.
 *
 * @remarks
 * A handler that gains a `before` needs an entry here; `tests/dispatch-state.test.ts` fails otherwise.
 */
export const DispatchStateCodecs: { [Type in GatewayDispatchEvents]?: DispatchStateCodec } = {
  [GatewayDispatchEvents.GuildUpdate]: single((client) => client.guilds),
  [GatewayDispatchEvents.GuildDelete]: single((client) => client.guilds),
  [GatewayDispatchEvents.ChannelUpdate]: single((client) => client.channels),
  [GatewayDispatchEvents.VoiceChannelStatusUpdate]: single((client) => client.channels),
  [GatewayDispatchEvents.VoiceChannelStartTimeUpdate]: single((client) => client.channels),
  [GatewayDispatchEvents.ThreadUpdate]: single((client) => client.threads),
  [GatewayDispatchEvents.ThreadDelete]: single((client) => client.threads),
  [GatewayDispatchEvents.ThreadMemberUpdate]: single((client) => client.threadMembers),
  [GatewayDispatchEvents.ThreadMembersUpdate]: list(
    (client) => client.threadMembers,
    (data) => ({ id: data.id, guild_id: data.guild_id }),
  ),
  [GatewayDispatchEvents.MessageUpdate]: single((client) => client.messages),
  [GatewayDispatchEvents.MessageDelete]: single((client) => client.messages),
  [GatewayDispatchEvents.MessageDeleteBulk]: list((client) => client.messages),
  [GatewayDispatchEvents.MessageReactionRemoveAll]: reactions,
  [GatewayDispatchEvents.MessageReactionRemoveEmoji]: reaction,
  [GatewayDispatchEvents.GuildMemberUpdate]: single((client) => client.members),
  [GatewayDispatchEvents.GuildMemberRemove]: single((client) => client.members),
  [GatewayDispatchEvents.GuildRoleUpdate]: single((client) => client.roles),
  [GatewayDispatchEvents.GuildRoleDelete]: single((client) => client.roles),
  [GatewayDispatchEvents.InviteDelete]: single((client, data) =>
    client.guilds.invites(data.guild_id),
  ),
  [GatewayDispatchEvents.VoiceStateUpdate]: single((client) => client.voiceStates),
  [GatewayDispatchEvents.PresenceUpdate]: single((client) => client.presences),
  [GatewayDispatchEvents.GuildScheduledEventUpdate]: single((client, data) =>
    client.guilds.scheduledEvents(data.guild_id),
  ),
  [GatewayDispatchEvents.StageInstanceUpdate]: single((client, data) =>
    client.guilds.stageInstances(data.guild_id),
  ),
  [GatewayDispatchEvents.GuildSoundboardSoundUpdate]: single((client, data) =>
    client.guilds.soundboardSounds(data.guild_id),
  ),
  [GatewayDispatchEvents.GuildSoundboardSoundDelete]: single((client, data) =>
    client.guilds.soundboardSounds(data.guild_id),
  ),
  [GatewayDispatchEvents.GuildBanRemove]: single((client, data) =>
    client.guilds.bans(data.guild_id),
  ),
  [GatewayDispatchEvents.AutoModerationRuleUpdate]: single((client, data) =>
    client.guilds.autoModerationRules(data.guild_id),
  ),
  [GatewayDispatchEvents.IntegrationUpdate]: single((client, data) =>
    client.guilds.integrations(data.guild_id),
  ),
  [GatewayDispatchEvents.IntegrationDelete]: single((client, data) =>
    client.guilds.integrations(data.guild_id),
  ),
  [GatewayDispatchEvents.UserUpdate]: single((client) => client.users),
  [GatewayDispatchEvents.GuildEmojisUpdate]: list(
    (client, data) => client.guilds.emojis(data.guild_id),
    (data) => ({ guild_id: data.guild_id }),
  ),
  [GatewayDispatchEvents.GuildStickersUpdate]: list(
    (client, data) => client.guilds.stickers(data.guild_id),
    (data) => ({ guild_id: data.guild_id }),
  ),
};

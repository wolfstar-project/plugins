import { GatewayDispatchEvents, type GatewayDispatchPayload } from "discord-api-types/v10";
import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { GatewayEventMap, GatewayEventName } from "./events.js";

/**
 * The data of the dispatch of type `Type`.
 */
export type DispatchData<Type extends GatewayDispatchEvents> = Extract<
  GatewayDispatchPayload,
  { t: Type }
>["d"];

/**
 * Describes how a gateway dispatch turns into a {@link GatewayEventMap} event.
 *
 * @typeParam Type The dispatch type.
 * @typeParam Event The event emitted for it.
 */
export interface DispatchHandler<
  Type extends GatewayDispatchEvents,
  Event extends GatewayEventName,
> {
  /**
   * The event to emit.
   */
  event: Event;
  /**
   * Runs before the dispatch is written to the cache, used to read the previous state of the entity.
   */
  before?(client: GatewayClient, data: DispatchData<Type>): Promise<unknown>;
  /**
   * Runs after the dispatch is written to the cache, and builds the arguments of the event.
   *
   * @param state The value `before` resolved to, if any.
   */
  build(
    client: GatewayClient,
    data: DispatchData<Type>,
    state: any,
    shardId: number,
  ): Awaitable<GatewayEventMap[Event]>;
}

/**
 * A {@link DispatchHandler} for the dispatch of type `Type`, emitting any event.
 */
export type AnyDispatchHandler<Type extends GatewayDispatchEvents> = {
  [Event in GatewayEventName]: DispatchHandler<Type, Event>;
}[GatewayEventName];

/**
 * The table mapping every supported dispatch to its event.
 *
 * @remarks
 * `INTERACTION_CREATE` is deliberately absent: interactions are served by the HTTP endpoint, and the gateway may
 * deliver some of them as well. Dispatches without an entry are still written to the cache and emitted as `raw`.
 */
export const DispatchHandlers: { [Type in GatewayDispatchEvents]?: AnyDispatchHandler<Type> } = {
  [GatewayDispatchEvents.Ready]: {
    event: "shardReady",
    build: (client, data, _state, shardId) => {
      const user = client.users.createStructure(data.user);
      client.user = user;
      return [shardId, user];
    },
  },

  [GatewayDispatchEvents.GuildCreate]: {
    event: "guildCreate",
    // The cached entry has the collections stripped, prefer it over the (much larger) payload.
    build: async (client, data) => [
      (await client.guilds.get(data.id)) ??
        client.guilds.createStructure(data as CacheEntityTypes["guilds"]),
    ],
  },
  [GatewayDispatchEvents.GuildUpdate]: {
    event: "guildUpdate",
    before: (client, data) => client.guilds.get(data.id),
    build: (client, data, previous) => [previous ?? null, client.guilds.createStructure(data)],
  },
  [GatewayDispatchEvents.GuildDelete]: {
    event: "guildDelete",
    before: (client, data) => client.guilds.get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.ChannelCreate]: {
    event: "channelCreate",
    build: (client, data) => [client.channels.createStructure(data)],
  },
  [GatewayDispatchEvents.ChannelUpdate]: {
    event: "channelUpdate",
    before: (client, data) => client.channels.get(data.id),
    build: (client, data, previous) => [previous ?? null, client.channels.createStructure(data)],
  },
  [GatewayDispatchEvents.ChannelDelete]: {
    event: "channelDelete",
    build: (client, data) => [client.channels.createStructure(data)],
  },

  [GatewayDispatchEvents.ThreadCreate]: {
    event: "threadCreate",
    build: (client, data) => [client.threads.createStructure(data)],
  },
  [GatewayDispatchEvents.ThreadUpdate]: {
    event: "threadUpdate",
    before: (client, data) => client.threads.get(data.id),
    build: (client, data, previous) => [previous ?? null, client.threads.createStructure(data)],
  },
  [GatewayDispatchEvents.ThreadDelete]: {
    event: "threadDelete",
    before: (client, data) => client.threads.get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.MessageCreate]: {
    event: "messageCreate",
    build: (client, data) => [client.messages.createStructure(data)],
  },
  [GatewayDispatchEvents.MessageUpdate]: {
    event: "messageUpdate",
    before: (client, data) => client.messages.get(data.channel_id, data.id),
    build: (client, data, previous) => [previous ?? null, client.messages.createStructure(data)],
  },
  [GatewayDispatchEvents.MessageDelete]: {
    event: "messageDelete",
    before: (client, data) => client.messages.get(data.channel_id, data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },
  [GatewayDispatchEvents.MessageDeleteBulk]: {
    event: "messageDeleteBulk",
    before: async (client, data) => {
      const messages = await Promise.all(
        data.ids.map((id) => client.messages.get(data.channel_id, id)),
      );
      return messages.filter((message) => message !== undefined);
    },
    build: (_client, data, previous) => [previous ?? [], data],
  },

  [GatewayDispatchEvents.GuildMemberAdd]: {
    event: "guildMemberAdd",
    build: (client, data) => [client.members.createStructure(data)],
  },
  [GatewayDispatchEvents.GuildMemberUpdate]: {
    event: "guildMemberUpdate",
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    // The payload is partial: prefer the cached entry, which it was merged into.
    build: async (client, data, previous) => [
      previous ?? null,
      (await client.members.get(data.guild_id, data.user.id)) ??
        client.members.createStructure(data as CacheEntityTypes["members"]),
    ],
  },
  [GatewayDispatchEvents.GuildMemberRemove]: {
    event: "guildMemberRemove",
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.GuildRoleCreate]: {
    event: "guildRoleCreate",
    build: (client, data) => [
      client.roles.createStructure({ ...data.role, guild_id: data.guild_id }),
    ],
  },
  [GatewayDispatchEvents.GuildRoleUpdate]: {
    event: "guildRoleUpdate",
    before: (client, data) => client.roles.get(data.guild_id, data.role.id),
    build: (client, data, previous) => [
      previous ?? null,
      client.roles.createStructure({ ...data.role, guild_id: data.guild_id }),
    ],
  },
  [GatewayDispatchEvents.GuildRoleDelete]: {
    event: "guildRoleDelete",
    before: (client, data) => client.roles.get(data.guild_id, data.role_id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.UserUpdate]: {
    event: "userUpdate",
    before: (client, data) => client.users.get(data.id),
    build: (client, data, previous) => {
      const user = client.users.createStructure(data);
      if (client.user?.id === user.id) client.user = user;
      return [previous ?? null, user];
    },
  },
};

import {
  OverwriteType,
  PermissionFlagsBits,
  type APIOverwrite,
  type APIRole,
  type Snowflake,
} from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { Role } from "../structures/guilds/Role.js";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import type { Awaitable } from "@wolfstar/plugin-cache";
import { peekCache, whenAll } from "./cache.js";
import { getGatewayClient } from "./container.js";
import { PermissionsBitField } from "./PermissionsBitField.js";
import { GatewayError } from "../errors/GatewayError.js";

/**
 * What {@link computeGuildPermissions} needs to know about a member of a guild.
 */
export interface GuildPermissionsContext {
  guildId: Snowflake;
  ownerId: Snowflake;
  userId: Snowflake;
  /**
   * The IDs of the member's roles, without `@everyone`.
   */
  memberRoleIds: readonly Snowflake[];
  /**
   * Every role of the guild, `@everyone` (whose ID is the guild's) included.
   */
  roles: readonly Pick<APIRole, "id" | "permissions">[];
}

/**
 * Computes a member's guild-wide permissions, the way Discord does before channel overwrites apply: the owner and
 * administrators get every permission, everyone else gets `@everyone`'s permissions combined with their roles'.
 *
 * @param context The member and the guild's roles.
 */
export function computeGuildPermissions(context: GuildPermissionsContext): PermissionsBitField {
  if (context.userId === context.ownerId) {
    return new PermissionsBitField(PermissionsBitField.All).freeze();
  }

  const granted = new Set([context.guildId, ...context.memberRoleIds]);
  let bits = 0n;
  for (const role of context.roles) {
    if (granted.has(role.id)) bits |= BigInt(role.permissions);
  }

  if ((bits & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator) {
    bits = PermissionsBitField.All;
  }

  return new PermissionsBitField(bits).freeze();
}

/**
 * Compares two roles the way Discord orders them: by position, then by ID for equal positions (older first).
 *
 * @returns A negative number when `a` is lower than `b`, a positive one when it is higher, `0` when they are the same.
 */
export function compareRolePositions(
  a: Pick<APIRole, "id" | "position">,
  b: Pick<APIRole, "id" | "position">,
): number {
  if (a.position !== b.position) return a.position - b.position;
  // Among equal positions, the older (lower ID) role is the higher one.
  return Number(BigInt(b.id) - BigInt(a.id));
}

/**
 * What {@link computeChannelPermissions} needs to know about a channel and whom the permissions are for.
 */
export interface ChannelPermissionsContext {
  guildId: Snowflake;
  /**
   * The ID of the member, whose own overwrite applies last. Absent when computing a role's permissions.
   */
  userId?: Snowflake;
  /**
   * The IDs of the roles whose overwrites apply, without `@everyone`.
   */
  roleIds: readonly Snowflake[];
  overwrites: readonly APIOverwrite[];
}

/**
 * Applies a channel's permission overwrites to guild-wide permissions, the way Discord does: administrators keep
 * every permission, then the `@everyone` overwrite applies, then the roles' overwrites (combined), then the member's.
 *
 * @param base The guild-wide permissions, from {@link computeGuildPermissions}.
 * @param context The channel's overwrites, and the member or role.
 */
export function computeChannelPermissions(
  base: Readonly<PermissionsBitField>,
  context: ChannelPermissionsContext,
): PermissionsBitField {
  if (base.has(PermissionFlagsBits.Administrator)) {
    return new PermissionsBitField(PermissionsBitField.All).freeze();
  }

  let bits = base.bitField;
  const apply = (allow: bigint, deny: bigint) => {
    bits = (bits & ~deny) | allow;
  };

  const everyone = context.overwrites.find((overwrite) => overwrite.id === context.guildId);
  if (everyone) apply(BigInt(everyone.allow), BigInt(everyone.deny));

  let allow = 0n;
  let deny = 0n;
  for (const overwrite of context.overwrites) {
    if (overwrite.type === OverwriteType.Role && context.roleIds.includes(overwrite.id)) {
      allow |= BigInt(overwrite.allow);
      deny |= BigInt(overwrite.deny);
    }
  }
  apply(allow, deny);

  const member = context.userId
    ? context.overwrites.find(
        (overwrite) => overwrite.type === OverwriteType.Member && overwrite.id === context.userId,
      )
    : undefined;
  if (member) apply(BigInt(member.allow), BigInt(member.deny));

  return new PermissionsBitField(bits).freeze();
}

/**
 * Computes the permissions of a member or role in a channel, given the channel's overwrites.
 *
 * @param guildId The ID of the channel's guild.
 * @param overwrites The channel's permission overwrites.
 * @param target A member, a role, or the ID of a member.
 */
export async function computeTargetPermissions(
  guildId: Snowflake,
  overwrites: readonly APIOverwrite[],
  target: GuildMember | Role | Snowflake,
): Promise<PermissionsBitField> {
  const client = getGatewayClient();
  if (typeof target !== "string" && "hoist" in target) {
    // A role gets `@everyone`'s permissions and its own, then the `@everyone` and role overwrites.
    const everyone = await client.roles.everyone(guildId);
    const base = new PermissionsBitField(
      target.permissions.bitField | everyone.permissions.bitField,
    );
    if (base.has(PermissionFlagsBits.Administrator)) {
      return new PermissionsBitField(PermissionsBitField.All).freeze();
    }

    return computeChannelPermissions(base, { guildId, roleIds: [target.id], overwrites });
  }

  const member = typeof target === "string" ? await client.members.fetch(guildId, target) : target;
  return computeChannelPermissions(await member.fetchPermissions(), {
    guildId,
    userId: member.id ?? undefined,
    roleIds: member.roleIds,
    overwrites,
  });
}

/**
 * Computes the permissions of a member or role in a channel, fetching the channel if needed. Threads use their parent
 * channel's overwrites, like Discord does.
 *
 * @param channel The channel, or its ID.
 * @param target A member, a role, or the ID of a member.
 */
export async function computePermissionsIn(
  channel: AnyChannel | Snowflake,
  target: GuildMember | Role | Snowflake,
): Promise<PermissionsBitField> {
  const client = getGatewayClient();
  let resolved = typeof channel === "string" ? await client.channels.fetch(channel) : channel;
  let data = resolved.toJSON() as OverwriteHolder;
  if (resolved.isThread() && data.parent_id) {
    resolved = await client.channels.fetch(data.parent_id);
    data = resolved.toJSON() as OverwriteHolder;
  }

  if (!data.guild_id) throw new GatewayError("ChannelGuildUnknown", resolved.id);
  return computeTargetPermissions(data.guild_id, data.permission_overwrites ?? [], target);
}

/**
 * Gets a guild from the cache, for the getters that cannot answer without it. Synchronous when the cache is.
 *
 * @param client The client.
 * @param guildId The ID of the guild.
 * @throws A `GatewayError` (`GuildUncached`) when the guild is not cached.
 * @internal
 */
export function requireGuild(client: GatewayClient, guildId: Snowflake): Awaitable<Guild> {
  return whenAll([client.guilds._getShallow(guildId)], ([guild]) => {
    if (!guild) throw new GatewayError("GuildUncached", guildId);
    return guild;
  });
}

/**
 * Gets the bot's own member of a guild from the cache, for the getters checking what the bot can do. Synchronous
 * when the cache is.
 *
 * @param client The client.
 * @param guildId The ID of the guild.
 * @throws A `GatewayError` (`GuildUncachedMe`) when the member is not cached.
 * @internal
 */
export function requireMe(client: GatewayClient, guildId: Snowflake): Awaitable<GuildMember> {
  return whenAll([client.members.me(guildId)], ([me]) => {
    if (!me) throw new GatewayError("GuildUncachedMe", guildId);
    return me;
  });
}

/**
 * {@link computeTargetPermissions} from the cache alone, never the API. Synchronous when the cache is.
 *
 * @param guildId The ID of the channel's guild.
 * @param overwrites The channel's permission overwrites.
 * @param target A member, a role, or the ID of a cached member.
 * @param client The client whose cache is read: the target's own by default, or the most recently constructed one
 * for an ID.
 * @throws A `GatewayError` (`GuildMemberUncached`, `GuildUncached`) when a needed entity is not cached.
 */
export function computeCachedTargetPermissions(
  guildId: Snowflake,
  overwrites: readonly APIOverwrite[],
  target: GuildMember | Role | Snowflake,
  client: GatewayClient = typeof target === "string" ? getGatewayClient() : target.client,
): Awaitable<PermissionsBitField> {
  if (typeof target !== "string" && "hoist" in target) {
    const { roles } = client;
    // Like every role that is not cached, a missing `@everyone` grants nothing.
    return whenAll([peekCache(roles.cache, roles.resolveKey(guildId, guildId))], ([everyone]) => {
      const base = new PermissionsBitField(
        target.permissions.bitField | (everyone?.permissions.bitField ?? 0n),
      );
      if (base.has(PermissionFlagsBits.Administrator)) {
        return new PermissionsBitField(PermissionsBitField.All).freeze();
      }

      return computeChannelPermissions(base, { guildId, roleIds: [target.id], overwrites });
    });
  }

  const { members } = client;
  const cached =
    typeof target === "string"
      ? whenAll([peekCache(members.cache, members.resolveKey(guildId, target))], ([member]) => {
          if (!member) throw new GatewayError("GuildMemberUncached", guildId, target);
          return member;
        })
      : target;

  return whenAll([cached], ([member]) =>
    whenAll([member.permissions], ([permissions]) =>
      computeChannelPermissions(permissions, {
        guildId,
        userId: member.id ?? undefined,
        roleIds: member.roleIds,
        overwrites,
      }),
    ),
  );
}

/**
 * {@link computePermissionsIn} from the cache alone, never the API: the channel, and the parent of a thread, are
 * read from it. Synchronous when the cache is.
 *
 * @param channel The channel, or the ID of a cached one.
 * @param target A member, a role, or the ID of a cached member.
 * @throws A `GatewayError` (`ChannelUncached`, `GuildMemberUncached`, `GuildUncached`) when a needed entity is not
 * cached.
 */
export function computeCachedPermissionsIn(
  channel: AnyChannel | Snowflake,
  target: GuildMember | Role | Snowflake,
): Awaitable<PermissionsBitField> {
  // The cache of the client either structure belongs to: an ID alone does not tell which client it is about.
  const client =
    typeof target !== "string"
      ? target.client
      : typeof channel !== "string"
        ? channel.client
        : getGatewayClient();
  const cachedChannel = (id: Snowflake): Awaitable<AnyChannel> =>
    whenAll([peekCache(client.channels.cache, id)], ([cached]) => {
      if (!cached) throw new GatewayError("ChannelUncached", id);
      return cached;
    });
  const parentOf = (resolved: AnyChannel): Awaitable<AnyChannel> => {
    const { parent_id: parentId } = resolved.toJSON() as OverwriteHolder;
    return resolved.isThread() && parentId ? cachedChannel(parentId) : resolved;
  };

  const given = typeof channel === "string" ? cachedChannel(channel) : channel;
  return whenAll([given], ([resolved]) =>
    whenAll([parentOf(resolved)], ([holder]) => {
      const data = holder.toJSON() as OverwriteHolder;
      if (!data.guild_id) throw new GatewayError("ChannelGuildUnknown", holder.id);
      return computeCachedTargetPermissions(
        data.guild_id,
        data.permission_overwrites ?? [],
        target,
        client,
      );
    }),
  );
}

type OverwriteHolder = {
  guild_id?: string;
  parent_id?: string | null;
  permission_overwrites?: APIOverwrite[];
};

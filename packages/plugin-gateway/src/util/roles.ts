import { Collection, type ReadonlyCollection } from "@discordjs/collection";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { Snowflake } from "discord-api-types/v10";
import { GatewayTypeError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import type { Role } from "../structures/guilds/Role.js";
import type { RoleResolvable } from "../types.js";
import { whenAll, whenCachedMap } from "./cache.js";

/**
 * Several roles: an array of {@link RoleResolvable}s, or a `Collection` of roles, as discord.js takes them.
 */
export type RoleResolvables = readonly RoleResolvable[] | ReadonlyCollection<Snowflake, Role>;

/**
 * Whether a value is several roles rather than a single one.
 *
 * @internal
 */
export function isRoleResolvables(value: unknown): value is RoleResolvables {
  return Array.isArray(value) || value instanceof Collection;
}

/**
 * Resolves a role or an ID to an ID.
 *
 * @returns The ID, or `null` if the value is neither.
 * @internal
 */
export function resolveRoleId(role: RoleResolvable): string | null {
  if (typeof role === "string") return role;
  const id = (role as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
}

/**
 * Resolves several roles to their IDs, without duplicates.
 *
 * @param roles The roles.
 * @throws {GatewayTypeError} `InvalidElement` when an element is neither a role nor an ID.
 * @internal
 */
export function resolveRoleIds(roles: RoleResolvables): string[] {
  const ids = new Set<string>();
  for (const role of roles.values()) {
    const id = resolveRoleId(role);
    if (id === null) {
      throw new GatewayTypeError("InvalidElement", "Array or Collection", "roles", role);
    }

    ids.add(id);
  }

  return [...ids];
}

/**
 * Reads the cached roles of some IDs into a `Collection`, skipping the ones that are not cached. Synchronous when
 * the role cache is.
 *
 * @param client The client.
 * @param guildId The ID of the guild of the roles.
 * @param ids The IDs of the roles.
 * @internal
 */
export function cachedRoles(
  client: GatewayClient,
  guildId: string,
  ids: Iterable<string>,
): Awaitable<Collection<Snowflake, Role>> {
  const { roles } = client;
  return whenAll(
    [whenCachedMap(ids, (id) => roles.cache.get(roles.resolveKey(guildId, id)))],
    ([cached]) => new Collection(cached),
  );
}

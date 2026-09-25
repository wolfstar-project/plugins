import { PermissionFlagsBits, type APIRole, type Snowflake } from "discord-api-types/v10";
import { PermissionsBitField } from "./PermissionsBitField.js";

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

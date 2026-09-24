import type { BitFieldResolvable } from "@discordjs/structures";
import type { PermissionFlagsBits } from "discord-api-types/v10";

export { PermissionsBitField } from "@discordjs/structures";

/**
 * The name of any permission.
 */
export type PermissionsString = keyof typeof PermissionFlagsBits;

/**
 * Anything a `PermissionsBitField` can be built from.
 */
export type PermissionResolvable = BitFieldResolvable<PermissionsString>;

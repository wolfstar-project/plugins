// The loosely typed objects the application command comparisons and transformations read: raw payloads, camel-cased
// data, structures, or whatever the caller passed.
export type Loose = Record<string, any>;

// `null` is a value here, it removes localizations: unlike `??`, only `undefined` falls back to the raw key.
export function firstDefined<Value>(
  camel: Value | undefined,
  snake: Value | undefined,
): Value | undefined {
  return camel === undefined ? snake : camel;
}

export function compact<Value extends Loose>(value: Value): Value {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

/**
 * Reads the guild a command is registered in from a resolvable: the `guildId` of an `ApplicationCommand`, or the
 * `guild_id` of a raw command.
 */
export function commandGuildId(command: unknown): string | undefined {
  if (typeof command !== "object" || command === null) return undefined;
  const { guildId, guild_id } = command as { guildId?: string | null; guild_id?: string | null };
  return guildId ?? guild_id ?? undefined;
}

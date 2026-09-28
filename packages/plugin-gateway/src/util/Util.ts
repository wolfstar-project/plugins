import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import { ChannelType, FormattingPatterns, type Snowflake } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { EmojiIdentifierResolvable } from "../structures/emojis/ReactionEmoji.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { Role } from "../structures/guilds/Role.js";
import type { User } from "../structures/users/User.js";
import type { ColorResolvable } from "../types.js";
import { whenAll, whenCachedMap } from "./cache.js";
import { Colors } from "./Colors.js";

/**
 * An emoji parsed from a string: a Unicode emoji has no `id`.
 */
export interface PartialEmoji {
  animated: boolean;
  name: string;
  id: Snowflake | undefined;
}

/**
 * An emoji known only by its ID.
 */
export interface PartialEmojiOnlyId {
  id: Snowflake;
}

/**
 * Matches a `name:id` or `a:name:id` pair without the mention brackets.
 */
const CustomEmojiPattern = /^(?:(?<animated>a):)?(?<name>\w{2,32}):(?<id>\d{17,20})$/;

/**
 * Matches an emoji ID.
 */
const SnowflakePattern = /^\d{17,20}$/;

/**
 * Parses an emoji out of a string: a Unicode emoji (URL-encoded or not), a custom emoji mention (`<a:name:id>`), or a
 * `name:id` pair.
 *
 * @param text The string to parse.
 * @returns The emoji, or `null` when the string holds a colon but no custom emoji.
 */
export function parseEmoji(text: string): PartialEmoji | null {
  const decoded = text.includes("%") ? decodeURIComponent(text) : text;
  if (!decoded.includes(":")) return { animated: false, name: decoded, id: undefined };

  const groups = (FormattingPatterns.Emoji.exec(decoded) ?? CustomEmojiPattern.exec(decoded))
    ?.groups;
  return groups ? { animated: Boolean(groups.animated), name: groups.name!, id: groups.id } : null;
}

/**
 * Resolves an emoji from anything {@link EmojiIdentifierResolvable}, without looking it up in a cache.
 *
 * @param emoji The emoji to resolve.
 * @returns The emoji, only its ID when given a bare ID, or `null` when the value identifies no emoji.
 */
export function resolvePartialEmoji(
  emoji: EmojiIdentifierResolvable,
): PartialEmoji | PartialEmojiOnlyId | null {
  if (typeof emoji === "string")
    return SnowflakePattern.test(emoji) ? { id: emoji } : parseEmoji(emoji);

  const { id, name, animated } = emoji;
  if (!name) return id ? { id } : null;
  return { id: id ?? undefined, name, animated: Boolean(animated) };
}

/**
 * Resolves a {@link ColorResolvable} to its number.
 *
 * @param color The color to resolve.
 * @throws A `TypeError` when the value is no color, a `RangeError` when it is outside `0x000000`-`0xffffff`.
 */
export function resolveColor(color: ColorResolvable): number {
  let resolved: number;

  if (typeof color === "string") {
    if (color === "Random") return Math.floor(Math.random() * (0xffffff + 1));
    if (/^#?[\da-f]{6}$/i.test(color)) return Number.parseInt(color.replace("#", ""), 16);
    resolved = (Colors as Record<string, number>)[color] ?? Number.NaN;
  } else if (Array.isArray(color)) {
    const [red, green, blue] = color as readonly [number, number, number];
    resolved = (red << 16) + (green << 8) + blue;
  } else {
    resolved = color as number;
  }

  if (!Number.isInteger(resolved))
    throw new TypeError(`Cannot resolve ${String(color)} to a color`);
  if (resolved < 0 || resolved > 0xffffff)
    throw new RangeError("Colors must be within 0x000000-0xffffff");
  return resolved;
}

/**
 * Something with a Discord position: a role or a guild channel, as a structure or raw API data.
 */
export interface PositionSortable {
  id: Snowflake;
  position: number;
  /**
   * The type of a channel: guild channels break position ties differently from roles.
   */
  type?: ChannelType;
}

/**
 * Sorts roles or guild channels the way Discord displays them, like discord.js's `discordSort`: by position, then,
 * among equal positions, older first for channels and newer first for roles.
 *
 * @param items The roles or channels to sort, not mixed.
 * @returns A new array, lowest position first.
 */
export function discordSort<Value extends PositionSortable>(items: Iterable<Value>): Value[] {
  const array = [...items];
  const isChannel = array[0]?.type !== undefined;
  return array.toSorted(
    isChannel
      ? (a, b) => a.position - b.position || compareSnowflakes(a.id, b.id)
      : (a, b) => a.position - b.position || compareSnowflakes(b.id, a.id),
  );
}

function compareSnowflakes(a: Snowflake, b: Snowflake): number {
  return Number(BigInt(a) - BigInt(b));
}

const TextSortableGroupTypes: readonly ChannelType[] = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
];
const VoiceSortableGroupTypes: readonly ChannelType[] = [
  ChannelType.GuildVoice,
  ChannelType.GuildStageVoice,
];
const CategorySortableGroupTypes: readonly ChannelType[] = [ChannelType.GuildCategory];

/**
 * The channel types a channel is ordered among, like discord.js's `getSortableGroupTypes`: text-like channels always
 * come before voice ones in a category, so each group has its own positions.
 *
 * @param type The type of the channel.
 * @internal
 */
export function getSortableGroupTypes(type: ChannelType): readonly ChannelType[] {
  switch (type) {
    case ChannelType.GuildText:
    case ChannelType.GuildAnnouncement:
    case ChannelType.GuildForum:
    case ChannelType.GuildMedia:
      return TextSortableGroupTypes;
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return VoiceSortableGroupTypes;
    case ChannelType.GuildCategory:
      return CategorySortableGroupTypes;
    default:
      return [type];
  }
}

/**
 * Moves an element of an array in place, like discord.js's `moveElementInArray`. An out of range target leaves the
 * array untouched.
 *
 * @param array The array.
 * @param element The element to move.
 * @param newIndex The index to move it to, or the offset to move it by with `offset`.
 * @param offset Whether `newIndex` is relative to the element's current index.
 * @returns The new index of the element.
 * @internal
 */
export function moveElementInArray<Value>(
  array: Value[],
  element: Value,
  newIndex: number,
  offset = false,
): number {
  const index = array.indexOf(element);
  const targetIndex = (offset ? index : 0) + newIndex;
  if (index > -1 && targetIndex > -1 && targetIndex < array.length) {
    const [removed] = array.splice(index, 1);
    array.splice(targetIndex, 0, removed!);
  }

  return array.indexOf(element);
}

/**
 * Computes the positions to send to Discord to move a role or channel among its sorted siblings: the body discord.js's
 * `setPosition` sends.
 *
 * @param id The ID of the role or channel to move.
 * @param position The index to move it to, or the offset to move it by with `relative`.
 * @param relative Whether `position` is relative to its current index.
 * @param sorted The role or channel and its siblings, sorted with {@link discordSort}.
 * @returns Every sibling, with its index as its new position.
 * @internal
 */
export function computePositions(
  id: Snowflake,
  position: number,
  relative: boolean,
  sorted: readonly { id: Snowflake }[],
): { id: Snowflake; position: number }[] {
  const ids = sorted.map((item) => item.id);
  moveElementInArray(ids, id, position, relative);
  return ids.map((itemId, index) => ({ id: itemId, position: index }));
}

/**
 * The data {@link transformResolved} resolves: each entry is either an ID, read from the cache, or raw API data,
 * resolved to its cached structure or built from the data when it is not cached.
 */
export interface ResolvableData {
  users?: Iterable<Snowflake | CacheEntityTypes["users"]>;
  /**
   * The members of {@link SupportingResolvedData.guildId}: their raw data needs its `user`.
   */
  members?: Iterable<Snowflake | Omit<CacheEntityTypes["members"], "guild_id">>;
  /**
   * The roles of {@link SupportingResolvedData.guildId}.
   */
  roles?: Iterable<Snowflake | Omit<CacheEntityTypes["roles"], "guild_id">>;
  channels?: Iterable<Snowflake | CacheEntityTypes["channels"]>;
}

/**
 * The context {@link transformResolved} resolves data in.
 */
export interface SupportingResolvedData {
  client: GatewayClient;
  /**
   * The guild of the members and roles: without it, they are not resolved.
   */
  guildId?: Snowflake | null;
}

/**
 * The structures {@link transformResolved} resolved, by ID.
 */
export interface TransformedResolvedData {
  users?: Map<Snowflake, User>;
  members?: Map<Snowflake, GuildMember>;
  roles?: Map<Snowflake, Role>;
  channels?: Map<Snowflake, AnyChannel>;
}

/**
 * Resolves the users, members, roles, and channels some data refers to into structures, like discord.js's
 * `transformResolved`. `client.messages` builds the relations of a message's `MessageMentions` with it.
 *
 * @remarks
 * Nothing is written to the cache. Synchronous when every cache it reads is.
 *
 * @param supportingData The client, and the guild of the members and roles.
 * @param data The IDs or raw data to resolve.
 * @returns A map for each kind of data given, keyed by ID, without duplicates nor the IDs that are not cached.
 */
export function transformResolved(
  { client, guildId }: SupportingResolvedData,
  { users, members, roles, channels }: ResolvableData,
): Awaitable<TransformedResolvedData> {
  return whenAll(
    [
      users &&
        resolveEach(
          users,
          (id) => client.users._get(id),
          (raw) => client.users._resolveData(raw),
        ),
      guildId && members
        ? resolveEach(
            members,
            (id) => client.members._get(guildId, id),
            (raw) => client.members._resolveData({ ...raw, guild_id: guildId }),
            (raw) => raw.user.id,
          )
        : undefined,
      guildId && roles
        ? resolveEach(
            roles,
            (id) => client.roles._get(guildId, id),
            (raw) => client.roles._resolveData({ ...raw, guild_id: guildId }),
          )
        : undefined,
      channels &&
        resolveEach(
          channels,
          (id) => client.channels._get(id),
          (raw) => client.channels._resolveData(raw),
        ),
    ],
    ([resolvedUsers, resolvedMembers, resolvedRoles, resolvedChannels]) => {
      const result: TransformedResolvedData = {};
      if (resolvedUsers) result.users = resolvedUsers;
      if (resolvedMembers) result.members = resolvedMembers;
      if (resolvedRoles) result.roles = resolvedRoles;
      if (resolvedChannels) result.channels = resolvedChannels;
      return result;
    },
  );
}

// Reads IDs from the cache and resolves raw data, preferring the raw data of an ID given both ways.
function resolveEach<Raw extends object, Value>(
  entries: Iterable<Snowflake | Raw>,
  get: (id: Snowflake) => Awaitable<Value | null | undefined>,
  resolve: (raw: Raw) => Awaitable<Value>,
  idOf: (raw: Raw) => Snowflake = (raw) => (raw as { id?: Snowflake }).id!,
): Awaitable<Map<Snowflake, Value>> {
  const raws = new Map<Snowflake, Raw>();
  const ids: Snowflake[] = [];
  for (const entry of entries) {
    if (typeof entry === "string") ids.push(entry);
    else raws.set(idOf(entry), entry);
  }

  return whenCachedMap([...ids, ...raws.keys()], (id) => {
    const raw = raws.get(id);
    return raw ? resolve(raw) : get(id);
  });
}

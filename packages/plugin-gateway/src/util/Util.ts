/*
 * Adapted from discord.js's `Util`
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/util/Util.js).
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

import { parse } from "node:path";
import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import { ChannelType, FormattingPatterns, type Snowflake } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import type { EmojiIdentifierResolvable } from "../structures/emojis/ReactionEmoji.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { Role } from "../structures/guilds/Role.js";
import type { User } from "../structures/users/User.js";
import type { ColorResolvable, SKUResolvable } from "../types.js";
import { whenAll, whenCachedMap } from "./cache.js";
import { Colors } from "./Colors.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

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
    if (color === "Default") return 0;
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
 * Flattens an object for serialization, like discord.js's `flatten`: maps become the array of their keys, arrays are
 * flattened element by element, objects with a `toJSON` are replaced by its result, and keys starting with `_` are
 * dropped.
 *
 * @param object The object to flatten.
 * @param props Specific properties to include (`true`), exclude (`false`), or rename (a string).
 */
export function flatten(
  object: unknown,
  ...props: Record<string, boolean | string>[]
): Record<string, unknown> {
  if (!isObject(object)) return object as never;

  const merged: Record<string, boolean | string> = Object.assign(
    Object.fromEntries(
      Object.keys(object)
        .filter((key) => !key.startsWith("_"))
        .map((key) => [key, true]),
    ),
    ...props,
  );

  const out: Record<string, unknown> = {};
  for (const [prop, rename] of Object.entries(merged)) {
    if (!rename) continue;
    const key = rename === true ? prop : rename;
    const element = object[prop];
    const valueOf =
      isObject(element) && typeof element.valueOf === "function" ? element.valueOf() : null;

    if (element instanceof Map) out[key] = [...element.keys()];
    else if (valueOf instanceof Map) out[key] = [...valueOf.keys()];
    else if (Array.isArray(element)) {
      out[key] = element.map((value: unknown) =>
        isObject(value) && typeof value.toJSON === "function" ? value.toJSON() : flatten(value),
      );
    } else if (typeof valueOf !== "object") out[key] = valueOf;
    else if (isObject(element) && typeof element.toJSON === "function") out[key] = element.toJSON();
    else if (isObject(element)) out[key] = flatten(element);
    else out[key] = element;
  }

  return out;
}

/**
 * Names by ID, as a map or a plain object.
 */
export type NamesById = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

/**
 * The names to replace mentions with in {@link cleanContent}, by ID. A mention whose ID has no name is kept.
 */
export interface CleanContentNames {
  /**
   * The display names of users, used for `<@id>` and `<@!id>` when `members` has none.
   */
  users?: NamesById;
  /**
   * The display names of guild members, preferred over `users`.
   */
  members?: NamesById;
  /**
   * The names of roles, used for `<@&id>`.
   */
  roles?: NamesById;
  /**
   * The names of channels, used for `<#id>`.
   */
  channels?: NamesById;
}

function nameIn(names: NamesById | undefined, id: string): string | undefined {
  if (!names) return undefined;
  return names instanceof Map ? names.get(id) : (names as Readonly<Record<string, string>>)[id];
}

/**
 * Replaces the mentions of a string with the text they display, like discord.js's `cleanContent`: `@name`, `@role`,
 * `#channel`, `/command`, and `:emoji:`.
 *
 * @remarks
 * discord.js reads the names from its synchronous cache. The cache of this package is asynchronous, so the names
 * are passed in instead; `Message#cleanContent` does it with the message's own mentions.
 * @param text The string to clean.
 * @param names The names to replace mentions with, by ID.
 */
export function cleanContent(text: string, names: CleanContentNames = {}): string {
  return text.replaceAll(
    /<(?:(?<type>@[!&]?|#)|(?:\/(?<commandName>[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai} ]+):)|(?:a?:(?<emojiName>\w+):))(?<id>\d{17,19})>/gu,
    (
      match: string,
      type: string | undefined,
      commandName: string | undefined,
      emojiName: string | undefined,
      id: string,
    ) => {
      if (commandName) return `/${commandName}`;
      if (emojiName) return `:${emojiName}:`;

      if (type === "#") {
        const channel = nameIn(names.channels, id);
        return channel ? `#${channel}` : match;
      }

      const name =
        type === "@&"
          ? nameIn(names.roles, id)
          : (nameIn(names.members, id) ?? nameIn(names.users, id));
      return name ? `@${name}` : match;
    },
  );
}

/**
 * Escapes the code block fences of a string, to put it in a code block.
 *
 * @param text The string to escape.
 */
export function cleanCodeBlockContent(text: string): string {
  return text.replaceAll("```", "`​``");
}

/**
 * The ID and token of a webhook.
 */
export interface WebhookDataIdWithToken {
  id: string;
  token: string;
}

/**
 * Parses a webhook URL for its ID and token.
 *
 * @param url The URL to parse.
 * @returns The ID and token, `null` when the URL is no webhook URL.
 */
export function parseWebhookURL(url: string): WebhookDataIdWithToken | null {
  const groups =
    /https?:\/\/(?:ptb\.|canary\.)?discord\.com\/api(?:\/v\d{1,2})?\/webhooks\/(?<id>\d{17,19})\/(?<token>[\w-]{68})/i.exec(
      url,
    )?.groups;
  return groups ? { id: groups.id!, token: groups.token! } : null;
}

/**
 * Verifies that a value is a string, throwing otherwise.
 *
 * @param data The value to verify.
 * @param error The constructor of the error to throw.
 * @param errorMessage The message of the error to throw.
 * @param allowEmpty Whether an empty string is allowed.
 */
export function verifyString(
  data: unknown,
  error: new (message: string) => Error = Error,
  errorMessage = `Expected a string, got ${String(data)} instead.`,
  allowEmpty = true,
): string {
  if (typeof data !== "string") throw new error(errorMessage);
  if (!allowEmpty && data.length === 0) throw new error(errorMessage);
  return data;
}

/**
 * Something Discord sorts by position and ID: a role or a guild channel.
 */
export interface Positioned {
  id: string;
  position?: number | null;
  rawPosition?: number | null;
  type?: unknown;
}

/**
 * Sorts roles or guild channels the way Discord displays them, like discord.js's `discordSort`: by position, then by
 * ID, ascending for channels and descending for roles (told apart by channels having a `type`).
 *
 * @param items The roles or channels to sort, or a map of them.
 * @returns A new sorted array.
 */
export function discordSort<Item extends Positioned>(
  items: Iterable<Item> | ReadonlyMap<string, Item>,
): Item[] {
  const array = [...(items instanceof Map ? items.values() : (items as Iterable<Item>))];
  const position = (item: Item) => item.rawPosition ?? item.position ?? 0;
  const channels = array[0]?.type !== undefined;
  return array.toSorted((a, b) => {
    const byPosition = position(a) - position(b);
    if (byPosition !== 0) return byPosition;
    const byId = BigInt(a.id) - BigInt(b.id);
    return byId === 0n ? 0 : byId > 0n === channels ? 1 : -1;
  });
}

/**
 * Moves an element of an array in place.
 *
 * @param array The array.
 * @param element The element to move.
 * @param newIndex The index to move it to, or the offset to move it by.
 * @param offset Whether `newIndex` is an offset.
 * @returns The new index of the element.
 */
export function moveElementInArray<Element>(
  array: Element[],
  element: Element,
  newIndex: number,
  offset = false,
): number {
  const index = array.indexOf(element);
  const target = (offset ? index : 0) + newIndex;
  if (index > -1 && target > -1 && target < array.length) {
    const [removed] = array.splice(index, 1);
    array.splice(target, 0, removed!);
  }

  return array.indexOf(element);
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
 * Gets the channel types sorted together with a channel type: text-like channels are listed above voice ones, and
 * categories on their own.
 *
 * @param type The type of the channel.
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
 * The plain information of an error, e.g. to send it to another process.
 */
export interface MakeErrorOptions {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Makes an error from its plain information.
 *
 * @param options The error's name, message, and stack.
 */
export function makeError(options: MakeErrorOptions): Error {
  const error = new Error(options.message);
  error.name = options.name;
  error.stack = options.stack;
  return error;
}

/**
 * Gets the plain information of an error.
 *
 * @param error The error.
 */
export function makePlainError(error: Error): MakeErrorOptions {
  return { name: error.name, message: error.message, stack: error.stack };
}

/**
 * Gets the name of a path or URL without its query string, like discord.js's `basename`.
 *
 * @param path The path or URL.
 * @param ext The extension to remove, if the name has it.
 */
export function basename(path: string, ext?: string): string {
  const parsed = parse(path);
  return ext && parsed.ext.startsWith(ext) ? parsed.name : parsed.base.split("?")[0]!;
}

/**
 * Finds the name of a file to attach: the name of a path or URL, or of a stream's `path`, `file.jpg` otherwise.
 *
 * @param thing The file.
 */
export function findName(thing: unknown): string {
  if (typeof thing === "string") return basename(thing);
  if (isObject(thing) && typeof thing.path === "string") return basename(thing.path);
  return "file.jpg";
}

/**
 * Finds a custom emoji by its ID in the cache of every guild, like discord.js's `resolveGuildEmoji`.
 *
 * @remarks
 * Emojis are cached per guild, so it enumerates the whole emoji cache: it needs a store able to list its entries, and
 * never calls the API.
 *
 * @param client The client whose cache to search.
 * @param emojiId The ID of the emoji.
 * @returns The emoji, `null` when no cached guild has it.
 * @throws {TypeError} When the emoji cache cannot enumerate its entries.
 */
export function resolveGuildEmoji(
  client: GatewayClient,
  emojiId: Snowflake,
): Promise<GuildEmoji | null> {
  return client.guilds.emojis("").findCachedInAnyGuild(emojiId);
}

/**
 * Resolves a SKU, or its ID, to its ID.
 *
 * @param resolvable The SKU or its ID.
 * @returns The ID, `null` when the value is neither.
 */
export function resolveSKUId(resolvable: SKUResolvable): string | null {
  if (typeof resolvable === "string") return resolvable;
  if (isObject(resolvable) && typeof resolvable.id === "string") return resolvable.id;
  return null;
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
          (id) => client.users.cache.get(id),
          (raw) => client.users._resolveData(raw),
        ),
      guildId && members
        ? resolveEach(
            members,
            (id) => client.members.cache.get(client.members.resolveKey(guildId, id)),
            (raw) => client.members._resolveData({ ...raw, guild_id: guildId }),
            (raw) => raw.user.id,
          )
        : undefined,
      guildId && roles
        ? resolveEach(
            roles,
            (id) => client.roles.cache.get(client.roles.resolveKey(guildId, id)),
            (raw) => client.roles._resolveData({ ...raw, guild_id: guildId }),
          )
        : undefined,
      channels &&
        resolveEach(
          channels,
          (id) => client.channels.cache.get(id),
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

import type { Collection } from "@discordjs/collection";
import type {
  MessageSearchAuthorType,
  MessageSearchEmbedType,
  MessageSearchHasType,
  MessageSearchSortMode,
  Snowflake,
} from "discord-api-types/v10";
import { GatewayRangeError, GatewayTypeError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import type { ThreadMember } from "../structures/channels/ThreadMember.js";
import type { Message } from "../structures/messages/Message.js";
import type {
  ChannelResolvable,
  MessageResolvable,
  RoleResolvable,
  UserResolvable,
} from "../types.js";
import { resolveId } from "./channels.js";

/**
 * The options of {@link GuildManager.searchMessages}, camel-cased and with the IDs as resolvables.
 */
export interface GuildSearchMessagesOptions {
  /**
   * The content to search for, up to 1024 characters.
   */
  content?: string;
  /**
   * How many words may be skipped between the matching tokens of `content`, up to 100. Discord defaults to `2`.
   */
  slop?: number;
  /**
   * Only the messages after this one.
   */
  minId?: MessageResolvable;
  /**
   * Only the messages before this one.
   */
  maxId?: MessageResolvable;
  /**
   * Only the messages of these channels (or threads), up to 500.
   */
  channelIds?: readonly ChannelResolvable[];
  /**
   * Only the messages of these author types. Prefix a type with `-` (`MessageSearchAuthorType.NotBot`) to exclude it.
   */
  authorType?: readonly MessageSearchAuthorType[];
  /**
   * Only the messages of these users, up to 100.
   */
  authorIds?: readonly UserResolvable[];
  /**
   * Only the messages mentioning these users, up to 100.
   */
  mentions?: readonly UserResolvable[];
  /**
   * Only the messages mentioning these roles, up to 100.
   */
  mentionsRoleIds?: readonly RoleResolvable[];
  /**
   * Whether the messages mention `@everyone`.
   */
  mentionEveryone?: boolean;
  /**
   * Only the messages replying to these users, up to 100.
   */
  repliedToUserIds?: readonly UserResolvable[];
  /**
   * Only the messages replying to these messages, up to 100.
   */
  repliedToMessageIds?: readonly MessageResolvable[];
  /**
   * Whether the messages are pinned.
   */
  pinned?: boolean;
  /**
   * Only the messages with these things. Prefix a type with `-` (`MessageSearchHasType.NotImage`) to exclude it.
   */
  has?: readonly MessageSearchHasType[];
  /**
   * Only the messages with these embed types.
   */
  embedType?: readonly MessageSearchEmbedType[];
  /**
   * Only the messages with an embed of these providers (case-sensitive, like `Tenor`), up to 100.
   */
  embedProvider?: readonly string[];
  /**
   * Only the messages linking these hostnames (like `discordapp.com`), up to 100.
   */
  linkHostname?: readonly string[];
  /**
   * Only the messages with an attachment of these filenames, up to 100.
   */
  attachmentFilename?: readonly string[];
  /**
   * Only the messages with an attachment of these extensions (like `txt`), up to 100.
   */
  attachmentExtension?: readonly string[];
  /**
   * What to sort by. Discord defaults to the timestamp.
   */
  sortBy?: MessageSearchSortMode;
  /**
   * The direction to sort in, ignored when sorting by relevance. Discord defaults to `"desc"`.
   */
  sortOrder?: "asc" | "desc";
  /**
   * Whether to include the results of age-restricted channels. Discord defaults to `false`.
   */
  includeNsfw?: boolean;
  /**
   * How many messages to return, from 1 to 25. Discord defaults to `25`.
   */
  limit?: number;
  /**
   * How many messages to skip, up to 9975.
   */
  offset?: number;
  /**
   * Whether to write the results to the cache.
   *
   * @defaultValue `true`
   */
  cache?: boolean;
  /**
   * Whether to wait and retry while Discord indexes the guild, rather than throwing `SearchIndexNotYetAvailable`.
   *
   * @defaultValue `true`
   */
  retryOnMissingIndex?: boolean;
  /**
   * Aborts the request, and the wait before a retry.
   */
  signal?: AbortSignal;
}

/**
 * The result of {@link GuildManager.searchMessages}.
 */
export interface GuildSearchMessagesResult {
  /**
   * The matching messages, in the order of the response.
   */
  messages: Collection<Snowflake, Message>;
  /**
   * The threads holding the messages.
   */
  threads: Collection<Snowflake, AnyThreadChannel>;
  /**
   * The thread members of the threads the bot joined, by thread ID and then user ID.
   */
  threadMembers: Collection<Snowflake, Collection<Snowflake, ThreadMember>>;
  /**
   * How many messages match the query. Approximate while messages are created or deleted.
   */
  totalResults: number;
  /**
   * Whether the guild is going through a deep historical indexing.
   */
  doingDeepHistoricalIndex: boolean;
  /**
   * How many documents the current indexing indexed so far, only when Discord sends it.
   */
  documentsIndexed?: number;
}

/**
 * Checks the limits Discord documents for a search, so a bad query fails before the request.
 *
 * @internal
 */
function validateSearchOptions(options: GuildSearchMessagesOptions): void {
  const { content, slop, channelIds, limit, offset } = options;
  if (content !== undefined && content.length > 1024) {
    throw new GatewayRangeError("MessageSearchContentLength");
  }

  if (slop !== undefined && !(Number.isInteger(slop) && slop >= 0 && slop <= 100)) {
    throw new GatewayRangeError("MessageSearchSlop");
  }

  if (channelIds !== undefined && channelIds.length > 500) {
    throw new GatewayRangeError("MessageSearchChannelIdsLimit");
  }

  if (limit !== undefined && !(Number.isInteger(limit) && limit >= 1 && limit <= 25)) {
    throw new GatewayRangeError("MessageSearchLimit");
  }

  if (offset !== undefined && !(Number.isInteger(offset) && offset >= 0 && offset <= 9975)) {
    throw new GatewayRangeError("MessageSearchOffset");
  }
}

/**
 * Serializes the options of a search into its query string, an array as a repeated key.
 *
 * @param client The client, to resolve users with.
 * @param options The options.
 * @throws {GatewayRangeError} When an option exceeds a documented limit.
 * @throws {GatewayTypeError} `IdUnresolvable` when a resolvable has no ID.
 * @internal
 */
export function toSearchQuery(
  client: GatewayClient,
  options: GuildSearchMessagesOptions,
): URLSearchParams {
  validateSearchOptions(options);
  const query = new URLSearchParams();
  const set = (key: string, value: string | number | boolean | undefined) => {
    if (value !== undefined) query.set(key, String(value));
  };
  const append = <Value>(
    key: string,
    values: readonly Value[] | undefined,
    resolve: (value: Value) => string = String,
  ) => {
    for (const value of values ?? []) query.append(key, resolve(value));
  };
  const resolveUser = (user: UserResolvable) => {
    const id = client.users.resolveId(user);
    if (id === null) throw new GatewayTypeError("IdUnresolvable");
    return id;
  };

  set("limit", options.limit);
  set("offset", options.offset);
  if (options.maxId !== undefined) set("max_id", resolveId(options.maxId));
  if (options.minId !== undefined) set("min_id", resolveId(options.minId));
  set("slop", options.slop);
  set("content", options.content);
  append("channel_id", options.channelIds, resolveId);
  append("author_type", options.authorType);
  append("author_id", options.authorIds, resolveUser);
  append("mentions", options.mentions, resolveUser);
  append("mentions_role_id", options.mentionsRoleIds, resolveId);
  set("mention_everyone", options.mentionEveryone);
  append("replied_to_user_id", options.repliedToUserIds, resolveUser);
  append("replied_to_message_id", options.repliedToMessageIds, resolveId);
  set("pinned", options.pinned);
  append("has", options.has);
  append("embed_type", options.embedType);
  append("embed_provider", options.embedProvider);
  append("link_hostname", options.linkHostname);
  append("attachment_filename", options.attachmentFilename);
  append("attachment_extension", options.attachmentExtension);
  set("sort_by", options.sortBy);
  set("sort_order", options.sortOrder);
  set("include_nsfw", options.includeNsfw);
  return query;
}

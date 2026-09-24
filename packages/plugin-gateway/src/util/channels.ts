import {
  type OverwriteType,
  PermissionFlagsBits,
  type APIGuildForumDefaultReactionEmoji,
  type APIGuildForumTag,
  type APIOverwrite,
  type ChannelFlags,
  type ChannelType,
  type ForumLayoutType,
  type RESTPatchAPIChannelJSONBody,
  type SortOrderType,
  type ThreadAutoArchiveDuration,
  type VideoQualityMode,
} from "discord-api-types/v10";
import {
  PermissionsBitField,
  type PermissionResolvable,
  type PermissionsString,
} from "./PermissionsBitField.js";

/**
 * Something with an ID: a structure, or the ID itself.
 */
export type IdResolvable = string | { id: string | null };

/**
 * Gets the ID of an {@link IdResolvable}.
 *
 * @param value The ID, or something with one.
 */
export function resolveId(value: IdResolvable): string {
  const id = typeof value === "string" ? value : value.id;
  if (!id) throw new TypeError("Cannot resolve an ID from a structure without one");
  return id;
}

/**
 * A permission overwrite to set on a channel: whom it targets, and what it allows and denies.
 */
export interface OverwriteData {
  /**
   * The role or member the overwrite targets.
   */
  id: IdResolvable;
  /**
   * Whether `id` is a role or a member. Required when `id` is a plain ID.
   */
  type: OverwriteType;
  allow?: PermissionResolvable;
  deny?: PermissionResolvable;
}

/**
 * Permissions to change in an overwrite: `true` allows, `false` denies, `null` falls back to the role or `@everyone`.
 */
export type PermissionOverwriteOptions = Partial<Record<PermissionsString, boolean | null>>;

/**
 * Converts an {@link OverwriteData} to the API's shape.
 */
export function toAPIOverwrite(overwrite: OverwriteData): APIOverwrite {
  return {
    id: resolveId(overwrite.id),
    type: overwrite.type,
    allow: String(PermissionsBitField.resolve(overwrite.allow ?? 0n)),
    deny: String(PermissionsBitField.resolve(overwrite.deny ?? 0n)),
  };
}

/**
 * Applies {@link PermissionOverwriteOptions} to an overwrite's allowed and denied permissions.
 *
 * @param options The permissions to change.
 * @param initial The overwrite's current permissions, none by default.
 */
export function resolveOverwriteOptions(
  options: PermissionOverwriteOptions,
  initial: { allow?: bigint; deny?: bigint } = {},
): { allow: bigint; deny: bigint } {
  let allow = initial.allow ?? 0n;
  let deny = initial.deny ?? 0n;
  for (const [name, value] of Object.entries(options)) {
    const bit = PermissionFlagsBits[name as PermissionsString];
    if (value === undefined || bit === undefined) continue;
    allow &= ~bit;
    deny &= ~bit;
    if (value === true) allow |= bit;
    else if (value === false) deny |= bit;
  }

  return { allow, deny };
}

/**
 * A forum tag to set: an existing one (with its ID) or a new one.
 */
export type GuildForumTagData = Omit<APIGuildForumTag, "id" | "moderated"> &
  Partial<Pick<APIGuildForumTag, "id" | "moderated">>;

/**
 * The fields of a guild channel that can be edited. Each applies to the channel types that have it.
 */
export interface GuildChannelEditOptions {
  name?: string;
  /**
   * Converts a text channel to an announcement channel, or back.
   */
  type?: ChannelType.GuildText | ChannelType.GuildAnnouncement;
  position?: number;
  topic?: string | null;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  permissionOverwrites?: readonly OverwriteData[];
  /**
   * The category, `null` to move the channel out of its category.
   */
  parent?: IdResolvable | null;
  /**
   * Whether to copy the category's overwrites: the new one with `parent`, else the current one. Exclusive with
   * `permissionOverwrites`.
   */
  lockPermissions?: boolean;
  rtcRegion?: string | null;
  videoQualityMode?: VideoQualityMode;
  defaultAutoArchiveDuration?: ThreadAutoArchiveDuration;
  availableTags?: readonly GuildForumTagData[];
  defaultReactionEmoji?: APIGuildForumDefaultReactionEmoji | null;
  defaultThreadRateLimitPerUser?: number;
  defaultSortOrder?: SortOrderType | null;
  defaultForumLayout?: ForumLayoutType;
  flags?: ChannelFlags;
  reason?: string;
}

/**
 * Converts {@link GuildChannelEditOptions} to the API's body, without `lockPermissions` which needs the parent.
 */
export function toChannelBody(
  options: GuildChannelEditOptions | GuildChannelCreateOptions,
): RESTPatchAPIChannelJSONBody {
  const body: Record<string, unknown> = {
    name: options.name,
    type: options.type,
    position: options.position,
    topic: options.topic,
    nsfw: options.nsfw,
    rate_limit_per_user: options.rateLimitPerUser,
    bitrate: options.bitrate,
    user_limit: options.userLimit,
    permission_overwrites: options.permissionOverwrites?.map(toAPIOverwrite),
    parent_id:
      options.parent === undefined
        ? undefined
        : options.parent === null
          ? null
          : resolveId(options.parent),
    rtc_region: options.rtcRegion,
    video_quality_mode: options.videoQualityMode,
    default_auto_archive_duration: options.defaultAutoArchiveDuration,
    available_tags: options.availableTags,
    default_reaction_emoji: options.defaultReactionEmoji,
    default_thread_rate_limit_per_user: options.defaultThreadRateLimitPerUser,
    default_sort_order: options.defaultSortOrder,
    default_forum_layout: options.defaultForumLayout,
    flags: "flags" in options ? options.flags : undefined,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return body as RESTPatchAPIChannelJSONBody;
}

/**
 * The options to create a guild channel with.
 */
export interface GuildChannelCreateOptions extends Omit<
  GuildChannelEditOptions,
  "type" | "lockPermissions" | "flags"
> {
  name: string;
  type?: ChannelType;
}

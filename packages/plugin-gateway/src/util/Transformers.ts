/*
 * Adapted from discord.js's `Transformers` and the transformers of its `Channels` util
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/util/Transformers.js,
 * https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/util/Channels.js), and from the camel-cased
 * objects its structures build in `_patch`.
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

import type {
  APIAuditLogChange,
  APIAuthorizingIntegrationOwnersMap,
  APIAutoModerationAction,
  APIAutoModerationRuleTriggerMetadata,
  APIAvatarDecorationData,
  APIChannelMention,
  APICollectibles,
  APIEmbedAuthor,
  APIEmbedFooter,
  APIEmbedImage,
  APIEmbedThumbnail,
  APIEmbedVideo,
  APIGuildForumDefaultReactionEmoji,
  APIGuildForumTag,
  APIGuildScheduledEventEntityMetadata,
  APIGuildScheduledEventRecurrenceRule,
  APIGuildScheduledEventRecurrenceRuleNWeekday,
  APIIncidentsData,
  APIMessageActivity,
  APIMessageCall,
  APIMessageInteractionMetadata,
  APIMessageReference,
  APIMessageRoleSubscriptionData,
  APIMessageSharedClientTheme,
  APIRoleTags,
  APIUserPrimaryGuild,
  AutoModerationActionType,
  AutoModerationRuleKeywordPresetType,
  ChannelType,
  GuildScheduledEventRecurrenceRuleFrequency,
  GuildScheduledEventRecurrenceRuleMonth,
  GuildScheduledEventRecurrenceRuleWeekday,
  InteractionType,
  MessageActivityType,
  MessageReferenceType,
  NameplatePalette,
  Snowflake,
} from "discord-api-types/v10";
import { bindClient } from "../structures/Structure.js";
import { User } from "../structures/users/User.js";
import type { GatewayClient } from "../GatewayClient.js";
import type { DateResolvable } from "../types.js";
import { resolveId, type IdResolvable } from "./channels.js";

// ---------------------------------------------------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Converts a camel-cased key to snake case, like lodash's `snakeCase` on the keys discord.js passes it: `byNWeekday`
 * becomes `by_n_weekday`, and a key already in snake case is kept.
 *
 * @param key The key.
 */
export function snakeCase(key: string): string {
  return key
    .replaceAll(/([a-z\d])([A-Z])/g, "$1_$2")
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

/**
 * Transforms camel-cased keys into snake-cased keys, deeply, like discord.js's `toSnakeCase`. Dates are kept, and
 * anything with a `toJSON` method (a builder, a structure) is replaced by its JSON first.
 *
 * @param value The value to transform.
 */
export function toSnakeCase<Value = unknown>(value: unknown): Value {
  if (typeof value !== "object" || value === null) return value as Value;
  if (value instanceof Date) return value as Value;
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return toSnakeCase((value as { toJSON(): unknown }).toJSON());
  }
  if (Array.isArray(value)) return value.map((element) => toSnakeCase(element)) as Value;
  return Object.fromEntries(
    Object.entries(value).map(([key, element]) => [snakeCase(key), toSnakeCase(element)]),
  ) as Value;
}

function timestampOf(value: string | null | undefined): number | null {
  return value ? Date.parse(value) : null;
}

function dateOf(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

function isoOf(date: DateResolvable): string {
  return new Date(date).toISOString();
}

// ---------------------------------------------------------------------------------------------------------------------
// Auto moderation
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The settings of an auto moderation rule's trigger, like discord.js's `AutoModerationTriggerMetadata`.
 */
export interface AutoModerationTriggerMetadata {
  /**
   * The substrings searched for in the content.
   */
  keywordFilter: string[];
  /**
   * The regular expressions matched against the content. Only Rust-flavored ones are supported.
   */
  regexPatterns: string[];
  /**
   * The internally pre-defined word sets searched for in the content.
   */
  presets: AutoModerationRuleKeywordPresetType[];
  /**
   * The substrings exempt from triggering the rule.
   */
  allowList: string[];
  /**
   * The total number of role and user mentions a message may have.
   */
  mentionTotalLimit: number | null;
  /**
   * Whether mention raids are detected.
   */
  mentionRaidProtectionEnabled: boolean;
}

/**
 * The trigger settings to set on an auto moderation rule, like discord.js's `AutoModerationTriggerMetadataOptions`.
 */
export type AutoModerationTriggerMetadataOptions = Partial<AutoModerationTriggerMetadata>;

/**
 * The metadata of an auto moderation action, like discord.js's `AutoModerationActionMetadata`.
 */
export interface AutoModerationActionMetadata {
  /**
   * The ID of the channel content is logged to, for `SendAlertMessage` actions.
   */
  channelId: Snowflake | null;
  /**
   * How long the member is timed out for, in seconds, for `Timeout` actions.
   */
  durationSeconds: number | null;
  /**
   * The message shown to the member when their message is blocked, for `BlockMessage` actions.
   */
  customMessage: string | null;
}

/**
 * An action of an auto moderation rule, like discord.js's `AutoModerationAction`.
 */
export interface AutoModerationAction {
  type: AutoModerationActionType;
  metadata: AutoModerationActionMetadata;
}

/**
 * An action to set on an auto moderation rule, like discord.js's `AutoModerationActionOptions`.
 */
export interface AutoModerationActionOptions {
  type: AutoModerationActionType;
  metadata?: {
    /**
     * The channel content is logged to, for `SendAlertMessage` actions.
     */
    channel?: IdResolvable;
    /**
     * How long the member is timed out for, in seconds, for `Timeout` actions.
     */
    durationSeconds?: number;
    /**
     * The message shown to the member when their message is blocked, for `BlockMessage` actions.
     */
    customMessage?: string;
  };
}

/**
 * Transforms an API auto moderation trigger metadata object to a camel-cased variant.
 *
 * @param metadata The metadata to transform.
 */
export function transformAPIAutoModerationRuleTriggerMetadata(
  metadata: APIAutoModerationRuleTriggerMetadata,
): AutoModerationTriggerMetadata {
  return {
    keywordFilter: metadata.keyword_filter ?? [],
    regexPatterns: metadata.regex_patterns ?? [],
    presets: metadata.presets ?? [],
    allowList: metadata.allow_list ?? [],
    mentionTotalLimit: metadata.mention_total_limit ?? null,
    mentionRaidProtectionEnabled: metadata.mention_raid_protection_enabled ?? false,
  };
}

/**
 * Transforms camel-cased auto moderation trigger metadata to the API's shape. Raw metadata is passed through.
 *
 * @param metadata The metadata to transform.
 */
export function transformAutoModerationRuleTriggerMetadata(
  metadata: AutoModerationTriggerMetadataOptions | APIAutoModerationRuleTriggerMetadata,
): APIAutoModerationRuleTriggerMetadata {
  const body = toSnakeCase<Record<string, unknown>>(metadata);
  // `mentionTotalLimit: null` means "no limit" on the camel-cased side, which the API spells by omitting the field.
  if (body.mention_total_limit === null) delete body.mention_total_limit;
  return body as APIAutoModerationRuleTriggerMetadata;
}

/**
 * Transforms an API auto moderation action to a camel-cased variant, like discord.js's
 * `_transformAPIAutoModerationAction`.
 *
 * @param action The action to transform.
 */
export function transformAPIAutoModerationAction(
  action: APIAutoModerationAction,
): AutoModerationAction {
  return {
    type: action.type,
    metadata: {
      durationSeconds: action.metadata?.duration_seconds ?? null,
      channelId: action.metadata?.channel_id ?? null,
      customMessage: action.metadata?.custom_message ?? null,
    },
  };
}

/**
 * Transforms a camel-cased auto moderation action to the API's shape. Raw actions are passed through.
 *
 * @param action The action to transform.
 */
export function transformAutoModerationAction(
  action: AutoModerationActionOptions | AutoModerationAction | APIAutoModerationAction,
): APIAutoModerationAction {
  const metadata = action.metadata as Record<string, unknown> | undefined;
  if (!metadata) return { type: action.type };

  const channel = (metadata.channel ?? metadata.channelId ?? metadata.channel_id) as
    | IdResolvable
    | null
    | undefined;
  const body: Record<string, unknown> = {
    channel_id: channel ? resolveId(channel) : undefined,
    duration_seconds: metadata.durationSeconds ?? metadata.duration_seconds ?? undefined,
    custom_message: metadata.customMessage ?? metadata.custom_message ?? undefined,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return { type: action.type, metadata: body } as APIAutoModerationAction;
}

// ---------------------------------------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The emoji of a forum tag or a forum's default reaction: its ID for a custom emoji, its name for a unicode one.
 */
export interface GuildForumTagEmoji {
  id: Snowflake | null;
  name: string | null;
}

/**
 * A tag of a forum or media channel, like discord.js's `GuildForumTag`.
 */
export interface GuildForumTag {
  id: Snowflake;
  name: string;
  /**
   * Whether only moderators can apply the tag.
   */
  moderated: boolean;
  emoji: GuildForumTagEmoji | null;
}

/**
 * A forum tag to set: an existing one (with its ID) or a new one, like discord.js's `GuildForumTagData`.
 */
export interface GuildForumTagOptions {
  id?: Snowflake;
  name: string;
  moderated?: boolean;
  emoji?: GuildForumTagEmoji | null;
}

/**
 * The default reaction of a forum or media channel, like discord.js's `DefaultReactionEmoji`.
 */
export type DefaultReactionEmoji = GuildForumTagEmoji;

/**
 * Transforms an API forum tag to a camel-cased variant.
 *
 * @param tag The tag to transform.
 */
export function transformAPIGuildForumTag(tag: APIGuildForumTag): GuildForumTag {
  return {
    id: tag.id,
    name: tag.name,
    moderated: tag.moderated,
    emoji: (tag.emoji_id ?? tag.emoji_name) ? { id: tag.emoji_id, name: tag.emoji_name } : null,
  };
}

/**
 * Transforms a camel-cased forum tag to the API's shape. Raw tags are passed through.
 *
 * @param tag The tag to transform.
 */
export function transformGuildForumTag(
  tag: GuildForumTagOptions | Partial<APIGuildForumTag>,
): Partial<APIGuildForumTag> {
  if (!("emoji" in tag)) return tag as Partial<APIGuildForumTag>;
  const body: Partial<APIGuildForumTag> = {
    id: tag.id,
    name: tag.name,
    moderated: tag.moderated,
    emoji_id: tag.emoji?.id ?? null,
    emoji_name: tag.emoji?.name ?? null,
  };
  if (body.id === undefined) delete body.id;
  if (body.moderated === undefined) delete body.moderated;
  return body;
}

/**
 * Transforms an API forum default reaction to a camel-cased variant.
 *
 * @param defaultReaction The default reaction to transform.
 */
export function transformAPIGuildDefaultReaction(
  defaultReaction: APIGuildForumDefaultReactionEmoji,
): DefaultReactionEmoji {
  return { id: defaultReaction.emoji_id, name: defaultReaction.emoji_name };
}

/**
 * Transforms a camel-cased forum default reaction to the API's shape. Raw ones are passed through.
 *
 * @param defaultReaction The default reaction to transform.
 */
export function transformGuildDefaultReaction(
  defaultReaction: DefaultReactionEmoji | APIGuildForumDefaultReactionEmoji,
): APIGuildForumDefaultReactionEmoji {
  if ("emoji_id" in defaultReaction || "emoji_name" in defaultReaction) {
    return defaultReaction as APIGuildForumDefaultReactionEmoji;
  }
  return {
    emoji_id: (defaultReaction as DefaultReactionEmoji).id,
    emoji_name: (defaultReaction as DefaultReactionEmoji).name,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The incident actions of a guild, like discord.js's `IncidentActions`.
 */
export interface IncidentActions {
  /**
   * When invites are enabled again.
   */
  invitesDisabledUntil: Date | null;
  /**
   * When direct messages are enabled again.
   */
  dmsDisabledUntil: Date | null;
  /**
   * When direct message spam was detected.
   */
  dmSpamDetectedAt: Date | null;
  /**
   * When a raid was detected.
   */
  raidDetectedAt: Date | null;
}

/**
 * Transforms API incidents data to a camel-cased variant, like discord.js's `_transformAPIIncidentsData`.
 *
 * @param data The incidents data to transform.
 */
export function transformAPIIncidentsData(data: APIIncidentsData): IncidentActions {
  return {
    invitesDisabledUntil: dateOf(data.invites_disabled_until),
    dmsDisabledUntil: dateOf(data.dms_disabled_until),
    dmSpamDetectedAt: dateOf(data.dm_spam_detected_at),
    raidDetectedAt: dateOf(data.raid_detected_at),
  };
}

/**
 * The tags of a role, like discord.js's `RoleTagData`: each is only set when it applies.
 */
export interface RoleTagData {
  /**
   * The ID of the bot the role belongs to.
   */
  botId?: Snowflake;
  /**
   * The ID of the integration the role belongs to.
   */
  integrationId?: Snowflake;
  /**
   * Whether this is the guild's booster role.
   */
  premiumSubscriberRole?: true;
  /**
   * The ID of the role's subscription SKU and listing.
   */
  subscriptionListingId?: Snowflake;
  /**
   * Whether the role can be purchased.
   */
  availableForPurchase?: true;
  /**
   * Whether this is a linked role of the guild.
   */
  guildConnections?: true;
}

/**
 * Transforms API role tags to a camel-cased variant. Discord marks boolean tags as present with `null`, which
 * becomes `true` here.
 *
 * @param tags The tags to transform.
 */
export function transformAPIRoleTags(tags: APIRoleTags): RoleTagData {
  const result: RoleTagData = {};
  if ("bot_id" in tags) result.botId = tags.bot_id;
  if ("integration_id" in tags) result.integrationId = tags.integration_id;
  if ("premium_subscriber" in tags) result.premiumSubscriberRole = true;
  if ("subscription_listing_id" in tags)
    result.subscriptionListingId = tags.subscription_listing_id;
  if ("available_for_purchase" in tags) result.availableForPurchase = true;
  if ("guild_connections" in tags) result.guildConnections = true;
  return result;
}

/**
 * A change recorded by an audit log entry, like discord.js's `AuditLogChange`.
 */
export interface AuditLogChange {
  /**
   * The property that changed, e.g. `nick`. For application command permission updates, the ID of what was updated.
   */
  key: string;
  /**
   * The old value, absent when the property was added.
   */
  old?: unknown;
  /**
   * The new value, absent when the property was removed.
   */
  new?: unknown;
}

/**
 * Transforms an API audit log change to a camel-cased variant, renaming `old_value` and `new_value`.
 *
 * @param change The change to transform.
 */
export function transformAPIAuditLogChange(change: APIAuditLogChange): AuditLogChange {
  const result: AuditLogChange = { key: change.key };
  if ("old_value" in change) result.old = change.old_value;
  if ("new_value" in change) result.new = change.new_value;
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------
// Scheduled events
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The recurrence rule of a scheduled event, like discord.js's `GuildScheduledEventRecurrenceRule`.
 */
export interface GuildScheduledEventRecurrenceRule {
  startTimestamp: number;
  readonly startAt: Date;
  endTimestamp: number | null;
  readonly endAt: Date | null;
  frequency: GuildScheduledEventRecurrenceRuleFrequency;
  interval: number;
  byWeekday: GuildScheduledEventRecurrenceRuleWeekday[] | null;
  byNWeekday: APIGuildScheduledEventRecurrenceRuleNWeekday[] | null;
  byMonth: GuildScheduledEventRecurrenceRuleMonth[] | null;
  byMonthDay: number[] | null;
  byYearDay: number[] | null;
  count: number | null;
}

/**
 * The recurrence rule to set on a scheduled event, like discord.js's `GuildScheduledEventRecurrenceRuleOptions`.
 */
export interface GuildScheduledEventRecurrenceRuleOptions {
  startAt: DateResolvable;
  frequency: GuildScheduledEventRecurrenceRuleFrequency;
  interval: number;
  byWeekday?: readonly GuildScheduledEventRecurrenceRuleWeekday[] | null;
  byNWeekday?: readonly APIGuildScheduledEventRecurrenceRuleNWeekday[] | null;
  byMonth?: readonly GuildScheduledEventRecurrenceRuleMonth[] | null;
  byMonthDay?: readonly number[] | null;
}

/**
 * Transforms an API recurrence rule to a camel-cased variant.
 *
 * @param rule The rule to transform.
 */
export function transformAPIGuildScheduledEventRecurrenceRule(
  rule: APIGuildScheduledEventRecurrenceRule,
): GuildScheduledEventRecurrenceRule {
  return {
    startTimestamp: Date.parse(rule.start),
    get startAt() {
      return new Date(this.startTimestamp);
    },
    endTimestamp: timestampOf(rule.end),
    get endAt() {
      return this.endTimestamp === null ? null : new Date(this.endTimestamp);
    },
    frequency: rule.frequency,
    interval: rule.interval,
    byWeekday: rule.by_weekday,
    byNWeekday: rule.by_n_weekday,
    byMonth: rule.by_month,
    byMonthDay: rule.by_month_day,
    byYearDay: rule.by_year_day,
    count: rule.count,
  };
}

/**
 * Transforms a camel-cased recurrence rule to the API's shape, like discord.js's
 * `_transformGuildScheduledEventRecurrenceRule`. Raw rules are passed through.
 *
 * @param rule The rule to transform.
 */
export function transformGuildScheduledEventRecurrenceRule(
  rule: GuildScheduledEventRecurrenceRuleOptions | Partial<APIGuildScheduledEventRecurrenceRule>,
): Partial<APIGuildScheduledEventRecurrenceRule> {
  if (!("startAt" in rule)) return rule;
  const body: Record<string, unknown> = {
    start: isoOf(rule.startAt),
    frequency: rule.frequency,
    interval: rule.interval,
    by_weekday: rule.byWeekday,
    by_n_weekday: rule.byNWeekday,
    by_month: rule.byMonth,
    by_month_day: rule.byMonthDay,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return body as Partial<APIGuildScheduledEventRecurrenceRule>;
}

/**
 * The metadata of a scheduled event, like discord.js's `GuildScheduledEventEntityMetadata`.
 */
export interface GuildScheduledEventEntityMetadata {
  /**
   * Where an external event takes place.
   */
  location: string | null;
}

/**
 * Transforms API scheduled event metadata to a camel-cased variant.
 *
 * @param metadata The metadata to transform.
 */
export function transformAPIGuildScheduledEventEntityMetadata(
  metadata: APIGuildScheduledEventEntityMetadata,
): GuildScheduledEventEntityMetadata {
  return { location: metadata.location ?? null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The avatar decoration of a user or member, like discord.js's `AvatarDecorationData`.
 */
export interface AvatarDecorationData {
  asset: string;
  skuId: Snowflake;
}

/**
 * Transforms API avatar decoration data to a camel-cased variant.
 *
 * @param data The data to transform.
 */
export function transformAPIAvatarDecorationData(
  data: APIAvatarDecorationData,
): AvatarDecorationData {
  return { asset: data.asset, skuId: data.sku_id };
}

/**
 * The nameplate of a user or member, like discord.js's `NameplateData`.
 */
export interface NameplateData {
  skuId: Snowflake;
  asset: string;
  label: string;
  palette: NameplatePalette;
}

/**
 * The collectibles of a user or member, like discord.js's `Collectibles`.
 */
export interface Collectibles {
  nameplate: NameplateData | null;
}

/**
 * Transforms API collectibles to a camel-cased variant, like discord.js's `_transformCollectibles`.
 *
 * @param collectibles The collectibles to transform.
 */
export function transformCollectibles(collectibles: APICollectibles): Collectibles {
  if (!collectibles.nameplate) return { nameplate: null };
  return {
    nameplate: {
      skuId: collectibles.nameplate.sku_id,
      asset: collectibles.nameplate.asset,
      label: collectibles.nameplate.label,
      palette: collectibles.nameplate.palette,
    },
  };
}

/**
 * The primary guild of a user, whose tag they display, like discord.js's `UserPrimaryGuild`.
 */
export interface UserPrimaryGuild {
  identityGuildId: Snowflake | null;
  identityEnabled: boolean | null;
  tag: string | null;
  badge: string | null;
}

/**
 * Transforms an API primary guild to a camel-cased variant.
 *
 * @param primaryGuild The primary guild to transform.
 */
export function transformAPIUserPrimaryGuild(primaryGuild: APIUserPrimaryGuild): UserPrimaryGuild {
  return {
    identityGuildId: primaryGuild.identity_guild_id,
    identityEnabled: primaryGuild.identity_enabled,
    tag: primaryGuild.tag,
    badge: primaryGuild.badge,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------------------------------

/**
 * What a message references: the message it replies to or forwards, like discord.js's `MessageReference`.
 */
export interface MessageReference {
  channelId: Snowflake;
  guildId: Snowflake | undefined;
  messageId: Snowflake | undefined;
  type: MessageReferenceType;
}

/**
 * Transforms an API message reference to a camel-cased variant.
 *
 * @param reference The reference to transform.
 */
export function transformAPIMessageReference(reference: APIMessageReference): MessageReference {
  return {
    channelId: reference.channel_id,
    guildId: reference.guild_id,
    messageId: reference.message_id,
    type: reference.type ?? (0 as MessageReferenceType.Default),
  };
}

/**
 * The Rich Presence activity of a message, like discord.js's `MessageActivity`.
 */
export interface MessageActivity {
  partyId: string | undefined;
  type: MessageActivityType;
}

/**
 * Transforms an API message activity to a camel-cased variant.
 *
 * @param activity The activity to transform.
 */
export function transformAPIMessageActivity(activity: APIMessageActivity): MessageActivity {
  return { partyId: activity.party_id, type: activity.type };
}

/**
 * The call a message is about, like discord.js's `MessageCall`.
 */
export interface MessageCall {
  endedTimestamp: number | null;
  readonly endedAt: Date | null;
  participants: Snowflake[];
}

/**
 * Transforms an API message call to a camel-cased variant.
 *
 * @param call The call to transform.
 */
export function transformAPIMessageCall(call: APIMessageCall): MessageCall {
  return {
    endedTimestamp: timestampOf(call.ended_timestamp),
    get endedAt() {
      return this.endedTimestamp === null ? null : new Date(this.endedTimestamp);
    },
    participants: call.participants,
  };
}

/**
 * The role subscription a message is about, like discord.js's `RoleSubscriptionData`.
 */
export interface RoleSubscriptionData {
  roleSubscriptionListingId: Snowflake;
  tierName: string;
  totalMonthsSubscribed: number;
  isRenewal: boolean;
}

/**
 * Transforms API role subscription data to a camel-cased variant.
 *
 * @param data The data to transform.
 */
export function transformAPIRoleSubscriptionData(
  data: APIMessageRoleSubscriptionData,
): RoleSubscriptionData {
  return {
    roleSubscriptionListingId: data.role_subscription_listing_id,
    tierName: data.tier_name,
    totalMonthsSubscribed: data.total_months_subscribed,
    isRenewal: data.is_renewal,
  };
}

/**
 * The custom client theme shared via a message, camel-cased like discord.js's `SharedClientTheme`.
 */
export interface SharedClientTheme {
  colors: string[];
  gradientAngle: number;
  baseMix: number;
  baseTheme?: APIMessageSharedClientTheme["base_theme"];
}

/**
 * Transforms the shared client theme of a message.
 *
 * @param data The data to transform.
 */
export function transformAPIMessageSharedClientTheme(
  data: APIMessageSharedClientTheme,
): SharedClientTheme {
  return {
    colors: data.colors,
    gradientAngle: data.gradient_angle,
    baseMix: data.base_mix,
    ...(data.base_theme === undefined ? {} : { baseTheme: data.base_theme }),
  };
}

/**
 * A channel a crossposted message was published in, like discord.js's `CrosspostedChannel`.
 */
export interface CrosspostedChannel {
  channelId: Snowflake;
  guildId: Snowflake;
  type: ChannelType;
  name: string;
}

/**
 * Transforms an API channel mention to a camel-cased variant.
 *
 * @param channel The channel mention to transform.
 */
export function transformAPIChannelMention(channel: APIChannelMention): CrosspostedChannel {
  return {
    channelId: channel.id,
    guildId: channel.guild_id,
    type: channel.type,
    name: channel.name,
  };
}

/**
 * The metadata of the interaction a message answers, like discord.js's `MessageInteractionMetadata`.
 */
export interface MessageInteractionMetadata {
  id: Snowflake;
  type: InteractionType;
  /**
   * The user who triggered the interaction.
   */
  user: User;
  /**
   * The IDs of the installation contexts the interaction was authorized for, keyed by their type.
   */
  authorizingIntegrationOwners: APIAuthorizingIntegrationOwnersMap;
  /**
   * The ID of the original response, for a follow-up message.
   */
  originalResponseMessageId: Snowflake | null;
  /**
   * The ID of the message holding the component that was interacted with.
   */
  interactedMessageId: Snowflake | null;
  /**
   * The user a user command targeted.
   */
  targetUser: User | null;
  /**
   * The ID of the message a message command targeted.
   */
  targetMessageId: Snowflake | null;
  /**
   * The metadata of the interaction that opened the modal, for a modal submission.
   */
  triggeringInteractionMetadata: MessageInteractionMetadata | null;
}

/**
 * Transforms API message interaction metadata to a camel-cased variant, like discord.js's
 * `_transformAPIMessageInteractionMetadata`. Its users are built as {@link User} structures.
 *
 * @param metadata The metadata to transform.
 * @param client The client to bind the users to, the most recently constructed one by default.
 */
export function transformAPIMessageInteractionMetadata(
  metadata: APIMessageInteractionMetadata,
  client?: GatewayClient,
): MessageInteractionMetadata {
  const raw = metadata as Partial<
    Record<
      | "interacted_message_id"
      | "target_message_id"
      | "target_user"
      | "triggering_interaction_metadata",
      never
    >
  > &
    typeof metadata;
  const user = (data: typeof metadata.user) =>
    client ? bindClient(new User(data), client) : new User(data);

  return {
    id: metadata.id,
    type: metadata.type,
    user: user(metadata.user),
    authorizingIntegrationOwners: metadata.authorizing_integration_owners,
    originalResponseMessageId: metadata.original_response_message_id ?? null,
    interactedMessageId: raw.interacted_message_id ?? null,
    targetUser: raw.target_user ? user(raw.target_user) : null,
    targetMessageId: raw.target_message_id ?? null,
    triggeringInteractionMetadata: raw.triggering_interaction_metadata
      ? transformAPIMessageInteractionMetadata(raw.triggering_interaction_metadata, client)
      : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Embeds
// ---------------------------------------------------------------------------------------------------------------------

/**
 * An image, thumbnail, or video of an embed, like discord.js's `EmbedAssetData`.
 */
export interface EmbedAssetData {
  url: string;
  proxyURL: string | undefined;
  height: number | undefined;
  width: number | undefined;
}

/**
 * The author of an embed, like discord.js's `EmbedAuthorData`.
 */
export interface EmbedAuthorData {
  name: string;
  url: string | undefined;
  iconURL: string | undefined;
  proxyIconURL: string | undefined;
}

/**
 * The footer of an embed, like discord.js's `EmbedFooterData`.
 */
export interface EmbedFooterData {
  text: string;
  iconURL: string | undefined;
  proxyIconURL: string | undefined;
}

/**
 * Transforms an API embed image, thumbnail, or video to a camel-cased variant.
 *
 * @param asset The asset to transform.
 */
export function transformAPIEmbedAsset(
  asset: APIEmbedImage | APIEmbedThumbnail | APIEmbedVideo,
): EmbedAssetData {
  return {
    url: asset.url!,
    proxyURL: asset.proxy_url,
    height: asset.height,
    width: asset.width,
  };
}

/**
 * Transforms an API embed author to a camel-cased variant.
 *
 * @param author The author to transform.
 */
export function transformAPIEmbedAuthor(author: APIEmbedAuthor): EmbedAuthorData {
  return {
    name: author.name,
    url: author.url,
    iconURL: author.icon_url,
    proxyIconURL: author.proxy_icon_url,
  };
}

/**
 * Transforms an API embed footer to a camel-cased variant.
 *
 * @param footer The footer to transform.
 */
export function transformAPIEmbedFooter(footer: APIEmbedFooter): EmbedFooterData {
  return { text: footer.text, iconURL: footer.icon_url, proxyIconURL: footer.proxy_icon_url };
}

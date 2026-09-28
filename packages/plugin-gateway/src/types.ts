import type {
  APIApplication,
  APIApplicationCommand,
  APIComponentInMessageActionRow,
  APIEntitlement,
  APIMessageComponentEmoji,
  APISKU,
  APISubscription,
  ApplicationCommandOptionType,
  AuditLogEvent,
  RESTPostAPIApplicationCommandsJSONBody,
  Snowflake,
} from "discord-api-types/v10";
import type { AnyChannel } from "./managers/ChannelManager.js";
import type { AutoModerationRule } from "./structures/automoderation/AutoModerationRule.js";
import type { AnnouncementChannel } from "./structures/channels/AnnouncementChannel.js";
import type { AnnouncementThreadChannel } from "./structures/channels/AnnouncementThreadChannel.js";
import type { CategoryChannel } from "./structures/channels/CategoryChannel.js";
import type { DMChannel } from "./structures/channels/DMChannel.js";
import type { ForumChannel } from "./structures/channels/ForumChannel.js";
import type { GroupDMChannel } from "./structures/channels/GroupDMChannel.js";
import type { MediaChannel } from "./structures/channels/MediaChannel.js";
import type { PermissionOverwrites } from "./structures/channels/PermissionOverwrites.js";
import type { PrivateThreadChannel } from "./structures/channels/PrivateThreadChannel.js";
import type { PublicThreadChannel } from "./structures/channels/PublicThreadChannel.js";
import type { StageChannel } from "./structures/channels/StageChannel.js";
import type { TextChannel } from "./structures/channels/TextChannel.js";
import type { ThreadMember } from "./structures/channels/ThreadMember.js";
import type { VoiceChannel } from "./structures/channels/VoiceChannel.js";
import type { GuildEmoji } from "./structures/emojis/GuildEmoji.js";
import type { ReactionEmoji } from "./structures/emojis/ReactionEmoji.js";
import type { Guild } from "./structures/guilds/Guild.js";
import type { GuildBan } from "./structures/guilds/GuildBan.js";
import type { GuildMember } from "./structures/guilds/GuildMember.js";
import type { GuildScheduledEvent } from "./structures/guilds/GuildScheduledEvent.js";
import type { Role } from "./structures/guilds/Role.js";
import type { GuildInvite } from "./structures/invites/GuildInvite.js";
import type { Message } from "./structures/messages/Message.js";
import type { JSONEncodable } from "./structures/messages/MessagePayload.js";
import type { MessageReaction } from "./structures/messages/MessageReaction.js";
import type { Activity } from "./structures/presences/Activity.js";
import type { Presence } from "./structures/presences/Presence.js";
import type { SoundboardSound } from "./structures/soundboards/SoundboardSound.js";
import type { StageInstance } from "./structures/stageInstances/StageInstance.js";
import type { Sticker } from "./structures/stickers/Sticker.js";
import type { User } from "./structures/users/User.js";
import type { OverwriteData } from "./util/channels.js";
import type { Colors } from "./util/Colors.js";

// The `*Resolvable` types of discord.js (`packages/discord.js/typings/index.d.ts`), mapped onto this package's
// structures. Those already declared next to what consumes them are not repeated here: `BitFieldResolvable`
// (`util/BitField.ts`), every `*FlagsResolvable` (`util/flags.ts`), `PermissionResolvable` (`util/PermissionsBitField.ts`),
// `BufferResolvable` and `AttachmentResolvable` (`MessagePayload`), and `EmojiIdentifierResolvable` (`ReactionEmoji`).

// ---------------------------------------------------------------------------------------------------------------------
// Channel groups
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Any thread channel.
 */
export type ThreadChannel = AnnouncementThreadChannel | PrivateThreadChannel | PublicThreadChannel;

/**
 * Any channel that belongs to a guild, threads excluded. Listed rather than derived from {@link AnyChannel}: its
 * `BaseChannel` fallback would structurally accept DM channels and threads too.
 */
export type NonThreadGuildBasedChannel =
  | AnnouncementChannel
  | CategoryChannel
  | ForumChannel
  | MediaChannel
  | StageChannel
  | TextChannel
  | VoiceChannel;

/**
 * Any channel that belongs to a guild, threads included.
 */
export type GuildBasedChannel = NonThreadGuildBasedChannel | ThreadChannel;

/**
 * Any channel messages can be sent in.
 */
export type TextBasedChannel =
  | AnnouncementChannel
  | DMChannel
  | GroupDMChannel
  | StageChannel
  | TextChannel
  | ThreadChannel
  | VoiceChannel;

/**
 * Any channel members can connect to.
 */
export type VoiceBasedChannel = StageChannel | VoiceChannel;

/**
 * Any guild channel an invite can be created for.
 */
export type GuildInvitableChannel =
  | AnnouncementChannel
  | ForumChannel
  | MediaChannel
  | StageChannel
  | TextChannel
  | VoiceChannel;

// ---------------------------------------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A channel, or its ID.
 */
export type ChannelResolvable = AnyChannel | Snowflake;

/**
 * A guild channel (threads included), or its ID.
 */
export type GuildChannelResolvable = GuildBasedChannel | Snowflake;

/**
 * An announcement channel, or its ID.
 */
export type AnnouncementChannelResolvable = AnnouncementChannel | Snowflake;

/**
 * A category channel, or its ID.
 */
export type CategoryChannelResolvable = CategoryChannel | Snowflake;

/**
 * A stage channel, or its ID.
 */
export type StageChannelResolvable = Snowflake | StageChannel;

/**
 * A text channel, or its ID.
 */
export type TextChannelResolvable = Snowflake | TextChannel;

/**
 * A text or announcement channel, or its ID.
 */
export type GuildTextChannelResolvable = AnnouncementChannel | Snowflake | TextChannel;

/**
 * A channel messages can be sent in, or its ID.
 */
export type TextBasedChannelResolvable = Snowflake | TextBasedChannel;

/**
 * A thread channel, or its ID.
 */
export type ThreadChannelResolvable = Snowflake | ThreadChannel;

/**
 * A voice channel, or its ID.
 */
export type VoiceChannelResolvable = Snowflake | VoiceChannel;

/**
 * A voice or stage channel, or its ID.
 */
export type GuildVoiceChannelResolvable = Snowflake | VoiceBasedChannel;

/**
 * A guild channel an invite can be created for, or its ID.
 */
export type GuildInvitableChannelResolvable = GuildInvitableChannel | Snowflake;

// ---------------------------------------------------------------------------------------------------------------------
// Guilds
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A guild, something that belongs to a guild, or the guild's ID.
 */
export type GuildResolvable =
  | Guild
  | GuildEmoji
  | GuildInvite
  | GuildMember
  | NonThreadGuildBasedChannel
  | Role
  | Snowflake;

/**
 * A role, or its ID.
 */
export type RoleResolvable = Role | Snowflake;

/**
 * A ban, or the banned user.
 */
export type GuildBanResolvable = GuildBan | UserResolvable;

/**
 * An audit log event to filter by, or `null` for every event.
 */
export type GuildAuditLogsResolvable = AuditLogEvent | null;

/**
 * A scheduled event, or its ID.
 */
export type GuildScheduledEventResolvable = GuildScheduledEvent | Snowflake;

/**
 * A guild template code or URL.
 */
export type GuildTemplateResolvable = string;

/**
 * An auto moderation rule, or its ID.
 */
export type AutoModerationRuleResolvable = AutoModerationRule | Snowflake;

/**
 * A stage instance, or its ID.
 */
export type StageInstanceResolvable = Snowflake | StageInstance;

/**
 * A sticker, or its ID.
 */
export type StickerResolvable = Snowflake | Sticker;

/**
 * A soundboard sound, or its ID.
 */
export type SoundboardSoundResolvable = Snowflake | SoundboardSound | string;

/**
 * An invite code or URL.
 */
export type InviteResolvable = string;

/**
 * A guild invite code or URL.
 */
export type GuildInviteResolvable = string;

// ---------------------------------------------------------------------------------------------------------------------
// Users and members
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A user, something identifying one (a member, a thread member, a message by its author), or the user's ID.
 */
export type UserResolvable = GuildMember | Message | Snowflake | ThreadMember | User;

/**
 * A thread member, or the user it is.
 */
export type ThreadMemberResolvable = ThreadMember | UserResolvable;

/**
 * A presence, or the user it belongs to.
 */
export type PresenceResolvable = Presence | Snowflake | UserResolvable;

// ---------------------------------------------------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A permission overwrite, or the data to create one.
 */
export type OverwriteResolvable = OverwriteData | PermissionOverwrites;

/**
 * A permission overwrite, or the role or user it targets.
 */
export type PermissionOverwriteResolvable = PermissionOverwrites | RoleResolvable | UserResolvable;

// ---------------------------------------------------------------------------------------------------------------------
// Messages and emojis
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A message, or its ID.
 */
export type MessageResolvable = Message | Snowflake;

/**
 * A reaction, or the ID or identifier of its emoji.
 */
export type MessageReactionResolvable = MessageReaction | Snowflake | string;

/**
 * An emoji structure, or a custom emoji's ID.
 */
export type EmojiResolvable = GuildEmoji | ReactionEmoji | Snowflake;

/**
 * The emoji of a component: a raw one, or a Unicode emoji / custom emoji mention to parse.
 */
export type ComponentEmojiResolvable = APIMessageComponentEmoji | string;

/**
 * A component of a message's action row, raw or serializable (a builder).
 */
export type MessageActionRowComponentResolvable =
  | APIComponentInMessageActionRow
  | JSONEncodable<APIComponentInMessageActionRow>;

// ---------------------------------------------------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------------------------------------------------

/**
 * An application, an activity of one, or the application's ID.
 */
export type ApplicationResolvable = Activity | APIApplication | Snowflake;

/**
 * An application command, or its ID.
 */
export type ApplicationCommandResolvable = APIApplicationCommand | Snowflake;

/**
 * The data to create an application command with, raw or serializable (a builder).
 */
export type ApplicationCommandDataResolvable =
  | JSONEncodable<RESTPostAPIApplicationCommandsJSONBody>
  | RESTPostAPIApplicationCommandsJSONBody;

/**
 * Whom an application command permission targets: a channel, a role, or a user. The guild ID stands for `@everyone`
 * and the guild ID minus one for every channel.
 */
export type ApplicationCommandPermissionIdResolvable =
  | GuildChannelResolvable
  | RoleResolvable
  | UserResolvable;

/**
 * The type of an application command option.
 */
export type CommandOptionDataTypeResolvable = ApplicationCommandOptionType;

/**
 * An entitlement, or its ID.
 */
export type EntitlementResolvable = APIEntitlement | Snowflake;

/**
 * A SKU, or its ID.
 */
export type SKUResolvable = APISKU | Snowflake;

/**
 * A subscription, or its ID.
 */
export type SubscriptionResolvable = APISubscription | Snowflake;

// ---------------------------------------------------------------------------------------------------------------------
// Colors and dates
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A `#rrggbb` color string.
 */
export type HexColorString = `#${string}`;

/**
 * A color: a number, a `#rrggbb` string, an RGB tuple, the name of one of the {@link Colors}, or `Random`.
 */
export type ColorResolvable =
  | HexColorString
  | number
  | keyof typeof Colors
  | readonly [red: number, green: number, blue: number]
  | "Random";

/**
 * The colors of a role to edit: see {@link RoleColorsResolvable}.
 */
export interface RoleColorsEditResolvable {
  primaryColor?: ColorResolvable;
  secondaryColor?: ColorResolvable | null;
  tertiaryColor?: ColorResolvable | null;
}

/**
 * The colors of a role: `primaryColor` alone for a solid color, with `secondaryColor` for a gradient, and with
 * `tertiaryColor` for the holographic style.
 */
export interface RoleColorsResolvable extends RoleColorsEditResolvable {
  primaryColor: ColorResolvable;
  secondaryColor?: ColorResolvable;
  tertiaryColor?: ColorResolvable;
}

/**
 * A date: a `Date`, a timestamp in milliseconds, or a string `Date` can parse.
 */
export type DateResolvable = Date | number | string;

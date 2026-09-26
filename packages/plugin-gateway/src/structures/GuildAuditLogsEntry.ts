import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { AuditLogEvent, type APIAuditLogChange } from "discord-api-types/v10";
import type { Guild } from "./Guild.js";
import { kData, kRelations, snowflakeTimestamp, Structure } from "./Structure.js";
import type { User } from "./User.js";

/**
 * Whether an audit log action created, deleted, or updated something, like discord.js's `actionType`.
 */
export type AuditLogActionType = "Create" | "Delete" | "Update";

const CreateActions = new Set<AuditLogEvent>([
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelOverwriteCreate,
  AuditLogEvent.MemberBanRemove,
  AuditLogEvent.BotAdd,
  AuditLogEvent.RoleCreate,
  AuditLogEvent.InviteCreate,
  AuditLogEvent.WebhookCreate,
  AuditLogEvent.EmojiCreate,
  AuditLogEvent.MessagePin,
  AuditLogEvent.IntegrationCreate,
  AuditLogEvent.StageInstanceCreate,
  AuditLogEvent.StickerCreate,
  AuditLogEvent.GuildScheduledEventCreate,
  AuditLogEvent.ThreadCreate,
  AuditLogEvent.SoundboardSoundCreate,
  AuditLogEvent.AutoModerationRuleCreate,
  AuditLogEvent.OnboardingPromptCreate,
]);

const DeleteActions = new Set<AuditLogEvent>([
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.ChannelOverwriteDelete,
  AuditLogEvent.MemberKick,
  AuditLogEvent.MemberPrune,
  AuditLogEvent.MemberBanAdd,
  AuditLogEvent.MemberDisconnect,
  AuditLogEvent.RoleDelete,
  AuditLogEvent.InviteDelete,
  AuditLogEvent.WebhookDelete,
  AuditLogEvent.EmojiDelete,
  AuditLogEvent.MessageDelete,
  AuditLogEvent.MessageBulkDelete,
  AuditLogEvent.MessageUnpin,
  AuditLogEvent.IntegrationDelete,
  AuditLogEvent.StageInstanceDelete,
  AuditLogEvent.StickerDelete,
  AuditLogEvent.GuildScheduledEventDelete,
  AuditLogEvent.ThreadDelete,
  AuditLogEvent.SoundboardSoundDelete,
  AuditLogEvent.AutoModerationRuleDelete,
  AuditLogEvent.OnboardingPromptDelete,
]);

/**
 * The relations of a {@link GuildAuditLogsEntry}: the users of the audit log page, or of the cache.
 */
export interface GuildAuditLogsEntryRelations {
  executor?: User | null;
  guild?: Guild | null;
}

/**
 * An entry of a guild's audit log.
 */
export class GuildAuditLogsEntry extends Structure<CacheEntityTypes["auditLogEntries"]> {
  declare public [kRelations]: GuildAuditLogsEntryRelations;

  /**
   * @param data The raw entry, with its guild's ID.
   * @param relations The executor and guild, resolved by `guild.fetchAuditLogs()` or the event.
   */
  public constructor(
    data: CacheEntityTypes["auditLogEntries"],
    relations: GuildAuditLogsEntryRelations = {},
  ) {
    super(data, relations);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get action(): AuditLogEvent {
    return this[kData].action_type;
  }

  public get actionType(): AuditLogActionType {
    if (CreateActions.has(this.action)) return "Create";
    if (DeleteActions.has(this.action)) return "Delete";
    return "Update";
  }

  /**
   * The ID of the user or application that made the change.
   */
  public get executorId(): string | null {
    return this[kData].user_id;
  }

  /**
   * The ID of the affected entity: a user, role, channel, webhook, ...
   */
  public get targetId(): string | null {
    return this[kData].target_id;
  }

  public get reason(): string | null {
    return this[kData].reason ?? null;
  }

  /**
   * The changed fields, with their old and new values.
   */
  public get changes(): readonly APIAuditLogChange[] {
    return this[kData].changes ?? [];
  }

  /**
   * The extra details of some actions, e.g. the channel of a message deletion.
   */
  public get extra() {
    return this[kData].options ?? null;
  }

  public get executor(): User | null {
    return this[kRelations].executor ?? null;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }
}

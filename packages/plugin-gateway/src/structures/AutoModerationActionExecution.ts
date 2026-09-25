import type { GatewayAutoModerationActionExecutionDispatchData } from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import { getGatewayClient } from "../util/container.js";
import type { AutoModerationRule } from "./AutoModerationRule.js";
import type { Guild } from "./Guild.js";
import type { GuildMember } from "./GuildMember.js";
import { kData, kRelations, Structure } from "./Structure.js";
import type { User } from "./User.js";

/**
 * The relations of an {@link AutoModerationActionExecution}, resolved from the cache.
 */
export interface AutoModerationActionExecutionRelations {
  guild?: Guild | null;
  user?: User | null;
}

/**
 * An action auto moderation took on a message or a member.
 */
export class AutoModerationActionExecution extends Structure<GatewayAutoModerationActionExecutionDispatchData> {
  declare public [kRelations]: AutoModerationActionExecutionRelations;

  /**
   * @param data The raw execution.
   * @param relations The guild and user as resolved from the cache.
   */
  public constructor(
    data: GatewayAutoModerationActionExecutionDispatchData,
    relations: AutoModerationActionExecutionRelations = {},
  ) {
    super(data, relations);
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  /**
   * The action taken: blocking the message, alerting a channel, or timing the member out.
   */
  public get action() {
    return this[kData].action;
  }

  public get ruleId() {
    return this[kData].rule_id;
  }

  public get ruleTriggerType() {
    return this[kData].rule_trigger_type;
  }

  public get userId() {
    return this[kData].user_id;
  }

  public get channelId(): string | null {
    return this[kData].channel_id ?? null;
  }

  /**
   * The ID of the message that triggered the rule. Absent when the message was blocked.
   */
  public get messageId(): string | null {
    return this[kData].message_id ?? null;
  }

  /**
   * The ID of the alert message sent to the alert channel, for `SendAlertMessage` actions.
   */
  public get alertSystemMessageId(): string | null {
    return this[kData].alert_system_message_id ?? null;
  }

  /**
   * The content that triggered the rule. Needs the `MessageContent` intent.
   */
  public get content() {
    return this[kData].content;
  }

  public get matchedKeyword(): string | null {
    return this[kData].matched_keyword;
  }

  public get matchedContent(): string | null {
    return this[kData].matched_content;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public get user(): User | null {
    return this[kRelations].user ?? null;
  }

  public fetchRule(): Promise<AutoModerationRule> {
    return getGatewayClient().guilds.autoModerationRules(this.guildId).fetch(this.ruleId);
  }

  public fetchMember(): Promise<GuildMember> {
    return getGatewayClient().members.fetch(this.guildId, this.userId);
  }

  public async fetchChannel(): Promise<AnyChannel | null> {
    const { channelId } = this;
    return channelId ? getGatewayClient().channels.fetch(channelId) : null;
  }
}

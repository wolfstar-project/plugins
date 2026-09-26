import type {
  APIAutoModerationAction,
  APIAutoModerationRule,
  APIAutoModerationRuleTriggerMetadata,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
} from "discord-api-types/v10";
import type { AutoModerationRuleEditOptions } from "../managers/AutoModerationRuleManager.js";
import type { IdResolvable } from "../util/channels.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";

/**
 * The relations of an {@link AutoModerationRule}, resolved from the cache by the guild's rule manager.
 */
export interface AutoModerationRuleRelations {
  guild?: Guild | null;
}

/**
 * An auto moderation rule of a guild.
 */
export class AutoModerationRule extends Structure<APIAutoModerationRule> {
  declare public [kRelations]: AutoModerationRuleRelations;

  /**
   * @param data The raw rule.
   * @param relations The guild as resolved from the cache, by the guild's rule manager.
   */
  public constructor(data: APIAutoModerationRule, relations: AutoModerationRuleRelations = {}) {
    super(data, relations);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get name() {
    return this[kData].name;
  }

  public get creatorId() {
    return this[kData].creator_id;
  }

  public get eventType() {
    return this[kData].event_type;
  }

  public get triggerType() {
    return this[kData].trigger_type;
  }

  public get triggerMetadata(): Readonly<APIAutoModerationRuleTriggerMetadata> {
    return this[kData].trigger_metadata;
  }

  public get actions(): readonly APIAutoModerationAction[] {
    return this[kData].actions;
  }

  public get enabled() {
    return this[kData].enabled;
  }

  public get exemptRoles(): readonly string[] {
    return this[kData].exempt_roles;
  }

  public get exemptChannels(): readonly string[] {
    return this[kData].exempt_channels;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Edits the rule.
   *
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(options: AutoModerationRuleEditOptions): Promise<this> {
    const rule = await getGatewayClient()
      .guilds.autoModerationRules(this.guildId)
      .edit(this.id, options);
    return this[kPatch](rule.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  public setEventType(eventType: AutoModerationRuleEventType, reason?: string): Promise<this> {
    return this.edit({ eventType, reason });
  }

  public setEnabled(enabled = true, reason?: string): Promise<this> {
    return this.edit({ enabled, reason });
  }

  public setActions(actions: readonly APIAutoModerationAction[], reason?: string): Promise<this> {
    return this.edit({ actions, reason });
  }

  public setExemptRoles(roles: readonly IdResolvable[], reason?: string): Promise<this> {
    return this.edit({ exemptRoles: roles, reason });
  }

  public setExemptChannels(channels: readonly IdResolvable[], reason?: string): Promise<this> {
    return this.edit({ exemptChannels: channels, reason });
  }

  /**
   * Sets the keywords of a keyword rule, keeping the rest of its trigger.
   */
  public setKeywordFilter(keywordFilter: readonly string[], reason?: string): Promise<this> {
    return this.editTrigger({ keyword_filter: [...keywordFilter] }, reason);
  }

  /**
   * Sets the regular expressions of a keyword rule, keeping the rest of its trigger.
   */
  public setRegexPatterns(regexPatterns: readonly string[], reason?: string): Promise<this> {
    return this.editTrigger({ regex_patterns: [...regexPatterns] }, reason);
  }

  /**
   * Sets the keyword presets of a keyword preset rule, keeping the rest of its trigger.
   */
  public setPresets(
    presets: readonly AutoModerationRuleKeywordPresetType[],
    reason?: string,
  ): Promise<this> {
    return this.editTrigger({ presets: [...presets] }, reason);
  }

  /**
   * Sets the keywords exempt from the rule, keeping the rest of its trigger.
   */
  public setAllowList(allowList: readonly string[], reason?: string): Promise<this> {
    return this.editTrigger({ allow_list: [...allowList] }, reason);
  }

  /**
   * Sets how many mentions a message may have, for a mention spam rule.
   */
  public setMentionTotalLimit(mentionTotalLimit: number, reason?: string): Promise<this> {
    return this.editTrigger({ mention_total_limit: mentionTotalLimit }, reason);
  }

  /**
   * Sets whether a mention spam rule detects mention raids.
   */
  public setMentionRaidProtectionEnabled(enabled = true, reason?: string): Promise<this> {
    return this.editTrigger({ mention_raid_protection_enabled: enabled }, reason);
  }

  /**
   * Deletes the rule.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().guilds.autoModerationRules(this.guildId).delete(this.id, reason);
    return this;
  }

  // Discord replaces the whole trigger metadata, so the setters merge their field into the current one.
  private editTrigger(patch: APIAutoModerationRuleTriggerMetadata, reason?: string): Promise<this> {
    return this.edit({ triggerMetadata: { ...this.triggerMetadata, ...patch }, reason });
  }
}

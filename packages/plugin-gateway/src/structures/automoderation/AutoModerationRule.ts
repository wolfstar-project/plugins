import { cachedGuild } from "../../util/cache.js";
import { AutoModerationRule as BaseAutoModerationRule } from "@discordjs/structures";
import type {
  APIAutoModerationAction,
  APIAutoModerationRule,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
} from "discord-api-types/v10";
import type { AutoModerationRuleEditOptions } from "../../managers/AutoModerationRuleManager.js";
import type { IdResolvable } from "../../util/channels.js";
import {
  transformAPIAutoModerationAction,
  transformAPIAutoModerationRuleTriggerMetadata,
  transformAutoModerationRuleTriggerMetadata,
  type AutoModerationAction,
  type AutoModerationActionOptions,
  type AutoModerationTriggerMetadata,
  type AutoModerationTriggerMetadataOptions,
} from "../../util/Transformers.js";
import type { Guild } from "../guilds/Guild.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, kPatch, StructureMixin } from "../Structure.js";

/**
 * The relations of an {@link AutoModerationRule}, resolved from the cache by the guild's rule manager.
 */
export interface AutoModerationRuleRelations {
  guild?: Guild | null;
}

export interface AutoModerationRule extends StructureMixin<
  APIAutoModerationRule,
  AutoModerationRuleRelations
> {}

/**
 * An auto moderation rule of a guild: `@discordjs/structures`' `AutoModerationRule`, with its trigger, actions, and
 * exemptions, and actions through the client.
 */
export class AutoModerationRule extends BaseAutoModerationRule {
  /**
   * @param data The raw rule.
   * @param relations The guild as resolved from the cache, by the guild's rule manager.
   */
  public constructor(data: APIAutoModerationRule, relations: AutoModerationRuleRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The settings of the rule's trigger, camel-cased like discord.js's `AutoModerationRule#triggerMetadata`.
   */
  public get triggerMetadata(): AutoModerationTriggerMetadata {
    return transformAPIAutoModerationRuleTriggerMetadata(this[kData].trigger_metadata);
  }

  /**
   * The actions of the rule, camel-cased like discord.js's `AutoModerationRule#actions`.
   */
  public get actions(): AutoModerationAction[] {
    return this[kData].actions.map(transformAPIAutoModerationAction);
  }

  public get exemptRoles(): readonly string[] {
    return this[kData].exempt_roles;
  }

  public get exemptChannels(): readonly string[] {
    return this[kData].exempt_channels;
  }

  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  /**
   * Edits the rule.
   *
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(options: AutoModerationRuleEditOptions): Promise<this> {
    const rule = await this.client.guilds.autoModerationRules(this.guildId).edit(this.id, options);
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

  public setActions(
    actions: readonly (AutoModerationActionOptions | APIAutoModerationAction)[],
    reason?: string,
  ): Promise<this> {
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
    return this.editTrigger({ keywordFilter: [...keywordFilter] }, reason);
  }

  /**
   * Sets the regular expressions of a keyword rule, keeping the rest of its trigger.
   */
  public setRegexPatterns(regexPatterns: readonly string[], reason?: string): Promise<this> {
    return this.editTrigger({ regexPatterns: [...regexPatterns] }, reason);
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
    return this.editTrigger({ allowList: [...allowList] }, reason);
  }

  /**
   * Sets how many mentions a message may have, for a mention spam rule.
   */
  public setMentionTotalLimit(mentionTotalLimit: number, reason?: string): Promise<this> {
    return this.editTrigger({ mentionTotalLimit }, reason);
  }

  /**
   * Sets whether a mention spam rule detects mention raids.
   */
  public setMentionRaidProtectionEnabled(enabled = true, reason?: string): Promise<this> {
    return this.editTrigger({ mentionRaidProtectionEnabled: enabled }, reason);
  }

  /**
   * Deletes the rule.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await this.client.guilds.autoModerationRules(this.guildId).delete(this.id, reason);
    return this;
  }

  // Discord replaces the whole trigger metadata, so the setters merge their field into the current one.
  private editTrigger(patch: AutoModerationTriggerMetadataOptions, reason?: string): Promise<this> {
    // Merged raw: the camel-cased getter fills in the fields the rule's trigger type does not have.
    const triggerMetadata = {
      ...this[kData].trigger_metadata,
      ...transformAutoModerationRuleTriggerMetadata(patch),
    };
    return this.edit({ triggerMetadata, reason });
  }
}

Mixin(AutoModerationRule, [StructureMixin]);

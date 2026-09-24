import { autoModerationRuleKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIAutoModerationAction,
  type APIAutoModerationRule,
  type APIAutoModerationRuleTriggerMetadata,
  type AutoModerationRuleEventType,
  type AutoModerationRuleTriggerType,
  type RESTPatchAPIAutoModerationRuleJSONBody,
  type RESTPostAPIAutoModerationRuleJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { AutoModerationRule } from "../structures/AutoModerationRule.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * The fields of an auto moderation rule that can be edited.
 */
export interface AutoModerationRuleEditOptions {
  name?: string;
  eventType?: AutoModerationRuleEventType;
  /**
   * The trigger's settings. Discord replaces them as a whole.
   */
  triggerMetadata?: APIAutoModerationRuleTriggerMetadata;
  actions?: readonly APIAutoModerationAction[];
  enabled?: boolean;
  exemptRoles?: readonly IdResolvable[];
  exemptChannels?: readonly IdResolvable[];
  reason?: string;
}

/**
 * The options to create an auto moderation rule with.
 */
export interface AutoModerationRuleCreateOptions extends AutoModerationRuleEditOptions {
  name: string;
  eventType: AutoModerationRuleEventType;
  triggerType: AutoModerationRuleTriggerType;
  actions: readonly APIAutoModerationAction[];
}

/**
 * Manages the auto moderation rules of one guild.
 */
export class AutoModerationRuleManager extends CachedManager<
  "autoModerationRules",
  AutoModerationRule,
  [ruleId: string]
> {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "autoModerationRules");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["autoModerationRules"]): AutoModerationRule {
    return new AutoModerationRule(data);
  }

  public keyOf(data: CacheEntityTypes["autoModerationRules"]): string {
    return this.resolveKey(data.id);
  }

  public resolveKey(ruleId: string): string {
    return autoModerationRuleKey(this.guildId, ruleId);
  }

  public override async hydrate(
    data: CacheEntityTypes["autoModerationRules"],
  ): Promise<AutoModerationRule> {
    return new AutoModerationRule(data, { guild: await this.cachedGuild(data.guild_id) });
  }

  /**
   * Fetches every rule of the guild, and caches them.
   */
  public async fetchAll(): Promise<AutoModerationRule[]> {
    const rules = (await container.rest.get(
      Routes.guildAutoModerationRules(this.guildId),
    )) as APIAutoModerationRule[];
    return Promise.all(rules.map((rule) => this._add(rule)));
  }

  /**
   * Creates a rule.
   *
   * @param options The rule's name, trigger, actions, and exemptions.
   */
  public async create(options: AutoModerationRuleCreateOptions): Promise<AutoModerationRule> {
    const body: RESTPostAPIAutoModerationRuleJSONBody = {
      ...toRuleBody(options),
      name: options.name,
      event_type: options.eventType,
      trigger_type: options.triggerType,
      actions: [...options.actions],
    };
    const rule = (await container.rest.post(Routes.guildAutoModerationRules(this.guildId), {
      body,
      reason: options.reason,
    })) as APIAutoModerationRule;
    return this._add(rule);
  }

  /**
   * Edits a rule.
   *
   * @param ruleId The ID of the rule.
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(
    ruleId: string,
    options: AutoModerationRuleEditOptions,
  ): Promise<AutoModerationRule> {
    const rule = (await container.rest.patch(Routes.guildAutoModerationRule(this.guildId, ruleId), {
      body: toRuleBody(options),
      reason: options.reason,
    })) as APIAutoModerationRule;
    return this._add(rule);
  }

  /**
   * Deletes a rule.
   *
   * @param ruleId The ID of the rule.
   * @param reason The reason for the audit log.
   */
  public async delete(ruleId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildAutoModerationRule(this.guildId, ruleId), { reason });
    await this.cache?.delete(this.resolveKey(ruleId));
  }

  protected async fetchRaw(ruleId: string) {
    return (await container.rest.get(
      Routes.guildAutoModerationRule(this.guildId, ruleId),
    )) as APIAutoModerationRule;
  }
}

function toRuleBody(
  options: AutoModerationRuleEditOptions,
): RESTPatchAPIAutoModerationRuleJSONBody {
  const body: RESTPatchAPIAutoModerationRuleJSONBody = {
    name: options.name,
    event_type: options.eventType,
    trigger_metadata: options.triggerMetadata,
    actions: options.actions && [...options.actions],
    enabled: options.enabled,
    exempt_roles: options.exemptRoles?.map(resolveId),
    exempt_channels: options.exemptChannels?.map(resolveId),
  };
  for (const key of Object.keys(body) as (keyof typeof body)[]) {
    if (body[key] === undefined) delete body[key];
  }

  return body;
}

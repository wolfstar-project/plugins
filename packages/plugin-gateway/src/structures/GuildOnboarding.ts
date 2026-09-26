import type {
  APIGuildOnboarding,
  APIGuildOnboardingPrompt,
  APIGuildOnboardingPromptOption,
} from "discord-api-types/v10";
import type { GuildOnboardingEditOptions } from "../managers/GuildManager.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { ReactionEmoji } from "./ReactionEmoji.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";

/**
 * An answer of an onboarding prompt, with the channels and roles it gives.
 */
export class GuildOnboardingPromptOption extends Structure<APIGuildOnboardingPromptOption> {
  public get id() {
    return this[kData].id;
  }

  public get title() {
    return this[kData].title;
  }

  public get description() {
    return this[kData].description;
  }

  public get channelIds() {
    return this[kData].channel_ids;
  }

  public get roleIds() {
    return this[kData].role_ids;
  }

  public get emoji(): ReactionEmoji | null {
    const { emoji } = this[kData];
    return emoji?.id || emoji?.name ? new ReactionEmoji(emoji) : null;
  }
}

/**
 * A question of a guild's onboarding.
 */
export class GuildOnboardingPrompt extends Structure<APIGuildOnboardingPrompt> {
  public get id() {
    return this[kData].id;
  }

  public get title() {
    return this[kData].title;
  }

  public get type() {
    return this[kData].type;
  }

  public get singleSelect() {
    return this[kData].single_select;
  }

  public get required() {
    return this[kData].required;
  }

  /**
   * Whether the prompt is asked during onboarding, rather than only in the channels & roles page.
   */
  public get inOnboarding() {
    return this[kData].in_onboarding;
  }

  public get options(): GuildOnboardingPromptOption[] {
    return this[kData].options.map((option) => new GuildOnboardingPromptOption(option));
  }
}

/**
 * The relations of a {@link GuildOnboarding}: its guild, when cached.
 */
export interface GuildOnboardingRelations {
  guild?: Guild | null;
}

/**
 * The onboarding of a guild: the prompts new members answer, and the channels they start in.
 */
export class GuildOnboarding extends Structure<APIGuildOnboarding> {
  declare public [kRelations]: GuildOnboardingRelations;

  /**
   * @param data The raw onboarding.
   * @param relations The guild, as resolved from the cache.
   */
  public constructor(data: APIGuildOnboarding, relations: GuildOnboardingRelations = {}) {
    super(data, relations);
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get prompts(): GuildOnboardingPrompt[] {
    return this[kData].prompts.map((prompt) => new GuildOnboardingPrompt(prompt));
  }

  /**
   * The channels members are in by default.
   */
  public get defaultChannelIds() {
    return this[kData].default_channel_ids;
  }

  public get enabled() {
    return this[kData].enabled;
  }

  public get mode() {
    return this[kData].mode;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Edits the onboarding.
   *
   * @param options The changes to apply.
   */
  public async edit(options: GuildOnboardingEditOptions): Promise<this> {
    const onboarding = await getGatewayClient().guilds.editOnboarding(this.guildId, options);
    return this[kPatch](onboarding.toJSON());
  }
}

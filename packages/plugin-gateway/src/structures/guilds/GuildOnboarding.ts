import { cachedGuild } from "../../util/cache.js";
import type {
  APIGuildOnboarding,
  APIGuildOnboardingPrompt,
  APIGuildOnboardingPromptOption,
} from "discord-api-types/v10";
import type { GuildOnboardingEditOptions } from "../../managers/GuildManager.js";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { GuildEmoji } from "../emojis/GuildEmoji.js";
import type { Guild } from "./Guild.js";
import type { Role } from "./Role.js";
import { ReactionEmoji } from "../emojis/ReactionEmoji.js";
import { pickCached as pick } from "../../util/cache.js";
import { bindClient, kData, kPatch, kRelations, Structure } from "../Structure.js";

/**
 * The relations of a {@link GuildOnboarding}, shared with its prompts and their options: its guild, and the channels,
 * roles, and custom emojis its prompts refer to, resolved from the cache by `client.guilds`.
 */
export interface GuildOnboardingRelations {
  guild?: Guild | null;
  channels?: ReadonlyMap<string, AnyChannel>;
  roles?: ReadonlyMap<string, Role>;
  emojis?: ReadonlyMap<string, GuildEmoji>;
}

/**
 * An answer of an onboarding prompt, with the channels and roles it gives.
 */
export class GuildOnboardingPromptOption extends Structure<APIGuildOnboardingPromptOption> {
  declare public [kRelations]: GuildOnboardingRelations;

  /**
   * The guild, from the cache, like discord.js's `GuildOnboardingPromptOption#guild`.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * The cached channels the option gives access to, by ID, like discord.js's `GuildOnboardingPromptOption#channels`.
   */
  public get channels(): Map<string, AnyChannel> {
    return pick(this[kData].channel_ids, this[kRelations].channels);
  }

  /**
   * The cached roles the option gives, by ID, like discord.js's `GuildOnboardingPromptOption#roles`.
   */
  public get roles(): Map<string, Role> {
    return pick(this[kData].role_ids, this[kRelations].roles);
  }
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

  /**
   * The emoji of the option: the cached custom emoji of the guild, like discord.js, else the payload's.
   */
  public get emoji(): GuildEmoji | ReactionEmoji | null {
    const { emoji } = this[kData];
    const cached = emoji?.id ? this[kRelations].emojis?.get(emoji.id) : undefined;
    return cached ?? (emoji?.id || emoji?.name ? new ReactionEmoji(emoji) : null);
  }
}

/**
 * A question of a guild's onboarding.
 */
export class GuildOnboardingPrompt extends Structure<APIGuildOnboardingPrompt> {
  declare public [kRelations]: GuildOnboardingRelations;

  /**
   * The guild, from the cache, like discord.js's `GuildOnboardingPrompt#guild`.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }
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
    return this[kData].options.map((option) =>
      bindClient(new GuildOnboardingPromptOption(option, this[kRelations]), this.client),
    );
  }
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
    return this[kData].prompts.map((prompt) =>
      bindClient(new GuildOnboardingPrompt(prompt, this[kRelations]), this.client),
    );
  }

  /**
   * The channels members are in by default.
   */
  public get defaultChannelIds() {
    return this[kData].default_channel_ids;
  }

  /**
   * The cached channels members are added to by default, by ID, like discord.js's
   * `GuildOnboarding#defaultChannels`.
   */
  public get defaultChannels(): Map<string, AnyChannel> {
    return pick(this[kData].default_channel_ids, this[kRelations].channels);
  }

  public get enabled() {
    return this[kData].enabled;
  }

  public get mode() {
    return this[kData].mode;
  }

  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  /**
   * Edits the onboarding.
   *
   * @param options The changes to apply.
   */
  public async edit(options: GuildOnboardingEditOptions): Promise<this> {
    const onboarding = await this.client.guilds.editOnboarding(this.guildId, options);
    return this[kPatch](onboarding.toJSON());
  }
}

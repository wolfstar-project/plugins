import { GuildFeature, type APIGuildWelcomeScreen } from "discord-api-types/v10";
import type { GuildWelcomeScreenEditOptions } from "../managers/GuildManager.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { ReactionEmoji } from "./ReactionEmoji.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";

/**
 * The raw data of a welcome screen, with the ID of its guild.
 */
export type WelcomeScreenData = APIGuildWelcomeScreen & { guild_id: string };

/**
 * A channel suggested by a welcome screen.
 */
export interface WelcomeChannel {
  channelId: string;
  description: string;
  /**
   * The emoji shown next to the channel, if any.
   */
  emoji: ReactionEmoji | null;
}

/**
 * The relations of a {@link WelcomeScreen}: its guild, when cached.
 */
export interface WelcomeScreenRelations {
  guild?: Guild | null;
}

/**
 * The screen new members of a community guild see, suggesting channels to start with.
 */
export class WelcomeScreen extends Structure<WelcomeScreenData> {
  declare public [kRelations]: WelcomeScreenRelations;

  /**
   * @param data The raw welcome screen.
   * @param relations The guild, as resolved from the cache.
   */
  public constructor(data: WelcomeScreenData, relations: WelcomeScreenRelations = {}) {
    super(data, relations);
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get description() {
    return this[kData].description;
  }

  public get welcomeChannels(): WelcomeChannel[] {
    return this[kData].welcome_channels.map((channel) => ({
      channelId: channel.channel_id,
      description: channel.description,
      emoji:
        channel.emoji_id || channel.emoji_name
          ? new ReactionEmoji({ id: channel.emoji_id, name: channel.emoji_name })
          : null,
    }));
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Whether the welcome screen is shown, from the features of the cached guild; `null` when it is not cached.
   */
  public get enabled(): boolean | null {
    return this.guild?.features.includes(GuildFeature.WelcomeScreenEnabled) ?? null;
  }

  /**
   * Edits the welcome screen.
   *
   * @param options The changes to apply.
   */
  public async edit(options: GuildWelcomeScreenEditOptions): Promise<this> {
    const screen = await getGatewayClient().guilds.editWelcomeScreen(this.guildId, options);
    return this[kPatch](screen.toJSON());
  }
}

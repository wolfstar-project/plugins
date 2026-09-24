import type { BaseImageURLOptions, ImageURLOptions } from "@discordjs/rest";
import { GuildFeature, type APIGuild } from "discord-api-types/v10";
import { cdn } from "../util/cdn.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * The raw fields every guild-like payload carries, from the partial guilds of invites to full guilds.
 */
export type AnonymousGuildData = Pick<APIGuild, "features" | "icon" | "id" | "name"> &
  Partial<
    Pick<
      APIGuild,
      | "banner"
      | "description"
      | "nsfw_level"
      | "premium_subscription_count"
      | "splash"
      | "vanity_url_code"
      | "verification_level"
    >
  >;

/**
 * The public attributes shared by {@link Guild} and {@link InviteGuild}, i.e. what an anonymous user can see of a
 * guild.
 *
 * @remarks
 * Merges discord.js's `BaseGuild` and `AnonymousGuild`, there being no `OAuth2Guild` here to justify the split.
 *
 * @typeParam Data The raw guild data this structure wraps.
 */
export class AnonymousGuild<
  Data extends AnonymousGuildData = AnonymousGuildData,
> extends Structure<Data> {
  public get id() {
    return this[kData].id;
  }

  public get name() {
    return this[kData].name;
  }

  public get icon() {
    return this[kData].icon;
  }

  public get features() {
    return this[kData].features;
  }

  public get splash(): string | null {
    return this[kData].splash ?? null;
  }

  public get banner(): string | null {
    return this[kData].banner ?? null;
  }

  public get description(): string | null {
    return this[kData].description ?? null;
  }

  public get verificationLevel() {
    return this[kData].verification_level ?? null;
  }

  /**
   * The vanity invite code of the guild, if any.
   */
  public get vanityURLCode(): string | null {
    return this[kData].vanity_url_code ?? null;
  }

  public get nsfwLevel() {
    return this[kData].nsfw_level ?? null;
  }

  /**
   * The total number of boosts of the guild, or `null` if unknown.
   */
  public get premiumSubscriptionCount(): number | null {
    return this[kData].premium_subscription_count ?? null;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * The acronym shown in place of the guild's icon when it has none.
   */
  public get nameAcronym(): string {
    return this.name
      .replaceAll("'s ", " ")
      .replaceAll(/\w+/g, (word) => word[0]!)
      .replaceAll(/\s/g, "");
  }

  /**
   * Whether the guild is partnered.
   */
  public get partnered(): boolean {
    return this.features.includes(GuildFeature.Partnered);
  }

  /**
   * Whether the guild is verified.
   */
  public get verified(): boolean {
    return this.features.includes(GuildFeature.Verified);
  }

  /**
   * Gets the URL of the guild's icon, or `null` if it has none.
   * @param options The image options.
   */
  public iconURL(options?: ImageURLOptions): string | null {
    const { icon } = this[kData];
    return icon ? cdn.icon(this.id, icon, options) : null;
  }

  /**
   * Gets the URL of the guild's banner, or `null` if it has none.
   * @param options The image options.
   */
  public bannerURL(options?: ImageURLOptions): string | null {
    const { banner } = this[kData];
    return banner ? cdn.banner(this.id, banner, options) : null;
  }

  /**
   * Gets the URL of the guild's invite splash image, or `null` if it has none.
   * @param options The image options.
   */
  public splashURL(options?: BaseImageURLOptions): string | null {
    const { splash } = this[kData];
    return splash ? cdn.splash(this.id, splash, options) : null;
  }

  public toString(): string {
    return this.name;
  }
}

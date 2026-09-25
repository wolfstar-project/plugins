import type { ImageURLOptions } from "@discordjs/rest";
import type { GatewayActivityAssets } from "discord-api-types/v10";
import { cdn } from "../util/cdn.js";
import { kData, Structure } from "./Structure.js";

/**
 * The raw assets of an activity, with the ID of the activity's application.
 */
export type RichPresenceAssetsData = GatewayActivityAssets & { application_id?: string | null };

/**
 * The assets (images and their hover texts) of a rich presence activity.
 */
export class RichPresenceAssets extends Structure<RichPresenceAssetsData> {
  /**
   * The ID of the application the assets belong to, needed to build the URLs of application assets.
   */
  public get applicationId(): string | null {
    return this[kData].application_id ?? null;
  }

  /**
   * The hover text of the large image.
   */
  public get largeText(): string | null {
    return this[kData].large_text ?? null;
  }

  /**
   * The hover text of the small image.
   */
  public get smallText(): string | null {
    return this[kData].small_text ?? null;
  }

  /**
   * The ID of the large image asset, or an external asset in the `platform:id` form.
   */
  public get largeImage(): string | null {
    return this[kData].large_image ?? null;
  }

  /**
   * The ID of the small image asset, or an external asset in the `platform:id` form.
   */
  public get smallImage(): string | null {
    return this[kData].small_image ?? null;
  }

  /**
   * Gets the URL of the small image, or `null` if there is none or it comes from an unsupported platform.
   *
   * @param options The image options, ignored for external assets.
   */
  public smallImageURL(options?: ImageURLOptions): string | null {
    const { smallImage } = this;
    if (!smallImage) return null;
    if (smallImage.includes(":")) {
      const [platform, id] = smallImage.split(":") as [string, string];
      switch (platform) {
        case "mp":
          return `https://media.discordapp.net/${id}`;
        default:
          return null;
      }
    }

    return this.applicationId ? cdn.appAsset(this.applicationId, smallImage, options) : null;
  }

  /**
   * Gets the URL of the large image, or `null` if there is none or it comes from an unsupported platform.
   *
   * @param options The image options, ignored for external assets.
   */
  public largeImageURL(options?: ImageURLOptions): string | null {
    const { largeImage } = this;
    if (!largeImage) return null;
    if (largeImage.includes(":")) {
      const [platform, id] = largeImage.split(":") as [string, string];
      switch (platform) {
        case "mp":
          return `https://media.discordapp.net/${id}`;
        case "spotify":
          return `https://i.scdn.co/image/${id}`;
        case "youtube":
          return `https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`;
        case "twitch":
          return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${id}.png`;
        default:
          return null;
      }
    }

    return this.applicationId ? cdn.appAsset(this.applicationId, largeImage, options) : null;
  }
}

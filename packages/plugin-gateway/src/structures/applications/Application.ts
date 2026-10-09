import type { BaseImageURLOptions } from "@discordjs/rest";
import type { APIApplication } from "discord-api-types/v10";
import { cdn } from "../../util/cdn.js";
import { kData, snowflakeTimestamp, Structure } from "../Structure.js";

/**
 * The raw fields of an application: its ID, and any of the others. `READY` only carries the ID and flags, so a
 * partial application holds just these.
 */
export type ApplicationData = Pick<APIApplication, "id"> & Partial<Omit<APIApplication, "id">>;

/**
 * The public attributes of an application, like discord.js's `Application`.
 *
 * @typeParam Data The raw application data this structure wraps.
 */
export class Application<Data extends ApplicationData = ApplicationData> extends Structure<Data> {
  public get id(): string {
    return this[kData].id;
  }

  /**
   * The name of the application, or `null` while it is not known.
   */
  public get name(): string | null {
    return this[kData].name ?? null;
  }

  /**
   * The description of the application, or `null` if it has none or is not known.
   */
  public get description(): string | null {
    return this[kData].description ?? null;
  }

  /**
   * The hash of the application's icon, or `null` if it has none or is not known.
   */
  public get icon(): string | null {
    return this[kData].icon ?? null;
  }

  /**
   * The hash of the application's cover image, or `null` if it has none or is not known.
   */
  public get cover(): string | null {
    return this[kData].cover_image ?? null;
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Gets the URL of the application's icon, or `null` if it has none.
   *
   * @param options The image options.
   */
  public iconURL(options?: BaseImageURLOptions): string | null {
    const { icon } = this[kData];
    return icon ? cdn.appIcon(this.id, icon, options) : null;
  }

  /**
   * Gets the URL of the application's cover image, or `null` if it has none.
   *
   * @param options The image options.
   */
  public coverURL(options?: BaseImageURLOptions): string | null {
    const { cover_image: cover } = this[kData];
    return cover ? cdn.appIcon(this.id, cover, options) : null;
  }

  /**
   * The name of the application, its ID while the name is not known.
   */
  public toString(): string {
    return this.name ?? this.id;
  }
}

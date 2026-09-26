import type { ActivityType, GatewayActivity } from "discord-api-types/v10";
import { ActivityFlagsBitField } from "../util/flags.js";
import { RichPresenceAssets } from "./RichPresenceAssets.js";
import { kData, Structure } from "./Structure.js";

/**
 * The start and end of an activity.
 */
export interface ActivityTimestamps {
  /**
   * When the activity started, if known.
   */
  start: Date | null;
  /**
   * When the activity ends, if known.
   */
  end: Date | null;
}

/**
 * The party of an activity.
 */
export interface ActivityParty {
  /**
   * The ID of the party.
   */
  id: string | null;
  /**
   * The size of the party, as `[current, max]`.
   */
  size: readonly [current: number, max: number] | null;
}

/**
 * The emoji of a custom status activity.
 */
export interface ActivityEmoji {
  /**
   * The ID of the emoji, or `null` for a unicode emoji.
   */
  id: string | null;
  /**
   * The name of the emoji, or the unicode character.
   */
  name: string | null;
  /**
   * Whether the emoji is animated.
   */
  animated: boolean;
}

/**
 * An activity of a user's presence.
 */
export class Activity extends Structure<GatewayActivity> {
  /**
   * The name of the activity.
   */
  public get name() {
    return this[kData].name;
  }

  /**
   * The type of the activity.
   */
  public get type(): ActivityType {
    return this[kData].type;
  }

  /**
   * The URL of the stream, when the activity is being streamed.
   */
  public get url(): string | null {
    return this[kData].url ?? null;
  }

  /**
   * What the user is currently doing.
   */
  public get details(): string | null {
    return this[kData].details ?? null;
  }

  /**
   * The user's current party status, or the text of a custom status.
   */
  public get state(): string | null {
    return this[kData].state ?? null;
  }

  /**
   * The ID of the application the activity belongs to.
   */
  public get applicationId(): string | null {
    return this[kData].application_id ?? null;
  }

  /**
   * When the activity started and ends, if known.
   */
  public get timestamps(): ActivityTimestamps | null {
    const { timestamps } = this[kData];
    if (!timestamps) return null;
    return {
      start: timestamps.start ? new Date(Number(timestamps.start)) : null,
      end: timestamps.end ? new Date(Number(timestamps.end)) : null,
    };
  }

  /**
   * The party of the activity.
   */
  public get party(): ActivityParty | null {
    const { party } = this[kData];
    if (!party) return null;
    return { id: party.id ?? null, size: party.size ?? null };
  }

  /**
   * The sync ID of the activity, which is the track ID for Spotify activities.
   *
   * @remarks This field is not documented by Discord.
   */
  public get syncId(): string | null {
    return this[kData].sync_id ?? null;
  }

  /**
   * The assets of the activity, when it is a rich presence.
   */
  public get assets(): RichPresenceAssets | null {
    const { assets } = this[kData];
    return assets
      ? new RichPresenceAssets({ ...assets, application_id: this.applicationId })
      : null;
  }

  /**
   * The flags describing the activity.
   */
  public get flags(): Readonly<ActivityFlagsBitField> {
    return new ActivityFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  /**
   * The emoji of a custom status activity.
   */
  public get emoji(): ActivityEmoji | null {
    const { emoji } = this[kData];
    if (!emoji) return null;
    return { id: emoji.id ?? null, name: emoji.name, animated: emoji.animated ?? false };
  }

  /**
   * The labels of the buttons of a rich presence activity.
   */
  public get buttons(): string[] {
    return (this[kData].buttons ?? []).map((button) =>
      typeof button === "string" ? button : button.label,
    );
  }

  /**
   * The timestamp at which the activity was added to the user's session.
   */
  public get createdTimestamp(): number {
    return this[kData].created_at;
  }

  /**
   * The time at which the activity was added to the user's session.
   */
  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Whether this activity equals another: same name, type, URL, state, details and emoji.
   *
   * @param activity The activity to compare with.
   */
  public equals(activity: Activity | null | undefined): boolean {
    if (this === activity) return true;
    if (!activity) return false;
    return (
      this.name === activity.name &&
      this.type === activity.type &&
      this.url === activity.url &&
      this.state === activity.state &&
      this.details === activity.details &&
      this.emoji?.id === activity.emoji?.id &&
      this.emoji?.name === activity.emoji?.name
    );
  }

  public toString(): string {
    return this.name;
  }
}

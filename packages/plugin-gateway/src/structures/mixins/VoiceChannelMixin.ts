import type { ChannelType, VideoQualityMode } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import { editChannel } from "./edit.js";

type Data = {
  bitrate?: number;
  user_limit?: number;
  rtc_region?: string | null;
  video_quality_mode?: number;
};

export interface VoiceChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields of voice and stage channels.
 */
export class VoiceChannelMixin<Type extends ChannelType = ChannelType> {
  public get bitrate(): number {
    return (this[kData] as Data).bitrate ?? 0;
  }

  /**
   * The user limit, `0` when unlimited.
   */
  public get userLimit(): number {
    return (this[kData] as Data).user_limit ?? 0;
  }

  /**
   * The voice region, `null` for automatic.
   */
  public get rtcRegion(): string | null {
    return (this[kData] as Data).rtc_region ?? null;
  }

  public get videoQualityMode(): number | null {
    return (this[kData] as Data).video_quality_mode ?? null;
  }

  public setBitrate(bitrate: number, reason?: string): Promise<this> {
    return editChannel(this, { bitrate, reason });
  }

  /**
   * Sets the user limit.
   *
   * @param userLimit The user limit, `0` for none.
   * @param reason The reason for the audit log.
   */
  public setUserLimit(userLimit: number, reason?: string): Promise<this> {
    return editChannel(this, { userLimit, reason });
  }

  /**
   * Sets the voice region.
   *
   * @param rtcRegion The region, `null` for automatic.
   * @param reason The reason for the audit log.
   */
  public setRTCRegion(rtcRegion: string | null, reason?: string): Promise<this> {
    return editChannel(this, { rtcRegion, reason });
  }

  public setVideoQualityMode(videoQualityMode: VideoQualityMode, reason?: string): Promise<this> {
    return editChannel(this, { videoQualityMode, reason });
  }
}

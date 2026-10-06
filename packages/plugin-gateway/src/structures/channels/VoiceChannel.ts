import { VoiceChannel as BaseVoiceChannel } from "@discordjs/structures";
import {
  Routes,
  type ChannelType,
  type RESTPostAPISoundboardSendSoundJSONBody,
  type RESTPutAPIChannelVoiceStatusJSONBody,
} from "discord-api-types/v10";
import type { SoundboardSound } from "../soundboards/SoundboardSound.js";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { TextGuildChannelMixin } from "./mixins/TextGuildChannelMixin.js";
import { VoiceChannelMixin } from "./mixins/VoiceChannelMixin.js";

export interface VoiceChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GuildVoice>, ChannelRelations>,
    MixinTypes<
      BaseVoiceChannel,
      [
        BaseChannelMixin<ChannelType.GuildVoice>,
        TextChannelMixin<ChannelType.GuildVoice>,
        TextGuildChannelMixin<ChannelType.GuildVoice>,
        GuildChannelMixin<ChannelType.GuildVoice>,
        ChannelParentMixin<ChannelType.GuildVoice>,
        ChannelPermissionMixin<ChannelType.GuildVoice>,
        ChannelSlowmodeMixin<ChannelType.GuildVoice>,
        VoiceChannelMixin<ChannelType.GuildVoice>,
        ChannelWebhooksMixin<ChannelType.GuildVoice>,
      ]
    > {}

// The ephemeral fields of a voice channel, only set once Discord sent them (see `ChannelManager#requestInfo`).
type VoiceChannelInfoData = { status?: string | null; voice_start_time?: number | null };

/**
 * A guild voice channel.
 */
export class VoiceChannel extends BaseVoiceChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.GuildVoice>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The status of the channel, `null` when it has none or it is not known yet. Kept up to date by the
   * `voiceChannelStatusUpdate` event; `client.channels.requestInfo` asks Discord for it.
   */
  public get status(): string | null {
    return (this[kData] as VoiceChannelInfoData).status ?? null;
  }

  /**
   * When the voice session of the channel started, as a Unix timestamp in milliseconds, `null` when no session is
   * running or it is not known yet.
   */
  public get voiceStartTimestamp(): number | null {
    const seconds = (this[kData] as VoiceChannelInfoData).voice_start_time;
    return seconds === undefined || seconds === null ? null : seconds * 1000;
  }

  /**
   * When the voice session of the channel started, `null` when no session is running or it is not known yet.
   */
  public get voiceStartAt(): Date | null {
    const timestamp = this.voiceStartTimestamp;
    return timestamp === null ? null : new Date(timestamp);
  }

  /**
   * Sets the status of the channel. Needs the `SetVoiceChannelStatus` permission, plus `ManageChannels` when the bot
   * is not connected to the channel. The cache is updated by the `VOICE_CHANNEL_STATUS_UPDATE` that follows.
   *
   * @param status The status, up to 500 characters, `null` or an empty string to clear it.
   * @param reason The reason for the audit log.
   */
  public async setStatus(status: string | null, reason?: string): Promise<void> {
    const body: RESTPutAPIChannelVoiceStatusJSONBody = { status };
    await this.client.api.rest.put(Routes.channelVoiceStatus(this.id), { body, reason });
  }

  /**
   * Plays a soundboard sound in the channel. The bot must be connected to it.
   *
   * @param sound The sound, or its ID with the ID of its guild (none for a default sound).
   */
  public async sendSoundboardSound(
    sound: SoundboardSound | { soundId: string; guildId?: string | null },
  ): Promise<void> {
    const body: RESTPostAPISoundboardSendSoundJSONBody = {
      sound_id: sound.soundId,
      source_guild_id: sound.guildId ?? undefined,
    };
    await this.client.api.channels.sendSoundboardSound(this.id, body);
  }
}

Mixin(VoiceChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  TextGuildChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  VoiceChannelMixin,
  ChannelWebhooksMixin,
]);

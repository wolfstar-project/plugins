import {
  Routes,
  type ChannelType,
  type RESTPostAPISoundboardSendSoundJSONBody,
} from "discord-api-types/v10";
import { container } from "../util/container.js";
import type { SoundboardSound } from "./SoundboardSound.js";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { VoiceChannelMixin } from "./mixins/VoiceChannelMixin.js";

export interface VoiceChannel
  extends
    BaseChannelMixin<ChannelType.GuildVoice>,
    TextChannelMixin<ChannelType.GuildVoice>,
    GuildChannelMixin<ChannelType.GuildVoice>,
    ChannelParentMixin<ChannelType.GuildVoice>,
    ChannelPermissionMixin<ChannelType.GuildVoice>,
    ChannelSlowmodeMixin<ChannelType.GuildVoice>,
    VoiceChannelMixin<ChannelType.GuildVoice>,
    ChannelWebhooksMixin<ChannelType.GuildVoice> {}

/**
 * A guild voice channel.
 */
export class VoiceChannel extends Channel<ChannelType.GuildVoice> {
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
    await container.rest.post(Routes.sendSoundboardSound(this.id), { body });
  }
}

Mixin(VoiceChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  VoiceChannelMixin,
  ChannelWebhooksMixin,
]);

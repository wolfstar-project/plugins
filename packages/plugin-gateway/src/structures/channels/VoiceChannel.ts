import { VoiceChannel as BaseVoiceChannel } from "@discordjs/structures";
import {
  type ChannelType,
  type RESTPostAPISoundboardSendSoundJSONBody,
} from "discord-api-types/v10";
import type { SoundboardSound } from "../soundboards/SoundboardSound.js";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
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
    StructureMixin<ChannelDataType<ChannelType.GuildVoice>, ChannelRelations>,
    MixinTypes<
      BaseVoiceChannel,
      [
        BaseChannelMixin<ChannelType.GuildVoice>,
        TextChannelMixin<ChannelType.GuildVoice>,
        GuildChannelMixin<ChannelType.GuildVoice>,
        ChannelParentMixin<ChannelType.GuildVoice>,
        ChannelPermissionMixin<ChannelType.GuildVoice>,
        ChannelSlowmodeMixin<ChannelType.GuildVoice>,
        VoiceChannelMixin<ChannelType.GuildVoice>,
        ChannelWebhooksMixin<ChannelType.GuildVoice>,
      ]
    > {}

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
    await this.client.core.api.channels.sendSoundboardSound(this.id, body);
  }
}

Mixin(VoiceChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  VoiceChannelMixin,
  ChannelWebhooksMixin,
]);

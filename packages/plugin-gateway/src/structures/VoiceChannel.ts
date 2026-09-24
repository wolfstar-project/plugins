import type { ChannelType } from "discord-api-types/v10";
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
export class VoiceChannel extends Channel<ChannelType.GuildVoice> {}

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

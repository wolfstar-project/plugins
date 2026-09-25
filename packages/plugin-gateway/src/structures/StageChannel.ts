import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { VoiceChannelMixin } from "./mixins/VoiceChannelMixin.js";

export interface StageChannel
  extends
    BaseChannelMixin<ChannelType.GuildStageVoice>,
    TextChannelMixin<ChannelType.GuildStageVoice>,
    GuildChannelMixin<ChannelType.GuildStageVoice>,
    ChannelParentMixin<ChannelType.GuildStageVoice>,
    ChannelPermissionMixin<ChannelType.GuildStageVoice>,
    ChannelSlowmodeMixin<ChannelType.GuildStageVoice>,
    VoiceChannelMixin<ChannelType.GuildStageVoice> {}

/**
 * A guild stage channel.
 */
export class StageChannel extends Channel<ChannelType.GuildStageVoice> {}

Mixin(StageChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  VoiceChannelMixin,
]);

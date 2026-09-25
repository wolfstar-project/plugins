import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { ThreadOnlyChannelMixin } from "./mixins/ThreadOnlyChannelMixin.js";

export interface MediaChannel
  extends
    BaseChannelMixin<ChannelType.GuildMedia>,
    GuildChannelMixin<ChannelType.GuildMedia>,
    ChannelParentMixin<ChannelType.GuildMedia>,
    ChannelPermissionMixin<ChannelType.GuildMedia>,
    ChannelSlowmodeMixin<ChannelType.GuildMedia>,
    ChannelTopicMixin<ChannelType.GuildMedia>,
    ThreadOnlyChannelMixin<ChannelType.GuildMedia> {}

/**
 * A guild media channel.
 */
export class MediaChannel extends Channel<ChannelType.GuildMedia> {}

Mixin(MediaChannel, [
  BaseChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  ChannelTopicMixin,
  ThreadOnlyChannelMixin,
]);

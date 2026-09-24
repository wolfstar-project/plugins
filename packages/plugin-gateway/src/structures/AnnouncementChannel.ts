import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface AnnouncementChannel
  extends
    BaseChannelMixin<ChannelType.GuildAnnouncement>,
    TextChannelMixin<ChannelType.GuildAnnouncement>,
    GuildChannelMixin<ChannelType.GuildAnnouncement>,
    ChannelParentMixin<ChannelType.GuildAnnouncement>,
    ChannelPermissionMixin<ChannelType.GuildAnnouncement>,
    ChannelTopicMixin<ChannelType.GuildAnnouncement> {}

/**
 * A guild announcement channel.
 */
export class AnnouncementChannel extends Channel<ChannelType.GuildAnnouncement> {}

Mixin(AnnouncementChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelTopicMixin,
]);

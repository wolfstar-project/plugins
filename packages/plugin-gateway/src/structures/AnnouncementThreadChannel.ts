import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelOwnerMixin } from "./mixins/ChannelOwnerMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { ThreadChannelMixin } from "./mixins/ThreadChannelMixin.js";

export interface AnnouncementThreadChannel
  extends
    BaseChannelMixin<ChannelType.AnnouncementThread>,
    TextChannelMixin<ChannelType.AnnouncementThread>,
    GuildChannelMixin<ChannelType.AnnouncementThread>,
    ChannelOwnerMixin<ChannelType.AnnouncementThread>,
    ChannelParentMixin<ChannelType.AnnouncementThread>,
    ChannelSlowmodeMixin<ChannelType.AnnouncementThread>,
    ThreadChannelMixin<ChannelType.AnnouncementThread> {}

/**
 * A thread of an announcement channel.
 */
export class AnnouncementThreadChannel extends Channel<ChannelType.AnnouncementThread> {}

Mixin(AnnouncementThreadChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelOwnerMixin,
  ChannelParentMixin,
  ChannelSlowmodeMixin,
  ThreadChannelMixin,
]);

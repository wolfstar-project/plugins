import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { ThreadOnlyChannelMixin } from "./mixins/ThreadOnlyChannelMixin.js";

export interface ForumChannel
  extends
    BaseChannelMixin<ChannelType.GuildForum>,
    GuildChannelMixin<ChannelType.GuildForum>,
    ChannelParentMixin<ChannelType.GuildForum>,
    ChannelPermissionMixin<ChannelType.GuildForum>,
    ChannelSlowmodeMixin<ChannelType.GuildForum>,
    ChannelTopicMixin<ChannelType.GuildForum>,
    ThreadOnlyChannelMixin<ChannelType.GuildForum>,
    ChannelWebhooksMixin<ChannelType.GuildForum> {}

/**
 * A guild forum channel.
 */
export class ForumChannel extends Channel<ChannelType.GuildForum> {}

Mixin(ForumChannel, [
  BaseChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  ChannelTopicMixin,
  ThreadOnlyChannelMixin,
  ChannelWebhooksMixin,
]);

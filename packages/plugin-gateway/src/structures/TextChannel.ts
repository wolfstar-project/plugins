import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface TextChannel
  extends
    BaseChannelMixin<ChannelType.GuildText>,
    TextChannelMixin<ChannelType.GuildText>,
    GuildChannelMixin<ChannelType.GuildText>,
    ChannelParentMixin<ChannelType.GuildText>,
    ChannelPermissionMixin<ChannelType.GuildText>,
    ChannelSlowmodeMixin<ChannelType.GuildText>,
    ChannelTopicMixin<ChannelType.GuildText>,
    ChannelWebhooksMixin<ChannelType.GuildText> {}

/**
 * A guild text channel.
 */
export class TextChannel extends Channel<ChannelType.GuildText> {}

Mixin(TextChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  ChannelTopicMixin,
  ChannelWebhooksMixin,
]);

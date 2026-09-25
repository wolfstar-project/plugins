import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { AppliedTagsMixin } from "./mixins/AppliedTagsMixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelOwnerMixin } from "./mixins/ChannelOwnerMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { ThreadChannelMixin } from "./mixins/ThreadChannelMixin.js";

export interface PublicThreadChannel
  extends
    BaseChannelMixin<ChannelType.PublicThread>,
    TextChannelMixin<ChannelType.PublicThread>,
    GuildChannelMixin<ChannelType.PublicThread>,
    ChannelOwnerMixin<ChannelType.PublicThread>,
    ChannelParentMixin<ChannelType.PublicThread>,
    ChannelSlowmodeMixin<ChannelType.PublicThread>,
    ThreadChannelMixin<ChannelType.PublicThread>,
    AppliedTagsMixin<ChannelType.PublicThread> {}

/**
 * A public thread.
 */
export class PublicThreadChannel extends Channel<ChannelType.PublicThread> {}

Mixin(PublicThreadChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelOwnerMixin,
  ChannelParentMixin,
  ChannelSlowmodeMixin,
  ThreadChannelMixin,
  AppliedTagsMixin,
]);

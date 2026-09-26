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

export interface PrivateThreadChannel
  extends
    BaseChannelMixin<ChannelType.PrivateThread>,
    TextChannelMixin<ChannelType.PrivateThread>,
    GuildChannelMixin<ChannelType.PrivateThread>,
    ChannelOwnerMixin<ChannelType.PrivateThread>,
    ChannelParentMixin<ChannelType.PrivateThread>,
    ChannelSlowmodeMixin<ChannelType.PrivateThread>,
    ThreadChannelMixin<ChannelType.PrivateThread> {}

/**
 * A private thread.
 */
export class PrivateThreadChannel extends Channel<ChannelType.PrivateThread> {}

Mixin(PrivateThreadChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelOwnerMixin,
  ChannelParentMixin,
  ChannelSlowmodeMixin,
  ThreadChannelMixin,
]);

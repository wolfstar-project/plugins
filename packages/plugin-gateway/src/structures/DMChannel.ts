import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { DMChannelMixin } from "./mixins/DMChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface DMChannel
  extends
    BaseChannelMixin<ChannelType.DM>,
    DMChannelMixin<ChannelType.DM>,
    TextChannelMixin<ChannelType.DM> {}

/**
 * A direct message channel.
 */
export class DMChannel extends Channel<ChannelType.DM> {}

Mixin(DMChannel, [BaseChannelMixin, DMChannelMixin, TextChannelMixin]);

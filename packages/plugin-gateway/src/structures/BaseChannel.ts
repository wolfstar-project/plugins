import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";

export interface BaseChannel extends BaseChannelMixin<ChannelType> {}

/**
 * A channel of a type no other structure covers yet.
 */
export class BaseChannel extends Channel<ChannelType> {}

Mixin(BaseChannel, [BaseChannelMixin]);

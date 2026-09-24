import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";

export interface CategoryChannel
  extends
    BaseChannelMixin<ChannelType.GuildCategory>,
    GuildChannelMixin<ChannelType.GuildCategory>,
    ChannelPermissionMixin<ChannelType.GuildCategory> {}

/**
 * A guild category.
 */
export class CategoryChannel extends Channel<ChannelType.GuildCategory> {}

Mixin(CategoryChannel, [BaseChannelMixin, GuildChannelMixin, ChannelPermissionMixin]);

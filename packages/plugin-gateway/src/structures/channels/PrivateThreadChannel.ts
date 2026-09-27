import { PrivateThreadChannel as BasePrivateThreadChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelOwnerMixin } from "./mixins/ChannelOwnerMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { ThreadChannelMixin } from "./mixins/ThreadChannelMixin.js";

export interface PrivateThreadChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.PrivateThread>, ChannelRelations>,
    MixinTypes<
      BasePrivateThreadChannel,
      [
        BaseChannelMixin<ChannelType.PrivateThread>,
        TextChannelMixin<ChannelType.PrivateThread>,
        GuildChannelMixin<ChannelType.PrivateThread>,
        ChannelOwnerMixin<ChannelType.PrivateThread>,
        ChannelParentMixin<ChannelType.PrivateThread>,
        ChannelSlowmodeMixin<ChannelType.PrivateThread>,
        ThreadChannelMixin<ChannelType.PrivateThread>,
      ]
    > {}

/**
 * A private thread.
 */
export class PrivateThreadChannel extends BasePrivateThreadChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.PrivateThread>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(PrivateThreadChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelOwnerMixin,
  ChannelParentMixin,
  ChannelSlowmodeMixin,
  ThreadChannelMixin,
]);

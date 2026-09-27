import { PublicThreadChannel as BasePublicThreadChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
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
    StructureMixin<ChannelDataType<ChannelType.PublicThread>, ChannelRelations>,
    MixinTypes<
      BasePublicThreadChannel,
      [
        BaseChannelMixin<ChannelType.PublicThread>,
        TextChannelMixin<ChannelType.PublicThread>,
        GuildChannelMixin<ChannelType.PublicThread>,
        ChannelOwnerMixin<ChannelType.PublicThread>,
        ChannelParentMixin<ChannelType.PublicThread>,
        ChannelSlowmodeMixin<ChannelType.PublicThread>,
        ThreadChannelMixin<ChannelType.PublicThread>,
        AppliedTagsMixin<ChannelType.PublicThread>,
      ]
    > {}

/**
 * A public thread.
 */
export class PublicThreadChannel extends BasePublicThreadChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.PublicThread>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(PublicThreadChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelOwnerMixin,
  ChannelParentMixin,
  ChannelSlowmodeMixin,
  ThreadChannelMixin,
  AppliedTagsMixin,
]);

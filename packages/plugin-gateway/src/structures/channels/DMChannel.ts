import { DMChannel as BaseDMChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { DMChannelMixin } from "./mixins/DMChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface DMChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.DM>, ChannelRelations>,
    MixinTypes<
      BaseDMChannel,
      [
        BaseChannelMixin<ChannelType.DM>,
        DMChannelMixin<ChannelType.DM>,
        TextChannelMixin<ChannelType.DM>,
      ]
    > {}

/**
 * A direct message channel.
 */
export class DMChannel extends BaseDMChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(data: ChannelDataType<ChannelType.DM>, relations: ChannelRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(DMChannel, [StructureMixin, BaseChannelMixin, DMChannelMixin, TextChannelMixin]);

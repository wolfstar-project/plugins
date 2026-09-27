import { GroupDMChannel as BaseGroupDMChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelOwnerMixin } from "./mixins/ChannelOwnerMixin.js";
import { DMChannelMixin } from "./mixins/DMChannelMixin.js";
import { GroupDMMixin } from "./mixins/GroupDMMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface GroupDMChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GroupDM>, ChannelRelations>,
    MixinTypes<
      BaseGroupDMChannel,
      [
        BaseChannelMixin<ChannelType.GroupDM>,
        DMChannelMixin<ChannelType.GroupDM>,
        TextChannelMixin<ChannelType.GroupDM>,
        ChannelOwnerMixin<ChannelType.GroupDM>,
        GroupDMMixin<ChannelType.GroupDM>,
      ]
    > {}

/**
 * A group direct message channel.
 */
export class GroupDMChannel extends BaseGroupDMChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(data: ChannelDataType<ChannelType.GroupDM>, relations: ChannelRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(GroupDMChannel, [
  StructureMixin,
  BaseChannelMixin,
  DMChannelMixin,
  TextChannelMixin,
  ChannelOwnerMixin,
  GroupDMMixin,
]);

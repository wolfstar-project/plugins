import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelOwnerMixin } from "./mixins/ChannelOwnerMixin.js";
import { DMChannelMixin } from "./mixins/DMChannelMixin.js";
import { GroupDMMixin } from "./mixins/GroupDMMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface GroupDMChannel
  extends
    BaseChannelMixin<ChannelType.GroupDM>,
    DMChannelMixin<ChannelType.GroupDM>,
    TextChannelMixin<ChannelType.GroupDM>,
    ChannelOwnerMixin<ChannelType.GroupDM>,
    GroupDMMixin<ChannelType.GroupDM> {}

/**
 * A group direct message channel.
 */
export class GroupDMChannel extends Channel<ChannelType.GroupDM> {}

Mixin(GroupDMChannel, [
  BaseChannelMixin,
  DMChannelMixin,
  TextChannelMixin,
  ChannelOwnerMixin,
  GroupDMMixin,
]);

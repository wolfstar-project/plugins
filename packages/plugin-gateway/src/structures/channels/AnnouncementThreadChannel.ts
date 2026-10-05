import { AnnouncementThreadChannel as BaseAnnouncementThreadChannel } from "@discordjs/structures";
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
import { TextGuildChannelMixin } from "./mixins/TextGuildChannelMixin.js";
import { ThreadChannelMixin } from "./mixins/ThreadChannelMixin.js";

export interface AnnouncementThreadChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.AnnouncementThread>, ChannelRelations>,
    MixinTypes<
      BaseAnnouncementThreadChannel,
      [
        BaseChannelMixin<ChannelType.AnnouncementThread>,
        TextChannelMixin<ChannelType.AnnouncementThread>,
        TextGuildChannelMixin<ChannelType.AnnouncementThread>,
        GuildChannelMixin<ChannelType.AnnouncementThread>,
        ChannelOwnerMixin<ChannelType.AnnouncementThread>,
        ChannelParentMixin<ChannelType.AnnouncementThread>,
        ChannelSlowmodeMixin<ChannelType.AnnouncementThread>,
        ThreadChannelMixin<ChannelType.AnnouncementThread>,
      ]
    > {}

/**
 * A thread of an announcement channel.
 */
export class AnnouncementThreadChannel extends BaseAnnouncementThreadChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.AnnouncementThread>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(AnnouncementThreadChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  TextGuildChannelMixin,
  GuildChannelMixin,
  ChannelOwnerMixin,
  ChannelParentMixin,
  ChannelSlowmodeMixin,
  ThreadChannelMixin,
]);

import { ForumChannel as BaseForumChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { ChannelThreadsMixin } from "./mixins/ChannelThreadsMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { ThreadOnlyChannelMixin } from "./mixins/ThreadOnlyChannelMixin.js";

export interface ForumChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GuildForum>, ChannelRelations>,
    MixinTypes<
      BaseForumChannel,
      [
        BaseChannelMixin<ChannelType.GuildForum>,
        GuildChannelMixin<ChannelType.GuildForum>,
        ChannelParentMixin<ChannelType.GuildForum>,
        ChannelPermissionMixin<ChannelType.GuildForum>,
        ChannelSlowmodeMixin<ChannelType.GuildForum>,
        ChannelTopicMixin<ChannelType.GuildForum>,
        ThreadOnlyChannelMixin<ChannelType.GuildForum>,
        ChannelWebhooksMixin<ChannelType.GuildForum>,
        ChannelThreadsMixin<ChannelType.GuildForum>,
      ]
    > {}

/**
 * A guild forum channel.
 */
export class ForumChannel extends BaseForumChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.GuildForum>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(ForumChannel, [
  StructureMixin,
  BaseChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  ChannelTopicMixin,
  ThreadOnlyChannelMixin,
  ChannelWebhooksMixin,
  ChannelThreadsMixin,
]);

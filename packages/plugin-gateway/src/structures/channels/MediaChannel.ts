import { MediaChannel as BaseMediaChannel } from "@discordjs/structures";
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

export interface MediaChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GuildMedia>, ChannelRelations>,
    MixinTypes<
      BaseMediaChannel,
      [
        BaseChannelMixin<ChannelType.GuildMedia>,
        GuildChannelMixin<ChannelType.GuildMedia>,
        ChannelParentMixin<ChannelType.GuildMedia>,
        ChannelPermissionMixin<ChannelType.GuildMedia>,
        ChannelSlowmodeMixin<ChannelType.GuildMedia>,
        ChannelTopicMixin<ChannelType.GuildMedia>,
        ThreadOnlyChannelMixin<ChannelType.GuildMedia>,
        ChannelWebhooksMixin<ChannelType.GuildMedia>,
        ChannelThreadsMixin<ChannelType.GuildMedia>,
      ]
    > {}

/**
 * A guild media channel.
 */
export class MediaChannel extends BaseMediaChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.GuildMedia>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(MediaChannel, [
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

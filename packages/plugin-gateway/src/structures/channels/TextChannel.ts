import { TextChannel as BaseTextChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelThreadsMixin } from "./mixins/ChannelThreadsMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { TextGuildChannelMixin } from "./mixins/TextGuildChannelMixin.js";

export interface TextChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GuildText>, ChannelRelations>,
    MixinTypes<
      BaseTextChannel,
      [
        BaseChannelMixin<ChannelType.GuildText>,
        TextChannelMixin<ChannelType.GuildText>,
        TextGuildChannelMixin<ChannelType.GuildText>,
        GuildChannelMixin<ChannelType.GuildText>,
        ChannelParentMixin<ChannelType.GuildText>,
        ChannelPermissionMixin<ChannelType.GuildText>,
        ChannelSlowmodeMixin<ChannelType.GuildText>,
        ChannelTopicMixin<ChannelType.GuildText>,
        ChannelWebhooksMixin<ChannelType.GuildText>,
        ChannelThreadsMixin<ChannelType.GuildText>,
      ]
    > {}

/**
 * A guild text channel.
 */
export class TextChannel extends BaseTextChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.GuildText>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(TextChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  TextGuildChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  ChannelTopicMixin,
  ChannelWebhooksMixin,
  ChannelThreadsMixin,
]);

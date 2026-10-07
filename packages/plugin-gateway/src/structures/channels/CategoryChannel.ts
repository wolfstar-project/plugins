import { CategoryChannel as BaseCategoryChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import { CategoryChannelChildManager } from "../../managers/CategoryChannelChildManager.js";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";

export interface CategoryChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GuildCategory>, ChannelRelations>,
    MixinTypes<
      BaseCategoryChannel,
      [
        BaseChannelMixin<ChannelType.GuildCategory>,
        GuildChannelMixin<ChannelType.GuildCategory>,
        ChannelPermissionMixin<ChannelType.GuildCategory>,
      ]
    > {}

/**
 * A guild category.
 */
export class CategoryChannel extends BaseCategoryChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.GuildCategory>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The channels of the category, like discord.js's `CategoryChannel#children`.
   */
  public get children(): CategoryChannelChildManager {
    return new CategoryChannelChildManager(this);
  }
}

Mixin(CategoryChannel, [
  StructureMixin,
  BaseChannelMixin,
  GuildChannelMixin,
  ChannelPermissionMixin,
]);

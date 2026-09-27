import { DMChannel as BaseDMChannel } from "@discordjs/structures";
import type { ChannelType } from "discord-api-types/v10";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, kData, kRelations, StructureMixin } from "../Structure.js";
import { User } from "../users/User.js";
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

  /**
   * The ID of the user the direct message is with, when the payload included them.
   */
  public get recipientId(): string | null {
    return this[kData].recipients?.[0]?.id ?? null;
  }

  /**
   * The user the direct message is with, like discord.js's `DMChannel#recipient`: the cached user, else the one of the
   * payload. `null` when the payload did not include them.
   */
  public get recipient(): User | null {
    const recipient = this[kData].recipients?.[0];
    return this[kRelations].recipient ?? (recipient ? new User(recipient) : null);
  }
}

Mixin(DMChannel, [StructureMixin, BaseChannelMixin, DMChannelMixin, TextChannelMixin]);

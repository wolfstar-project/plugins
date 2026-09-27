import { StageChannel as BaseStageChannel } from "@discordjs/structures";
import { DiscordAPIError } from "@discordjs/rest";
import type { ChannelType } from "discord-api-types/v10";
import type { StageInstanceCreateOptions } from "../../managers/StageInstanceManager.js";
import type { StageInstance } from "../stageInstances/StageInstance.js";
import type { ChannelDataType, ChannelRelations } from "./Channel.js";
import { Mixin, type MixinTypes } from "../Mixin.js";
import { initStructure, kRelations, StructureMixin } from "../Structure.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";
import { VoiceChannelMixin } from "./mixins/VoiceChannelMixin.js";

export interface StageChannel
  extends
    StructureMixin<ChannelDataType<ChannelType.GuildStageVoice>, ChannelRelations>,
    MixinTypes<
      BaseStageChannel,
      [
        BaseChannelMixin<ChannelType.GuildStageVoice>,
        TextChannelMixin<ChannelType.GuildStageVoice>,
        GuildChannelMixin<ChannelType.GuildStageVoice>,
        ChannelParentMixin<ChannelType.GuildStageVoice>,
        ChannelPermissionMixin<ChannelType.GuildStageVoice>,
        ChannelSlowmodeMixin<ChannelType.GuildStageVoice>,
        VoiceChannelMixin<ChannelType.GuildStageVoice>,
        ChannelWebhooksMixin<ChannelType.GuildStageVoice>,
      ]
    > {}

/**
 * A guild stage channel.
 */
export class StageChannel extends BaseStageChannel {
  /**
   * @param data The raw channel.
   * @param relations The guild as resolved from the cache, by `client.channels` or `client.threads`.
   */
  public constructor(
    data: ChannelDataType<ChannelType.GuildStageVoice>,
    relations: ChannelRelations = {},
  ) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The live stage of the channel, from the cache, like discord.js's `StageChannel#stageInstance`: `null` when the
   * stage is not live, when it is not cached, or when the channel was not built by a manager.
   *
   * @remarks
   * Its own `channel` is this channel, and its scheduled event is not resolved: use
   * {@link StageChannel.fetchStageInstance} for the stage with every relation.
   */
  public get stageInstance(): StageInstance | null {
    return this[kRelations].stageInstance ?? null;
  }

  /**
   * Fetches the live stage of the channel, `null` when the stage is not live.
   */
  public async fetchStageInstance(): Promise<StageInstance | null> {
    const { guildId } = this;
    if (!guildId) return null;
    try {
      return await this.client.guilds.stageInstances(guildId).fetch(this.id);
    } catch (error) {
      // Discord answers 404 (Unknown Stage Instance) when the stage is not live.
      if (error instanceof DiscordAPIError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * Starts a stage in the channel.
   *
   * @param options The topic and privacy level, and whether to notify the guild.
   */
  public createStageInstance(options: StageInstanceCreateOptions): Promise<StageInstance> {
    const { guildId } = this;
    if (!guildId) return Promise.reject(new Error(`Channel ${this.id} has no known guild`));
    return this.client.guilds.stageInstances(guildId).create(this.id, options);
  }
}

Mixin(StageChannel, [
  StructureMixin,
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  VoiceChannelMixin,
  ChannelWebhooksMixin,
]);

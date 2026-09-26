import { DiscordAPIError } from "@discordjs/rest";
import type { ChannelType } from "discord-api-types/v10";
import type { StageInstanceCreateOptions } from "../managers/StageInstanceManager.js";
import { getGatewayClient } from "../util/container.js";
import type { StageInstance } from "./StageInstance.js";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
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
    BaseChannelMixin<ChannelType.GuildStageVoice>,
    TextChannelMixin<ChannelType.GuildStageVoice>,
    GuildChannelMixin<ChannelType.GuildStageVoice>,
    ChannelParentMixin<ChannelType.GuildStageVoice>,
    ChannelPermissionMixin<ChannelType.GuildStageVoice>,
    ChannelSlowmodeMixin<ChannelType.GuildStageVoice>,
    VoiceChannelMixin<ChannelType.GuildStageVoice>,
    ChannelWebhooksMixin<ChannelType.GuildStageVoice> {}

/**
 * A guild stage channel.
 */
export class StageChannel extends Channel<ChannelType.GuildStageVoice> {
  /**
   * Fetches the live stage of the channel, `null` when the stage is not live.
   */
  public async fetchStageInstance(): Promise<StageInstance | null> {
    const { guildId } = this;
    if (!guildId) return null;
    try {
      return await getGatewayClient().guilds.stageInstances(guildId).fetch(this.id);
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
    return getGatewayClient().guilds.stageInstances(guildId).create(this.id, options);
  }
}

Mixin(StageChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  VoiceChannelMixin,
  ChannelWebhooksMixin,
]);

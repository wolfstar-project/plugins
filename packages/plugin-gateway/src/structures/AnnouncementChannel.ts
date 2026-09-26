import { type ChannelType } from "discord-api-types/v10";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { getGatewayClient } from "../util/container.js";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
import { ChannelThreadsMixin } from "./mixins/ChannelThreadsMixin.js";
import { ChannelWebhooksMixin } from "./mixins/ChannelWebhooksMixin.js";
import { ChannelTopicMixin } from "./mixins/ChannelTopicMixin.js";
import { GuildChannelMixin } from "./mixins/GuildChannelMixin.js";
import { TextChannelMixin } from "./mixins/TextChannelMixin.js";

export interface AnnouncementChannel
  extends
    BaseChannelMixin<ChannelType.GuildAnnouncement>,
    TextChannelMixin<ChannelType.GuildAnnouncement>,
    GuildChannelMixin<ChannelType.GuildAnnouncement>,
    ChannelParentMixin<ChannelType.GuildAnnouncement>,
    ChannelPermissionMixin<ChannelType.GuildAnnouncement>,
    ChannelSlowmodeMixin<ChannelType.GuildAnnouncement>,
    ChannelTopicMixin<ChannelType.GuildAnnouncement>,
    ChannelWebhooksMixin<ChannelType.GuildAnnouncement>,
    ChannelThreadsMixin<ChannelType.GuildAnnouncement> {}

/**
 * A guild announcement channel.
 */
export class AnnouncementChannel extends Channel<ChannelType.GuildAnnouncement> {
  /**
   * Makes another channel follow this one: messages published here are crossposted there by a webhook.
   *
   * @param channel The channel to post to, or its ID.
   * @param reason The reason for the audit log.
   * @returns The ID of the follower webhook created in the target channel.
   */
  public async addFollower(channel: IdResolvable, reason?: string): Promise<string> {
    const result = await getGatewayClient().core.api.channels.followAnnouncements(
      this.id,
      resolveId(channel),
      { reason },
    );
    return result.webhook_id;
  }
}

Mixin(AnnouncementChannel, [
  BaseChannelMixin,
  TextChannelMixin,
  GuildChannelMixin,
  ChannelParentMixin,
  ChannelPermissionMixin,
  ChannelSlowmodeMixin,
  ChannelTopicMixin,
  ChannelWebhooksMixin,
  ChannelThreadsMixin,
]);

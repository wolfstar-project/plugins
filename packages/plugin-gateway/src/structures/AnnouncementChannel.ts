import {
  Routes,
  type ChannelType,
  type RESTPostAPIChannelFollowersJSONBody,
  type RESTPostAPIChannelFollowersResult,
} from "discord-api-types/v10";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { container } from "../util/container.js";
import { Channel } from "./Channel.js";
import { Mixin } from "./Mixin.js";
import { BaseChannelMixin } from "./mixins/BaseChannelMixin.js";
import { ChannelParentMixin } from "./mixins/ChannelParentMixin.js";
import { ChannelPermissionMixin } from "./mixins/ChannelPermissionMixin.js";
import { ChannelSlowmodeMixin } from "./mixins/ChannelSlowmodeMixin.js";
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
    ChannelWebhooksMixin<ChannelType.GuildAnnouncement> {}

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
    const body: RESTPostAPIChannelFollowersJSONBody = { webhook_channel_id: resolveId(channel) };
    const result = (await container.rest.post(Routes.channelFollowers(this.id), {
      body,
      reason,
    })) as RESTPostAPIChannelFollowersResult;
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
]);

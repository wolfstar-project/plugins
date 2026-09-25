import type { ChannelType } from "discord-api-types/v10";
import type { WebhookCreateOptions } from "../../managers/WebhookManager.js";
import { getGatewayClient } from "../../util/container.js";
import type { Channel } from "../Channel.js";
import type { Webhook } from "../Webhook.js";

export interface ChannelWebhooksMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the webhook actions of the channels that can have webhooks.
 */
export class ChannelWebhooksMixin<Type extends ChannelType = ChannelType> {
  /**
   * Fetches the webhooks of the channel.
   */
  public fetchWebhooks(): Promise<Webhook[]> {
    return getGatewayClient().webhooks.fetchChannel(this.id);
  }

  /**
   * Creates a webhook in the channel.
   *
   * @param options The webhook's name and avatar, and the reason for the audit log.
   */
  public createWebhook(options: WebhookCreateOptions): Promise<Webhook> {
    return getGatewayClient().webhooks.create(this.id, options);
  }
}

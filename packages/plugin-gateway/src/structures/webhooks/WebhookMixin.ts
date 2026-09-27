import type { GatewayClient } from "../../GatewayClient.js";
import type { Message } from "../messages/Message.js";
import {
  MessagePayload,
  type MessagePayloadResolvable,
  type WebhookMessageCreateOptions,
  type WebhookMessageEditOptions,
  type WebhookThreadOptions,
} from "../messages/MessagePayload.js";
import { snowflakeTimestamp } from "../Structure.js";

/**
 * What {@link WebhookMixin} needs from the class it is mixed into.
 */
export interface WebhookMixin {
  readonly id: string;
  readonly token: string | null | undefined;
  readonly client: GatewayClient;
}

/**
 * The members shared by everything posting through a webhook's token, like discord.js's `Webhook.applyToClass`.
 *
 * @remarks
 * Every method calls the API with the webhook's token rather than with the bot's authorization, so they work for
 * webhooks of other applications too.
 */
export class WebhookMixin {
  /**
   * The URL to post to, built from the webhook's ID and token.
   */
  public get url(): string | undefined {
    const { token } = this;
    return token ? `https://discord.com/api/webhooks/${this.id}/${token}` : undefined;
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Sends a message through the webhook.
   *
   * @param options The message, its content, or a {@link MessagePayload}, and the thread to send it in.
   */
  public send(options: MessagePayloadResolvable<WebhookMessageCreateOptions>): Promise<Message> {
    return this.client.webhooks.send(
      this.id,
      this.requireToken(),
      MessagePayload.create(this, options, { webhook: true }),
    );
  }

  /**
   * Sends a Slack-compatible message through the webhook.
   *
   * @param body The Slack message.
   * @param options The thread to send it in.
   */
  public async sendSlackMessage(body: unknown, options: WebhookThreadOptions = {}): Promise<void> {
    await this.client.core.api.webhooks.executeSlack(this.id, this.requireToken(), body, {
      thread_id: options.threadId,
    });
  }

  /**
   * Fetches a message sent by the webhook.
   *
   * @param messageId The ID of the message.
   * @param options The thread the message is in.
   */
  public fetchMessage(messageId: string, options?: WebhookThreadOptions): Promise<Message> {
    return this.client.webhooks.fetchMessage(this.id, this.requireToken(), messageId, options);
  }

  /**
   * Edits a message sent by the webhook.
   *
   * @param messageId The ID of the message.
   * @param options The changes, the new content, or a {@link MessagePayload}, and the thread the message is in.
   */
  public editMessage(
    messageId: string,
    options: MessagePayloadResolvable<WebhookMessageEditOptions>,
  ): Promise<Message> {
    return this.client.webhooks.editMessage(
      this.id,
      this.requireToken(),
      messageId,
      MessagePayload.create(this, options, { webhook: true, edit: true }),
    );
  }

  /**
   * Deletes a message sent by the webhook.
   *
   * @param messageId The ID of the message.
   * @param options The thread the message is in.
   */
  public deleteMessage(messageId: string, options?: WebhookThreadOptions): Promise<void> {
    return this.client.webhooks.deleteMessage(this.id, this.requireToken(), messageId, options);
  }

  /**
   * Gets the webhook's token, throwing when it has none.
   *
   * @internal
   */
  public requireToken(): string {
    const { token } = this;
    if (!token) throw new Error(`Webhook ${this.id} has no token to post with`);
    return token;
  }
}

import {
  type APIWebhook,
  type RESTPatchAPIWebhookJSONBody,
  type RESTPatchAPIWebhookWithTokenMessageJSONBody,
  type RESTPostAPIChannelWebhookJSONBody,
  type RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { Message } from "../structures/messages/Message.js";
import { bindClient } from "../structures/Structure.js";
import { Webhook } from "../structures/webhooks/Webhook.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import {
  MessagePayload,
  type MessagePayloadResolvable,
  type WebhookMessageCreateOptions,
  type WebhookMessageEditOptions,
  type WebhookThreadOptions,
} from "../util/messages.js";

export type { WebhookMessageCreateOptions, WebhookMessageEditOptions, WebhookThreadOptions };

/**
 * The options to create a webhook with.
 */
export interface WebhookCreateOptions {
  name: string;
  /**
   * The avatar, as a data URI.
   */
  avatar?: string | null;
  reason?: string;
}

/**
 * The options to edit a webhook with.
 */
export interface WebhookEditOptions {
  name?: string;
  /**
   * The avatar, as a data URI, `null` to remove it.
   */
  avatar?: string | null;
  /**
   * The channel to move the webhook to. Needs the bot's authorization, not the webhook's token.
   */
  channel?: IdResolvable;
  reason?: string;
}

/**
 * Manages webhooks. Discord does not send them over the gateway, so they are never cached.
 *
 * @remarks
 * Methods taking a webhook's token call the API with it rather than with the bot's authorization, like discord.js's
 * `WebhookClient`: they work for webhooks of other applications too.
 */
export class WebhookManager {
  public readonly client: GatewayClient;

  public constructor(client: GatewayClient) {
    this.client = client;
  }

  /**
   * Fetches a webhook.
   *
   * @param webhookId The ID of the webhook.
   * @param token The webhook's token, to fetch it without the bot's authorization.
   */
  public async fetch(webhookId: string, token?: string): Promise<Webhook> {
    const webhook = await this.client.core.api.webhooks.get(webhookId, { token });
    return this.hydrate(webhook);
  }

  /**
   * Fetches the webhooks of a channel.
   *
   * @param channelId The ID of the channel.
   */
  public async fetchChannel(channelId: string): Promise<Webhook[]> {
    const webhooks = await this.client.core.api.channels.getWebhooks(channelId);
    return Promise.all(webhooks.map((webhook) => this.hydrate(webhook)));
  }

  /**
   * Fetches the webhooks of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchGuild(guildId: string): Promise<Webhook[]> {
    const webhooks = await this.client.core.api.guilds.getWebhooks(guildId);
    return Promise.all(webhooks.map((webhook) => this.hydrate(webhook)));
  }

  /**
   * Creates a webhook in a channel.
   *
   * @param channelId The ID of the channel.
   * @param options The webhook's name and avatar, and the reason for the audit log.
   */
  public async create(channelId: string, options: WebhookCreateOptions): Promise<Webhook> {
    const body: RESTPostAPIChannelWebhookJSONBody = { name: options.name, avatar: options.avatar };
    const webhook = await this.client.core.api.channels.createWebhook(channelId, body, {
      reason: options.reason,
    });
    return this.hydrate(webhook);
  }

  /**
   * Edits a webhook.
   *
   * @param webhookId The ID of the webhook.
   * @param options The fields to edit, and the reason for the audit log.
   * @param token The webhook's token, to edit it without the bot's authorization (which cannot move it).
   */
  public async edit(
    webhookId: string,
    options: WebhookEditOptions,
    token?: string,
  ): Promise<Webhook> {
    const body: RESTPatchAPIWebhookJSONBody = {
      name: options.name,
      avatar: options.avatar,
      channel_id: options.channel === undefined ? undefined : resolveId(options.channel),
    };
    const webhook = await this.client.core.api.webhooks.edit(webhookId, body, {
      token,
      reason: options.reason,
    });
    return this.hydrate(webhook);
  }

  /**
   * Deletes a webhook.
   *
   * @param webhookId The ID of the webhook.
   * @param options The webhook's token, to delete it without the bot's authorization, and the reason for the audit log.
   */
  public async delete(
    webhookId: string,
    options: { token?: string; reason?: string } = {},
  ): Promise<void> {
    await this.client.core.api.webhooks.delete(webhookId, options);
  }

  /**
   * Sends a message through a webhook, and caches it.
   *
   * @param webhookId The ID of the webhook.
   * @param token The webhook's token.
   * @param options The message, or its content, and the thread to send it in.
   */
  public async send(
    webhookId: string,
    token: string,
    options: MessagePayloadResolvable<WebhookMessageCreateOptions>,
  ): Promise<Message> {
    const payload = MessagePayload.create(this.client, options, { webhook: true });
    const { threadId } = payload.options as WebhookThreadOptions;
    const { body, files } = await payload.resolve<RESTPostAPIWebhookWithTokenJSONBody>();
    const message = await this.client.core.api.webhooks.execute(webhookId, token, {
      ...body,
      files,
      thread_id: threadId,
      wait: true,
    });
    return this.client.messages._add(message);
  }

  /**
   * Fetches a message sent by a webhook.
   *
   * @param webhookId The ID of the webhook.
   * @param token The webhook's token.
   * @param messageId The ID of the message.
   * @param options The thread the message is in.
   */
  public async fetchMessage(
    webhookId: string,
    token: string,
    messageId: string,
    options: WebhookThreadOptions = {},
  ): Promise<Message> {
    const message = await this.client.core.api.webhooks.getMessage(webhookId, token, messageId, {
      thread_id: options.threadId,
    });
    return this.client.messages._add(message);
  }

  /**
   * Edits a message sent by a webhook.
   *
   * @param webhookId The ID of the webhook.
   * @param token The webhook's token.
   * @param messageId The ID of the message.
   * @param options The changes, or the new content, and the thread the message is in.
   */
  public async editMessage(
    webhookId: string,
    token: string,
    messageId: string,
    options: MessagePayloadResolvable<WebhookMessageEditOptions>,
  ): Promise<Message> {
    const payload = MessagePayload.create(this.client, options, { webhook: true, edit: true });
    const { threadId } = payload.options as WebhookThreadOptions;
    const { body, files } = await payload.resolve<RESTPatchAPIWebhookWithTokenMessageJSONBody>();
    const message = await this.client.core.api.webhooks.editMessage(webhookId, token, messageId, {
      ...body,
      files,
      thread_id: threadId,
    });
    return this.client.messages._add(message);
  }

  /**
   * Deletes a message sent by a webhook.
   *
   * @param webhookId The ID of the webhook.
   * @param token The webhook's token.
   * @param messageId The ID of the message.
   * @param options The thread the message is in.
   */
  public async deleteMessage(
    webhookId: string,
    token: string,
    messageId: string,
    options: WebhookThreadOptions = {},
  ): Promise<void> {
    await this.client.core.api.webhooks.deleteMessage(webhookId, token, messageId, {
      thread_id: options.threadId,
    });
  }

  /**
   * Builds the structure of a raw webhook, resolving its guild, channel, source guild, source channel, and owner from
   * the cache.
   *
   * @param data The raw webhook.
   */
  public async hydrate(data: APIWebhook): Promise<Webhook> {
    const [guild, channel, sourceGuild, sourceChannel, owner] = await Promise.all([
      data.guild_id ? this.client.guilds.get(data.guild_id) : undefined,
      data.channel_id ? this.client.channels.get(data.channel_id) : undefined,
      data.source_guild ? this.client.guilds.get(data.source_guild.id) : undefined,
      data.source_channel ? this.client.channels.get(data.source_channel.id) : undefined,
      data.user ? this.client.users.resolveData(data.user) : undefined,
    ]);
    return bindClient(
      new Webhook(data, {
        guild: guild ?? null,
        channel: channel ?? null,
        sourceGuild: sourceGuild ?? null,
        sourceChannel: sourceChannel ?? null,
        owner,
      }),
      this.client,
    );
  }
}

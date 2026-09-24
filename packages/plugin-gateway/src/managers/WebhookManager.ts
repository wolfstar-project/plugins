import type { RawFile } from "@discordjs/rest";
import {
  Routes,
  type APIMessage,
  type APIWebhook,
  type RESTPatchAPIWebhookJSONBody,
  type RESTPatchAPIWebhookWithTokenMessageJSONBody,
  type RESTPostAPIChannelWebhookJSONBody,
  type RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { Message } from "../structures/Message.js";
import { Webhook } from "../structures/Webhook.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { container } from "../util/container.js";
import { resolveMessageOptions, type MessagePayloadResolvable } from "../util/messages.js";

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
 * The options to send a message through a webhook with: the REST body, plus the files to attach.
 */
export type WebhookMessageCreateOptions = RESTPostAPIWebhookWithTokenJSONBody & {
  files?: RawFile[];
};

/**
 * The options to edit a message sent by a webhook with: the REST body, plus the files to attach.
 */
export type WebhookMessageEditOptions = RESTPatchAPIWebhookWithTokenMessageJSONBody & {
  files?: RawFile[];
};

/**
 * The thread a webhook message is in, for webhooks of forum and media channels, or of a thread's parent.
 */
export interface WebhookThreadOptions {
  threadId?: string;
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
    const webhook = (await container.rest.get(Routes.webhook(webhookId, token), {
      auth: token === undefined,
    })) as APIWebhook;
    return new Webhook(webhook);
  }

  /**
   * Fetches the webhooks of a channel.
   *
   * @param channelId The ID of the channel.
   */
  public async fetchChannel(channelId: string): Promise<Webhook[]> {
    const webhooks = (await container.rest.get(Routes.channelWebhooks(channelId))) as APIWebhook[];
    return webhooks.map((webhook) => new Webhook(webhook));
  }

  /**
   * Fetches the webhooks of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchGuild(guildId: string): Promise<Webhook[]> {
    const webhooks = (await container.rest.get(Routes.guildWebhooks(guildId))) as APIWebhook[];
    return webhooks.map((webhook) => new Webhook(webhook));
  }

  /**
   * Creates a webhook in a channel.
   *
   * @param channelId The ID of the channel.
   * @param options The webhook's name and avatar, and the reason for the audit log.
   */
  public async create(channelId: string, options: WebhookCreateOptions): Promise<Webhook> {
    const body: RESTPostAPIChannelWebhookJSONBody = { name: options.name, avatar: options.avatar };
    const webhook = (await container.rest.post(Routes.channelWebhooks(channelId), {
      body,
      reason: options.reason,
    })) as APIWebhook;
    return new Webhook(webhook);
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
    const webhook = (await container.rest.patch(Routes.webhook(webhookId, token), {
      body,
      reason: options.reason,
      auth: token === undefined,
    })) as APIWebhook;
    return new Webhook(webhook);
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
    await container.rest.delete(Routes.webhook(webhookId, options.token), {
      reason: options.reason,
      auth: options.token === undefined,
    });
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
    options: MessagePayloadResolvable<WebhookMessageCreateOptions> & WebhookThreadOptions,
  ): Promise<Message> {
    const { threadId, ...payload } =
      typeof options === "string" ? { content: options, threadId: undefined } : options;
    const { body, files } = resolveMessageOptions<WebhookMessageCreateOptions>(payload);
    const message = (await container.rest.post(Routes.webhook(webhookId, token), {
      body,
      files,
      query: threadQuery(threadId, true),
      auth: false,
    })) as APIMessage;
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
    const message = (await container.rest.get(Routes.webhookMessage(webhookId, token, messageId), {
      query: threadQuery(options.threadId),
      auth: false,
    })) as APIMessage;
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
    options: MessagePayloadResolvable<WebhookMessageEditOptions> & WebhookThreadOptions,
  ): Promise<Message> {
    const { threadId, ...payload } =
      typeof options === "string" ? { content: options, threadId: undefined } : options;
    const { body, files } = resolveMessageOptions<WebhookMessageEditOptions>(payload);
    const message = (await container.rest.patch(
      Routes.webhookMessage(webhookId, token, messageId),
      { body, files, query: threadQuery(threadId), auth: false },
    )) as APIMessage;
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
    await container.rest.delete(Routes.webhookMessage(webhookId, token, messageId), {
      query: threadQuery(options.threadId),
      auth: false,
    });
  }
}

// `wait` makes Discord answer with the sent message instead of 204.
function threadQuery(threadId: string | undefined, wait = false): URLSearchParams {
  const query = new URLSearchParams();
  if (wait) query.set("wait", "true");
  if (threadId) query.set("thread_id", threadId);
  return query;
}

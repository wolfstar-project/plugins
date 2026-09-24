import type { ImageURLOptions } from "@discordjs/rest";
import { WebhookType, type APIWebhook } from "discord-api-types/v10";
import type {
  WebhookEditOptions,
  WebhookMessageCreateOptions,
  WebhookMessageEditOptions,
  WebhookThreadOptions,
} from "../managers/WebhookManager.js";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import type { MessagePayloadResolvable } from "../util/messages.js";
import type { Message } from "./Message.js";
import { kData, kPatch, snowflakeTimestamp, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * A webhook: an incoming one posting to a channel, a channel follower, or an application's.
 */
export class Webhook extends Structure<APIWebhook> {
  public get id() {
    return this[kData].id;
  }

  public get type() {
    return this[kData].type;
  }

  public get name(): string | null {
    return this[kData].name;
  }

  public get avatar(): string | null {
    return this[kData].avatar;
  }

  /**
   * The token to post with. Only incoming webhooks have one, and only their creator (or the guild's managers) see it.
   */
  public get token(): string | null {
    return this[kData].token ?? null;
  }

  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  public get channelId(): string | null {
    return this[kData].channel_id;
  }

  public get applicationId(): string | null {
    return this[kData].application_id;
  }

  /**
   * The user who created the webhook, when the payload includes it.
   */
  public get owner(): User | null {
    const { user } = this[kData];
    return user ? new User(user) : null;
  }

  /**
   * The guild a channel follower webhook posts from.
   */
  public get sourceGuild() {
    return this[kData].source_guild ?? null;
  }

  /**
   * The channel a channel follower webhook posts from.
   */
  public get sourceChannel() {
    return this[kData].source_channel ?? null;
  }

  /**
   * The URL to post to, for webhooks with a token.
   */
  public get url(): string | null {
    const { token } = this;
    return (
      this[kData].url ?? (token ? `https://discord.com/api/webhooks/${this.id}/${token}` : null)
    );
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  public avatarURL(options?: Readonly<ImageURLOptions>): string | null {
    const { avatar } = this;
    return avatar ? cdn.avatar(this.id, avatar, options) : null;
  }

  public isIncoming(): boolean {
    return this.type === WebhookType.Incoming;
  }

  public isChannelFollower(): boolean {
    return this.type === WebhookType.ChannelFollower;
  }

  public isApplicationCreated(): boolean {
    return this.type === WebhookType.Application;
  }

  /**
   * Sends a message through the webhook.
   *
   * @param options The message, or its content, and the thread to send it in.
   */
  public send(
    options: MessagePayloadResolvable<WebhookMessageCreateOptions> & WebhookThreadOptions,
  ): Promise<Message> {
    return getGatewayClient().webhooks.send(this.id, this.requireToken(), options);
  }

  /**
   * Edits the webhook, with its token when it has one (then it cannot be moved to another channel).
   *
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(options: WebhookEditOptions): Promise<this> {
    const token = options.channel === undefined ? (this.token ?? undefined) : undefined;
    const webhook = await getGatewayClient().webhooks.edit(this.id, options, token);
    return this[kPatch](webhook.toJSON());
  }

  /**
   * Deletes the webhook.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().webhooks.delete(this.id, { token: this.token ?? undefined, reason });
    return this;
  }

  public fetchMessage(messageId: string, options?: WebhookThreadOptions): Promise<Message> {
    return getGatewayClient().webhooks.fetchMessage(
      this.id,
      this.requireToken(),
      messageId,
      options,
    );
  }

  public editMessage(
    messageId: string,
    options: MessagePayloadResolvable<WebhookMessageEditOptions> & WebhookThreadOptions,
  ): Promise<Message> {
    return getGatewayClient().webhooks.editMessage(
      this.id,
      this.requireToken(),
      messageId,
      options,
    );
  }

  public deleteMessage(messageId: string, options?: WebhookThreadOptions): Promise<void> {
    return getGatewayClient().webhooks.deleteMessage(
      this.id,
      this.requireToken(),
      messageId,
      options,
    );
  }

  private requireToken(): string {
    const { token } = this;
    if (!token) throw new Error(`Webhook ${this.id} has no token to post with`);
    return token;
  }
}

import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIDMChannel,
  type APIMessage,
  type APIUser,
  type RESTPostAPICurrentUserCreateDMChannelJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { DMChannel } from "../structures/DMChannel.js";
import { Message } from "../structures/Message.js";
import { User } from "../structures/User.js";
import { container } from "../util/container.js";
import {
  resolveMessageOptions,
  type MessageCreateOptions,
  type MessagePayloadResolvable,
} from "../util/messages.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link User}s known to the client.
 */
export class UserManager extends CachedManager<"users", User, [userId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "users");
  }

  public createStructure(data: CacheEntityTypes["users"]): User {
    return new User(data);
  }

  public resolveKey(userId: string): string {
    return userId;
  }

  /**
   * Opens a direct message channel with a user, or gets the existing one, and caches it.
   *
   * @remarks
   * Discord returns the existing channel when there is one, so this always calls the API: unlike discord.js, there is
   * no synchronous `dmChannel` lookup to try first.
   *
   * @param userId The ID of the user.
   */
  public async createDM(userId: string): Promise<DMChannel> {
    const body: RESTPostAPICurrentUserCreateDMChannelJSONBody = { recipient_id: userId };
    const channel = (await container.rest.post(Routes.userChannels(), { body })) as APIDMChannel;
    await this.client.cache?.channels.set(channel.id, channel);
    return new DMChannel(channel);
  }

  /**
   * Closes the direct message channel with a user.
   *
   * @param userId The ID of the user.
   * @returns The closed channel.
   */
  public async deleteDM(userId: string): Promise<DMChannel> {
    const channel = await this.createDM(userId);
    await container.rest.delete(Routes.channel(channel.id));
    await this.client.cache?.channels.delete(channel.id);
    return channel;
  }

  /**
   * Sends a direct message to a user.
   *
   * @param userId The ID of the user.
   * @param options The message, or its content.
   */
  public async send(
    userId: string,
    options: MessagePayloadResolvable<MessageCreateOptions>,
  ): Promise<Message> {
    const channel = await this.createDM(userId);
    const { body, files } = resolveMessageOptions(options);
    const message = (await container.rest.post(Routes.channelMessages(channel.id), {
      body,
      files,
    })) as APIMessage;
    return new Message(message);
  }

  protected async fetchRaw(userId: string) {
    return (await container.rest.get(Routes.user(userId))) as APIUser;
  }
}

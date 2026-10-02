import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import { GatewayError, GatewayTypeError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import type { DMChannel } from "../structures/channels/DMChannel.js";
import { Message } from "../structures/messages/Message.js";
import { User } from "../structures/users/User.js";
import type { UserResolvable } from "../types.js";
import { whenAll } from "../util/cache.js";
import type { MessageCreateOptions, MessagePayloadResolvable } from "../util/messages.js";
import { CachedManager, type FetchOptions } from "./CachedManager.js";

/**
 * The options to open a direct message channel with.
 */
export interface CreateDMOptions {
  /**
   * Whether to skip the cache lookup and always call the API.
   *
   * @default false
   */
  force?: boolean;
  /**
   * Whether to store the channel fetched from the API in the cache.
   *
   * @default true
   */
  cache?: boolean;
}

/**
 * Manages the {@link User}s known to the client.
 */
export class UserManager extends CachedManager<"users", User, [userId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "users");
  }

  protected createStructure(data: CacheEntityTypes["users"]): User {
    return new User(data);
  }

  public keyOf(data: CacheEntityTypes["users"]): string {
    return data.id;
  }

  public resolveKey(userId: string): string {
    return userId;
  }

  /**
   * Resolves a {@link UserResolvable} to a user: the user of a member or a thread member, the author of a message, or
   * the cached user of an ID.
   *
   * @param user The user, something holding one, or an ID.
   * @returns The user, or `null` if it is not known.
   */
  public override resolve(user: UserResolvable): Awaitable<User | null> {
    if (typeof user === "string" || user instanceof User) return super.resolve(user);
    if (user instanceof Message) return user.author;
    return user.user;
  }

  /**
   * Resolves a {@link UserResolvable} to a user ID.
   *
   * @param user The user, something holding one, or an ID.
   * @returns The ID, or `null` if the value holds none.
   */
  public override resolveId(user: UserResolvable): string | null {
    // A member and a thread member are identified by their user's ID already.
    return super.resolveId(user instanceof Message ? user.author : (user as User | string));
  }

  /**
   * Gets a user from the cache, fetching it from the API (and caching it) on a cache miss.
   *
   * @param user The user, something holding one, or an ID.
   * @param options Whether to skip the cache, and whether to store the result.
   */
  public override fetch(user: UserResolvable, options: FetchOptions = {}): Promise<User> {
    return super.fetch(this.requireId(user), options);
  }

  /**
   * Gets the cached direct message channel with a user.
   *
   * @remarks
   * It searches the channel cache, which only a synchronous cache that can enumerate its entries allows: the default
   * `CollectionCache` and the in-memory stores. Other caches (a Redis store, `cache: null`) answer `null`.
   *
   * @param user The user, something holding one, or an ID.
   * @returns The channel, or `null` when there is none or the cache cannot be searched.
   */
  public dmChannel(user: UserResolvable): Awaitable<DMChannel | null> {
    return whenAll(
      [this.client.channels._findDM(this.requireId(user))],
      ([channel]) => channel ?? null,
    );
  }

  /**
   * Opens a direct message channel with a user, and caches it. The cached channel is returned without calling the
   * API, unless `force` is set.
   *
   * @param user The user, something holding one, or an ID.
   * @param options Whether to skip the cache, and whether to store the result.
   */
  public async createDM(
    user: UserResolvable,
    { cache = true, force = false }: CreateDMOptions = {},
  ): Promise<DMChannel> {
    const userId = this.requireId(user);
    if (!force) {
      const cached = await this.client.channels._findDM(userId);
      if (cached && !cached.partial) return cached;
    }

    const channel = await this.client.api.users.createDM(userId);
    return (await this.client.channels._add(channel, cache)) as DMChannel;
  }

  /**
   * Closes the direct message channel with a user.
   *
   * @remarks
   * When the channel cache cannot be searched (see {@link UserManager.dmChannel}), whether a channel exists is
   * unknown: Discord is asked for it first, and nothing is thrown.
   *
   * @param user The user, something holding one, or an ID.
   * @returns The closed channel.
   * @throws {GatewayError} `UserNoDMChannel` when the cache was searched and holds no channel with the user.
   */
  public async deleteDM(user: UserResolvable): Promise<DMChannel> {
    const userId = this.requireId(user);
    const cached = await this.client.channels._findDM(userId);
    if (cached === null) throw new GatewayError("UserNoDMChannel");

    const channel = cached ?? (await this.createDM(userId, { force: true }));
    await this.client.api.channels.delete(channel.id);
    await this.client.channels.cache.delete(channel.id);
    return channel;
  }

  /**
   * Sends a direct message to a user.
   *
   * @param user The user, something holding one, or an ID.
   * @param options The message, or its content.
   */
  public async send(
    user: UserResolvable,
    options: MessagePayloadResolvable<MessageCreateOptions>,
  ): Promise<Message> {
    const channel = await this.createDM(user);
    return this.client.messages.send(channel.id, options);
  }

  protected async fetchRaw(userId: string) {
    return this.client.api.users.get(userId);
  }

  private requireId(user: UserResolvable): string {
    const id = this.resolveId(user);
    if (id === null) throw new GatewayTypeError("IdUnresolvable");
    return id;
  }
}

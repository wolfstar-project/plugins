import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  applyGatewayDispatch,
  isIterableCache,
  stageInstanceKey,
  threadMemberKey,
} from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIOverwrite,
  type GatewayChannelInfoDispatchData,
  type GatewayDispatchPayload,
  type GatewayRequestChannelInfoField,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { AnnouncementChannel } from "../structures/channels/AnnouncementChannel.js";
import { AnnouncementThreadChannel } from "../structures/channels/AnnouncementThreadChannel.js";
import { BaseChannel } from "../structures/channels/BaseChannel.js";
import { isThreadChannelType, type ChannelRelations } from "../structures/channels/Channel.js";
import { CategoryChannel } from "../structures/channels/CategoryChannel.js";
import { DMChannel } from "../structures/channels/DMChannel.js";
import { ForumChannel } from "../structures/channels/ForumChannel.js";
import { GroupDMChannel } from "../structures/channels/GroupDMChannel.js";
import { MediaChannel } from "../structures/channels/MediaChannel.js";
import { PrivateThreadChannel } from "../structures/channels/PrivateThreadChannel.js";
import { PublicThreadChannel } from "../structures/channels/PublicThreadChannel.js";
import { StageChannel } from "../structures/channels/StageChannel.js";
import { TextChannel } from "../structures/channels/TextChannel.js";
import { VoiceChannel } from "../structures/channels/VoiceChannel.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { StageInstance } from "../structures/stageInstances/StageInstance.js";
import { bindClient } from "../structures/Structure.js";
import { whenAll, type Cache } from "../util/cache.js";
import { resolveId, toChannelBody, type GuildChannelEditOptions } from "../util/channels.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";
import { PermissionOverwriteManager } from "./PermissionOverwriteManager.js";
import { GatewayRangeError, GatewayTypeError } from "../errors/GatewayError.js";
import { GuildChannelInfoTimeoutError } from "../util/errors.js";
import { shardIdOf } from "../util/shards.js";

/**
 * Any of the channel structures {@link ChannelManager} builds.
 */
export type AnyChannel =
  | AnnouncementChannel
  | AnnouncementThreadChannel
  | BaseChannel
  | CategoryChannel
  | DMChannel
  | ForumChannel
  | GroupDMChannel
  | MediaChannel
  | PrivateThreadChannel
  | PublicThreadChannel
  | StageChannel
  | TextChannel
  | VoiceChannel;

/**
 * Builds the channel structure matching the type of a raw channel, {@link BaseChannel} for unknown types.
 *
 * @param data The raw channel.
 */
export function createChannel(
  data: CacheEntityTypes["channels"],
  relations: ChannelRelations = {},
): AnyChannel {
  switch (data.type) {
    case ChannelType.AnnouncementThread:
      return new AnnouncementThreadChannel(data, relations);
    case ChannelType.DM:
      return new DMChannel(data, relations);
    case ChannelType.GroupDM:
      return new GroupDMChannel(data, relations);
    case ChannelType.GuildAnnouncement:
      return new AnnouncementChannel(data, relations);
    case ChannelType.GuildCategory:
      return new CategoryChannel(data, relations);
    case ChannelType.GuildForum:
      return new ForumChannel(data, relations);
    case ChannelType.GuildMedia:
      return new MediaChannel(data, relations);
    case ChannelType.GuildStageVoice:
      return new StageChannel(data, relations);
    case ChannelType.GuildText:
      return new TextChannel(data, relations);
    case ChannelType.GuildVoice:
      return new VoiceChannel(data, relations);
    case ChannelType.PrivateThread:
      return new PrivateThreadChannel(data, relations);
    case ChannelType.PublicThread:
      return new PublicThreadChannel(data, relations);
    default:
      return new BaseChannel(data, relations);
  }
}

// The raw fields of a guild channel the managers read, whichever its type.
function overwriteHolder(channel: AnyChannel): {
  guild_id?: string;
  parent_id?: string | null;
  permission_overwrites?: APIOverwrite[];
} {
  return channel.toJSON() as never;
}

// A thread, its channel, and the channel's category: no parent chain is any longer.
const MaxParentDepth = 2;

// Guild channels carry their guild's ID, except inside a `GUILD_CREATE`, where the cache adds it.
function channelGuildId(data: CacheEntityTypes["channels"]): string | undefined {
  return "guild_id" in data ? (data.guild_id ?? undefined) : undefined;
}

/**
 * The cache of {@link ChannelManager}: the channel cache, falling back to the thread cache.
 */
class ChannelCache implements Cache<AnyChannel> {
  readonly #channels: Cache<AnyChannel>;

  // A function: `client.threads` is constructed after `client.channels`.
  readonly #threads: () => Cache<AnyChannel>;

  public constructor(channels: Cache<AnyChannel>, threads: () => Cache<AnyChannel>) {
    this.#channels = channels;
    this.#threads = threads;
  }

  public get synchronous(): boolean {
    return this.#channels.synchronous && this.#threads().synchronous;
  }

  public get construct() {
    return this.#channels.construct;
  }

  public add(
    data: Partial<CacheEntityTypes["channels"]>,
    overwrite = false,
  ): Awaitable<AnyChannel> {
    return data.type !== undefined && isThreadChannelType(data.type)
      ? this.#threads().add(data as never, overwrite)
      : this.#channels.add(data as never, overwrite);
  }

  public set(key: string, value: AnyChannel): Awaitable<this> {
    const target = isThreadChannelType(value.type) ? this.#threads() : this.#channels;
    return whenAll([target.set(key, value)], () => this);
  }

  public get(key: string): Awaitable<AnyChannel | undefined> {
    return whenAll([this.#channels.get(key)], ([channel]) => channel ?? this.#threads().get(key));
  }

  public has(key: string): Awaitable<boolean> {
    return whenAll([this.#channels.has(key)], ([has]) => has || this.#threads().has(key));
  }

  public delete(key: string): Awaitable<boolean> {
    return whenAll(
      [this.#channels.delete(key)],
      ([deleted]) => deleted || this.#threads().delete(key),
    );
  }

  public getSize(): Awaitable<number> {
    return whenAll([this.#channels.getSize(), this.#threads().getSize()], ([a, b]) => a + b);
  }

  public clear(): Awaitable<void> {
    return whenAll([this.#channels.clear(), this.#threads().clear()], () => undefined);
  }
}

/**
 * The options to request the ephemeral info of the voice channels of a guild over the gateway with.
 */
export interface ChannelInfoRequestOptions {
  /**
   * The fields to request: `"status"` and `"voice_start_time"` for now. A field Discord does not know is ignored by it.
   */
  fields: readonly (`${GatewayRequestChannelInfoField}` | (string & {}))[];
  /**
   * How long to wait for the reply, in milliseconds, before rejecting with a `GuildChannelInfoTimeoutError`.
   *
   * @default 10_000
   */
  time?: number;
}

interface ChannelInfoRequest {
  timer: NodeJS.Timeout | null;
  resolve(channels: VoiceChannel[]): void;
  reject(error: Error): void;
}

/**
 * Manages the channels known to the client, threads included.
 *
 * @remarks
 * Threads live in their own entity cache, managed by `client.threads`, which {@link ChannelManager.cache} falls back
 * to, so a thread ID resolves like any other channel ID.
 */
export class ChannelManager extends CachedManager<"channels", AnyChannel, [channelId: string]> {
  // The pending `requestInfo`s, by guild: the reply carries no nonce, so a guild has one in flight at a time.
  readonly #infoRequests = new Map<string, ChannelInfoRequest>();

  // Where the next request of a guild waits for the one in flight.
  readonly #infoQueues = new Map<string, Promise<unknown>>();

  public constructor(client: GatewayClient) {
    super(client, "channels");
  }

  // A thread ID resolves like any other channel ID: threads live in their own cache, behind `client.threads`.
  protected override createCache(): Cache<AnyChannel> {
    return new ChannelCache(
      super.createCache(),
      () => this.client.threads.cache as unknown as Cache<AnyChannel>,
    );
  }

  protected createStructure(data: CacheEntityTypes["channels"]): AnyChannel {
    return createChannel(data);
  }

  public keyOf(data: CacheEntityTypes["channels"]): string {
    return data.id;
  }

  public override _hydrate(data: CacheEntityTypes["channels"]): Awaitable<AnyChannel> {
    return whenAll([this.cachedGuild(channelGuildId(data))], ([guild]) =>
      this._hydrateInGuild(data, guild),
    );
  }

  /**
   * Builds a channel (or a thread) whose guild is already resolved, resolving its other relations from the cache: its
   * parent, within the same guild, the recipient of a direct message, the live stage of a stage channel, and whether
   * the bot joined a thread. Used by
   * `client.threads` and by the guild's own channel relations, which must not resolve the guild again.
   *
   * @param data The raw channel.
   * @param guild The guild of the channel, `null` outside of guilds or when it is not cached.
   * @param depth How many parents deep the channel is, which bounds the parent chain (a thread, its channel, and its
   * category) against a corrupted cache.
   * @internal
   */
  public _hydrateInGuild(
    data: CacheEntityTypes["channels"],
    guild: Guild | null,
    depth = 0,
  ): Awaitable<AnyChannel> {
    const { client } = this;
    const parentId = "parent_id" in data ? data.parent_id : null;
    const recipient = data.type === ChannelType.DM ? data.recipients?.[0] : undefined;
    const guildId = channelGuildId(data) ?? guild?.id;
    const thread = isThreadChannelType(data.type);
    const stageKey =
      data.type === ChannelType.GuildStageVoice && guildId
        ? stageInstanceKey(guildId, data.id)
        : null;
    const meKey = thread ? threadMemberKey(data.id, client.user?.id ?? client.id) : null;
    return whenAll(
      [
        parentId && depth < MaxParentDepth ? this.readRaw(parentId) : undefined,
        recipient ? client.users._resolveData(recipient) : undefined,
        stageKey
          ? client.guardCache(
              "stageInstances",
              "get",
              stageKey,
              () => client.cache?.stageInstances?.get(stageKey),
              undefined,
            )
          : undefined,
        meKey
          ? client.guardCache(
              "threadMembers",
              "get",
              meKey,
              () => client.cache?.threadMembers?.get(meKey),
              undefined,
            )
          : undefined,
      ],
      ([parentData, resolvedRecipient, stageData, me]) =>
        whenAll(
          [parentData ? this._hydrateInGuild(parentData, guild, depth + 1) : null],
          ([parent]) => {
            const relations: ChannelRelations = { guild, parent };
            if (recipient) relations.recipient = resolvedRecipient ?? null;
            if (thread && client.cache?.threadMembers) relations.joined = me !== undefined;
            const channel = bindClient(createChannel(data, relations), client);
            if (data.type === ChannelType.GuildStageVoice) {
              // Built here rather than by the stage instance manager, whose relations lead back to this channel.
              relations.stageInstance = stageData
                ? bindClient(new StageInstance(stageData, { guild, channel }), client)
                : null;
            }

            return channel;
          },
        ),
    );
  }

  /**
   * Gets a channel of a guild whose structure is already built, for the guild's own channel relations.
   *
   * @param channelId The ID of the channel.
   * @param guild The guild.
   * @internal
   */
  public _getInGuild(channelId: string, guild: Guild): Awaitable<AnyChannel | null> {
    return whenAll([this.readRaw(channelId)], ([data]) =>
      data ? this._hydrateInGuild(data, guild) : null,
    );
  }

  /**
   * Finds the cached direct message channel with a user, for `client.users`.
   *
   * @remarks
   * Only a synchronous channel cache that can enumerate its entries is searched: scanning every channel of a remote
   * store costs more than asking Discord for the channel.
   *
   * @param userId The ID of the user.
   * @returns The channel, `null` when the cache was searched and holds none, `undefined` when it cannot be searched.
   * @internal
   */
  public _findDM(userId: string): Awaitable<DMChannel | null | undefined> {
    const store = this.rawStore;
    if (store === undefined || store.synchronous !== true || !isIterableCache(store)) {
      return undefined;
    }

    return whenAll([this.guard("entries", null, () => store.entries(), [])], ([entries]) => {
      const found = entries.find(
        ([, data]) => data.type === ChannelType.DM && data.recipients?.[0]?.id === userId,
      );
      if (!found) return null;
      return whenAll(
        [this.cache.get(found[0])],
        ([channel]) => (channel as DMChannel | undefined) ?? null,
      );
    });
  }

  /**
   * Counts the cached channels of a guild, threads excluded, for `GuildChannelManager.channelCountWithoutThreads`.
   * Synchronous when the channel cache is.
   *
   * @param guildId The ID of the guild.
   * @returns The count, `0` when channels are not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   * @internal
   */
  public _countInGuild(guildId: string): Awaitable<number> {
    const store = this.iterableCache();
    if (store === undefined) return 0;

    return whenAll(
      [this.guard("entries", null, () => store.entries(), [])],
      ([entries]) =>
        entries.filter(
          ([, data]) => channelGuildId(data) === guildId && !isThreadChannelType(data.type),
        ).length,
    );
  }

  /**
   * Gets the cached channels of a guild whose category is the given one, for `CategoryChannelChildManager`.
   * Synchronous when the channel cache is.
   *
   * @param guildId The ID of the guild.
   * @param categoryId The ID of the category.
   * @returns The channels, none when channels are not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   * @internal
   */
  public _inCategory(guildId: string, categoryId: string): Awaitable<AnyChannel[]> {
    const store = this.iterableCache();
    if (store === undefined) return [];

    return whenAll([this.guard("entries", null, () => store.entries(), [])], ([entries]) => {
      const ids = entries
        .filter(
          ([, data]) =>
            channelGuildId(data) === guildId &&
            !isThreadChannelType(data.type) &&
            "parent_id" in data &&
            data.parent_id === categoryId,
        )
        .map(([id]) => id);
      return whenAll(
        ids.map((id) => this.cache.get(id)),
        (channels) => channels.filter((channel): channel is AnyChannel => channel !== undefined),
      );
    });
  }

  // Reads a raw channel, without building its structure: a failing store is reported, and counts as a miss.
  private readRaw(channelId: string): Awaitable<CacheEntityTypes["channels"] | undefined> {
    return this.guard("get", channelId, () => this.rawStore?.get(channelId), undefined);
  }

  public resolveKey(channelId: string): string {
    return channelId;
  }

  /**
   * Adds a channel to the cache, handing threads to `client.threads`, whose cache holds them.
   *
   * @internal
   */
  public override _add(
    data: CacheEntityTypes["channels"],
    cache = true,
    options?: AddOptions,
  ): Promise<AnyChannel> {
    return isThreadChannelType(data.type)
      ? this.client.threads._add(data as CacheEntityTypes["threads"], cache, options)
      : super._add(data, cache, options);
  }

  /**
   * Requests the ephemeral info (status, start time of the voice session) of the voice channels of a guild over the
   * gateway, and caches it. discord.js: `guild.fetchChannelInfo()`.
   *
   * @remarks
   * Discord answers with a `CHANNEL_INFO` dispatch, which also updates the cached channels and is emitted as
   * `channelInfo`. The reply has no nonce, so requests for the same guild run one after the other. The request is sent
   * on the guild's shard, which must be one this client runs, and only the process that sent it resolves it.
   *
   * Because the reply cannot be matched to a request, a reply arriving after its request timed out resolves the next
   * request queued for the guild instead, with info that may lack that request's `fields`. Read the cache after such a
   * timeout, or request the same fields again.
   *
   * @param guildId The ID of the guild.
   * @param options The fields to request.
   * @returns The cached voice channels of the guild Discord sent info for, once it is cached.
   */
  public async requestInfo(
    guildId: string,
    options: ChannelInfoRequestOptions,
  ): Promise<VoiceChannel[]> {
    const { fields, time = 10_000 } = options;
    if (fields.length === 0) throw new GatewayRangeError("ChannelInfoFieldsEmpty");

    const previous = this.#infoQueues.get(guildId) ?? Promise.resolve();
    const run = previous.then(() => this.sendInfoRequest(guildId, [...fields], time));
    // The queue never sees a rejection: a failed request must not fail the ones queued behind it.
    const tail = run.catch(() => undefined);
    this.#infoQueues.set(guildId, tail);
    void tail.then(() => {
      if (this.#infoQueues.get(guildId) === tail) this.#infoQueues.delete(guildId);
    });
    return run;
  }

  private async sendInfoRequest(
    guildId: string,
    fields: string[],
    time: number,
  ): Promise<VoiceChannel[]> {
    const shardId = await shardIdOf(this.client, guildId);

    let request!: ChannelInfoRequest;
    const promise = new Promise<VoiceChannel[]>((resolve, reject) => {
      request = { timer: null, resolve, reject };
    });
    this.#infoRequests.set(guildId, request);

    try {
      await this.client.gateway.send(shardId, {
        op: GatewayOpcodes.RequestChannelInfo,
        d: { guild_id: guildId, fields },
      });
    } catch (error) {
      this.settleInfo(guildId, request);
      throw error;
    }

    // The timeout starts once the request is sent, not while it waits for the shard or its rate limit.
    if (this.#infoRequests.get(guildId) === request) {
      request.timer = setTimeout(() => {
        this.settleInfo(guildId, request);
        request.reject(new GuildChannelInfoTimeoutError(guildId, time));
      }, time);
      request.timer.unref?.();
    }
    return promise;
  }

  /**
   * Resolves the pending request of the guild a cached `CHANNEL_INFO` is for.
   *
   * @internal
   */
  public handleChannelInfo(channels: VoiceChannel[], data: GatewayChannelInfoDispatchData): void {
    const request = this.#infoRequests.get(data.guild_id);
    if (!request) return;

    this.settleInfo(data.guild_id, request);
    request.resolve(channels);
  }

  private settleInfo(guildId: string, request: ChannelInfoRequest): void {
    if (request.timer) clearTimeout(request.timer);
    if (this.#infoRequests.get(guildId) === request) this.#infoRequests.delete(guildId);
  }

  /**
   * Edits a channel.
   *
   * @param channelId The ID of the channel.
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(channelId: string, options: GuildChannelEditOptions): Promise<AnyChannel> {
    if (options.lockPermissions && options.permissionOverwrites) {
      throw new GatewayTypeError("ChannelLockPermissionsConflict");
    }

    const body = toChannelBody(options);
    if (options.lockPermissions) {
      const parentId =
        options.parent === undefined
          ? (overwriteHolder(await this.fetch(channelId)).parent_id ?? null)
          : options.parent && resolveId(options.parent);
      if (parentId) {
        body.permission_overwrites = overwriteHolder(
          await this.fetch(parentId),
        ).permission_overwrites;
      }
    }

    const channel = await this.client.api.channels.edit(channelId, body, {
      reason: options.reason,
    });
    return this._add(channel);
  }

  /**
   * Deletes a channel, or closes a direct message, and drops it from the cache with its messages.
   *
   * @param channelId The ID of the channel.
   * @param reason The reason for the audit log.
   */
  public async delete(channelId: string, reason?: string): Promise<void> {
    const channel = await this.client.api.channels.delete(channelId, {
      reason,
    });
    if (!this.client.cache) return;

    // The same cascade as the `CHANNEL_DELETE` (or `THREAD_DELETE`) that follows.
    await applyGatewayDispatch(this.client.cache, {
      op: GatewayOpcodes.Dispatch,
      s: 0,
      t: isThreadChannelType(channel.type)
        ? GatewayDispatchEvents.ThreadDelete
        : GatewayDispatchEvents.ChannelDelete,
      d: channel,
    } as GatewayDispatchPayload);
  }

  /**
   * Gets the permission overwrites of a channel, cache first.
   *
   * @param channelId The ID of the channel.
   */
  public async permissionOverwrites(channelId: string): Promise<PermissionOverwriteManager> {
    const data = overwriteHolder(await this.fetch(channelId));
    return new PermissionOverwriteManager(
      this.client,
      channelId,
      data.guild_id ?? null,
      data.permission_overwrites ?? [],
    );
  }

  protected async fetchRaw(channelId: string) {
    return this.client.api.channels.get(channelId);
  }
}

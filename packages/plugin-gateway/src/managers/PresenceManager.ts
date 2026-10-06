import { presenceKey, type Awaitable, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { ThreadMember } from "../structures/channels/ThreadMember.js";
import { GuildMember } from "../structures/guilds/GuildMember.js";
import { Message } from "../structures/messages/Message.js";
import { Presence } from "../structures/presences/Presence.js";
import type { PresenceResolvable } from "../types.js";
import { whenAll } from "../util/cache.js";
import { CachedManager, fillGuildId, withGuildId, type GuildArgs } from "./CachedManager.js";
import { GatewayError } from "../errors/GatewayError.js";

/**
 * Manages the presences of guild members.
 *
 * @remarks
 * Presences only come from the gateway, with the `GuildPresences` intent: there is no API to fetch them, so `fetch`
 * rejects on a cache miss. Use `cache.get`, which answers `undefined` instead.
 *
 * The cache is keyed by guild and user. `guild.presences` (or `client.guilds.presences(guildId)`) reads it by user
 * ID alone, like discord.js: `guild.presences.cache.get(userId)`.
 *
 * `guild.presences` (or `client.guilds.presences(guildId)`) is this manager built for one guild, like discord.js's:
 * `cache` takes the user's ID alone, and the methods lose their `guildId` argument.
 *
 * @typeParam InGuild Whether the manager was built for one guild.
 */
export class PresenceManager<InGuild extends boolean = false> extends CachedManager<
  "presences",
  Presence,
  [guildId: string, userId: string],
  GuildArgs<InGuild, [userId: string]>
> {
  /**
   * The ID of the guild this manager was built for, `undefined` on `client.presences`.
   */
  public readonly guildId: InGuild extends true ? string : undefined;

  /**
   * @param client The client.
   * @param guildId The guild to build the manager for.
   */
  public constructor(client: GatewayClient, guildId?: string) {
    super(client, "presences", guildId);
    this.guildId = guildId as this["guildId"];
  }

  protected createStructure(data: CacheEntityTypes["presences"]): Presence {
    return new Presence(data);
  }

  public keyOf(data: CacheEntityTypes["presences"]): string {
    return this.resolveKey(data.guild_id, data.user.id);
  }

  public resolveKey(guildId: string, userId: string): string {
    return presenceKey(guildId, userId);
  }

  public override _hydrate(data: CacheEntityTypes["presences"]): Awaitable<Presence> {
    return whenAll(
      [
        this.client.users.cache.get(data.user.id),
        this.client.members.cache.get(this.client.members.resolveKey(data.guild_id, data.user.id)),
        this.cachedGuild(data.guild_id),
      ],
      ([user, member, guild]) =>
        new Presence(data, { user: user ?? null, member: member ?? null, guild }),
    );
  }

  /**
   * Resolves a {@link PresenceResolvable} to the cached presence of its user in a guild.
   *
   * @remarks
   * A string is a **user ID**, not a cache key: read `guild.presences.cache.get(userId)`, or build the key with
   * {@link PresenceManager.resolveKey} to read `cache.get` directly. It is a pure cache read, no request is made and
   * a miss is `null`; presences only come from the gateway.
   *
   * The guild comes from a member or a message, else from a thread member's member or thread, and otherwise from
   * `guildId`. A message sent in a direct message belongs to no guild, so it resolves to `null` unless `guildId` is
   * given.
   *
   * @param presence The presence, something holding a user, or a user ID.
   * @param guildId The guild to look the presence up in, when the value carries none.
   * @returns The presence, or `null` if it is not cached or its guild is unknown.
   */
  public override resolve(
    presence: PresenceResolvable,
    guildId?: string,
  ): Awaitable<Presence | null> {
    if (presence instanceof Presence) return presence;

    const userId = this.resolveId(presence);
    // The manager of a guild only reads that guild.
    const guild = this.guildId ?? this.guildOf(presence) ?? guildId ?? null;
    if (userId === null || guild === null) return null;

    const { presences } = this.client;
    return whenAll(
      [presences.cache.get(presences.resolveKey(guild, userId))],
      ([cached]) => cached ?? null,
    );
  }

  /**
   * Resolves a {@link PresenceResolvable} to a user ID.
   *
   * @remarks
   * This is the ID of the presence's user, like discord.js, and not the cache key {@link PresenceManager.resolveKey}
   * builds from a guild and a user.
   *
   * @param presence The presence, something holding a user, or a user ID.
   * @returns The user ID, or `null` if the value holds none.
   */
  public override resolveId(presence: PresenceResolvable): string | null {
    if (typeof presence === "string") return presence;
    if (presence instanceof Presence) return presence.userId;
    if (presence instanceof Message) return presence.author.id || null;
    return presence.id;
  }

  private guildOf(presence: PresenceResolvable): string | null {
    if (presence instanceof GuildMember || presence instanceof Message) return presence.guildId;
    if (presence instanceof ThreadMember) {
      return presence.guildMember?.guildId ?? presence.thread?.guildId ?? null;
    }
    return null;
  }

  /**
   * Lists the cached presences of a guild.
   *
   * @param guildId The ID of the guild.
   * @returns The cached entries, `[]` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  public async listCached(...args: GuildArgs<InGuild, []>): Promise<Presence[]> {
    const [guildId] = withGuildId<[]>(args);
    const prefix = `${guildId}:`;
    const cache = this.iterableCache();
    const entries = cache ? await this.guard("entries", null, () => cache.entries(), []) : [];
    return Promise.all(
      entries.filter(([key]) => key.startsWith(prefix)).map(([, raw]) => this._build(raw)),
    );
  }

  protected fetchRaw(guildId: string, userId: string): Promise<CacheEntityTypes["presences"]> {
    return Promise.reject(new GatewayError("PresenceNotFetchable", guildId, userId));
  }
}

fillGuildId(PresenceManager, (client) => client.presences, ["listCached"]);

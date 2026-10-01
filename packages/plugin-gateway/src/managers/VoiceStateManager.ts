import { voiceStateKey, type Awaitable, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { VoiceState } from "../structures/voice/VoiceState.js";
import { whenAll } from "../util/cache.js";
import { CachedManager } from "./CachedManager.js";
import { GatewayTypeError } from "../errors/GatewayError.js";

/**
 * Manages the voice states of the members connected to voice channels.
 *
 * @remarks
 * The cache holds them when the bot has the `GuildVoiceStates` intent. `fetch` falls back to the API, which only
 * knows the voice states of connected members.
 */
export class VoiceStateManager extends CachedManager<
  "voiceStates",
  VoiceState,
  [guildId: string, userId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "voiceStates");
  }

  protected createStructure(data: CacheEntityTypes["voiceStates"]): VoiceState {
    return new VoiceState(data);
  }

  public keyOf(data: CacheEntityTypes["voiceStates"]): string {
    if (!data.guild_id)
      throw new GatewayTypeError("CacheKeyUnresolvable", "voice state", "outside of a guild");
    return this.resolveKey(data.guild_id, data.user_id);
  }

  public resolveKey(guildId: string, userId: string): string {
    return voiceStateKey(guildId, userId);
  }

  public override _hydrate(data: CacheEntityTypes["voiceStates"]): Awaitable<VoiceState> {
    const { member, guild_id: guildId, user_id: userId } = data;
    return whenAll(
      [
        member?.user && guildId
          ? this.client.members._resolveData({ ...member, guild_id: guildId })
          : guildId
            ? this.client.members.cache.get(this.client.members.resolveKey(guildId, userId))
            : null,
        this.cachedGuild(guildId),
        data.channel_id ? this.client.channels.cache.get(data.channel_id) : undefined,
      ],
      ([resolvedMember, guild, channel]) =>
        new VoiceState(data, { member: resolvedMember ?? null, guild, channel: channel ?? null }),
    );
  }

  /**
   * Lists the cached voice states of a guild.
   *
   * @param guildId The ID of the guild.
   * @returns The cached entries, `[]` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  public async listCached(guildId: string): Promise<VoiceState[]> {
    const prefix = `${guildId}:`;
    const entries = (await this.iterableCache()?.entries()) ?? [];
    return Promise.all(
      entries.filter(([key]) => key.startsWith(prefix)).map(([, raw]) => this._build(raw)),
    );
  }

  protected async fetchRaw(guildId: string, userId: string) {
    const client = this.client;
    // The bot's own voice state is only reachable as `@me`.
    const target = (client.user?.id ?? client.id) === userId ? "@me" : userId;
    const state =
      target === "@me"
        ? await client.api.voice.getVoiceState(guildId)
        : await client.api.voice.getUserVoiceState(guildId, target);
    return { ...state, guild_id: guildId };
  }
}

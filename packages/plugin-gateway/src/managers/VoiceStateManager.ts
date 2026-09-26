import { voiceStateKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIVoiceState } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { VoiceState } from "../structures/VoiceState.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

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

  public createStructure(data: CacheEntityTypes["voiceStates"]): VoiceState {
    return new VoiceState(data);
  }

  public keyOf(data: CacheEntityTypes["voiceStates"]): string {
    if (!data.guild_id) throw new TypeError("Cannot key a voice state outside of a guild");
    return this.resolveKey(data.guild_id, data.user_id);
  }

  public resolveKey(guildId: string, userId: string): string {
    return voiceStateKey(guildId, userId);
  }

  public override async hydrate(data: CacheEntityTypes["voiceStates"]): Promise<VoiceState> {
    const { member, guild_id: guildId, user_id: userId } = data;
    const [resolvedMember, guild] = await Promise.all([
      member?.user && guildId
        ? this.client.members.resolveData({ ...member, guild_id: guildId })
        : guildId
          ? this.client.members.get(guildId, userId).then((cached) => cached ?? null)
          : null,
      this.cachedGuild(guildId),
    ]);
    return new VoiceState(data, { member: resolvedMember, guild });
  }

  /**
   * Lists the cached voice states of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async listCached(guildId: string): Promise<VoiceState[]> {
    const prefix = `${guildId}:`;
    const entries = (await this.cache?.entries()) ?? [];
    return Promise.all(
      entries.filter(([key]) => key.startsWith(prefix)).map(([, raw]) => this.hydrate(raw)),
    );
  }

  protected async fetchRaw(guildId: string, userId: string) {
    const client = this.client;
    // The bot's own voice state is only reachable as `@me`.
    const target = (client.user?.id ?? client.id) === userId ? "@me" : userId;
    const state = (await container.rest.get(
      Routes.guildVoiceState(guildId, target),
    )) as APIVoiceState;
    return { ...state, guild_id: guildId };
  }
}

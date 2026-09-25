import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes } from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import { container, getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import type { GuildMember } from "./GuildMember.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";
import type { User } from "./User.js";

/**
 * The options to edit a voice state with, only applicable in stage channels.
 */
export interface VoiceStateEditOptions {
  /**
   * Whether the bot requests to become a speaker. Only available on the bot's own voice state.
   */
  requestToSpeak?: boolean;
  /**
   * Whether the user is suppressed, i.e. moved to the audience.
   */
  suppressed?: boolean;
}

/**
 * The relations of a {@link VoiceState}, resolved from the cache by `client.voiceStates`.
 */
export interface VoiceStateRelations {
  member?: GuildMember | null;
  guild?: Guild | null;
}

/**
 * The voice state of a guild member.
 */
export class VoiceState extends Structure<CacheEntityTypes["voiceStates"]> {
  declare public [kRelations]: VoiceStateRelations;

  /**
   * @param data The raw voice state.
   * @param relations The member and guild as resolved from the cache, by `client.voiceStates`.
   */
  public constructor(data: CacheEntityTypes["voiceStates"], relations: VoiceStateRelations = {}) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<CacheEntityTypes["voiceStates"]>>): this {
    if (data.member) this.dropRelations("member");
    return super[kPatch](data);
  }

  /**
   * The ID of the guild this voice state is in, or `null` if the payload did not include it.
   */
  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  /**
   * The ID of the voice or stage channel the member is connected to, or `null` if they are disconnected.
   */
  public get channelId(): string | null {
    return this[kData].channel_id;
  }

  /**
   * The ID of the user this voice state belongs to.
   */
  public get userId() {
    return this[kData].user_id;
  }

  /**
   * The ID of the member's voice session.
   */
  public get sessionId() {
    return this[kData].session_id;
  }

  /**
   * Whether the member is deafened server-wide.
   */
  public get serverDeaf() {
    return this[kData].deaf;
  }

  /**
   * Whether the member is muted server-wide.
   */
  public get serverMute() {
    return this[kData].mute;
  }

  /**
   * Whether the member deafened themselves.
   */
  public get selfDeaf() {
    return this[kData].self_deaf;
  }

  /**
   * Whether the member muted themselves.
   */
  public get selfMute() {
    return this[kData].self_mute;
  }

  /**
   * Whether the member's camera is enabled.
   */
  public get selfVideo() {
    return this[kData].self_video;
  }

  /**
   * Whether the member is streaming using "Screen Share".
   */
  public get streaming() {
    return this[kData].self_stream ?? false;
  }

  /**
   * Whether the member is suppressed from speaking. Only meaningful in stage channels.
   */
  public get suppress() {
    return this[kData].suppress;
  }

  /**
   * The timestamp at which the member requested to speak, or `null` if they did not. Only meaningful in stage
   * channels.
   */
  public get requestToSpeakTimestamp(): number | null {
    const timestamp = this[kData].request_to_speak_timestamp;
    return timestamp ? Date.parse(timestamp) : null;
  }

  /**
   * The time at which the member requested to speak, or `null` if they did not.
   */
  public get requestToSpeakAt(): Date | null {
    const { requestToSpeakTimestamp } = this;
    return requestToSpeakTimestamp === null ? null : new Date(requestToSpeakTimestamp);
  }

  /**
   * Whether the member is deafened, either by themselves or server-wide.
   */
  public get deaf() {
    return this.serverDeaf || this.selfDeaf;
  }

  /**
   * Whether the member is muted, either by themselves or server-wide.
   */
  public get mute() {
    return this.serverMute || this.selfMute;
  }

  /**
   * The member, from the payload or the cache. `null` when neither has it, or when the voice state was not built by a
   * manager.
   */
  public get member(): GuildMember | null {
    return this[kRelations].member ?? null;
  }

  /**
   * The guild, from the cache.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  public fetchMember(): Promise<GuildMember> {
    return getGatewayClient().members.fetch(this.requireGuildId(), this.userId);
  }

  public fetchUser(): Promise<User> {
    return getGatewayClient().users.fetch(this.userId);
  }

  /**
   * Fetches the channel the member is connected to, `null` when they are disconnected.
   */
  public async fetchChannel(): Promise<AnyChannel | null> {
    const { channelId } = this;
    return channelId ? getGatewayClient().channels.fetch(channelId) : null;
  }

  /**
   * Fetches the voice state from the API, and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const state = await getGatewayClient().voiceStates.fetch(this.requireGuildId(), this.userId, {
      force: true,
    });
    return this[kPatch](state.toJSON());
  }

  /**
   * Mutes or unmutes the member server-wide.
   */
  public setMute(mute = true, reason?: string): Promise<GuildMember> {
    return getGatewayClient().members.edit(this.requireGuildId(), this.userId, { mute, reason });
  }

  /**
   * Deafens or undeafens the member server-wide.
   */
  public setDeaf(deaf = true, reason?: string): Promise<GuildMember> {
    return getGatewayClient().members.edit(this.requireGuildId(), this.userId, { deaf, reason });
  }

  /**
   * Moves the member to another voice channel, or disconnects them with `null`.
   */
  public setChannel(channel: string | null, reason?: string): Promise<GuildMember> {
    return getGatewayClient().members.edit(this.requireGuildId(), this.userId, {
      channel,
      reason,
    });
  }

  public disconnect(reason?: string): Promise<GuildMember> {
    return this.setChannel(null, reason);
  }

  /**
   * Edits the voice state in a stage channel.
   *
   * @param options Whether to request to speak (the bot only), and whether the member is suppressed.
   */
  public async edit(options: VoiceStateEditOptions): Promise<this> {
    const target = this.resolveTarget();
    if (target !== "@me" && options.requestToSpeak !== undefined) {
      throw new Error("Only the bot's own voice state can request to speak");
    }

    const requestToSpeakTimestamp = options.requestToSpeak
      ? new Date().toISOString()
      : options.requestToSpeak === false
        ? null
        : undefined;
    await container.rest.patch(Routes.guildVoiceState(this.requireGuildId(), target), {
      body: {
        channel_id: this.channelId,
        request_to_speak_timestamp: requestToSpeakTimestamp,
        suppress: options.suppressed,
      },
    });

    return this[kPatch]({
      ...(requestToSpeakTimestamp !== undefined && {
        request_to_speak_timestamp: requestToSpeakTimestamp,
      }),
      ...(options.suppressed !== undefined && { suppress: options.suppressed }),
    });
  }

  /**
   * Requests to speak in a stage channel, or withdraws the request. The bot's own voice state only.
   */
  public setRequestToSpeak(requestToSpeak = true): Promise<this> {
    return this.edit({ requestToSpeak });
  }

  /**
   * Moves the member to the audience of a stage channel, or invites them to speak.
   */
  public setSuppressed(suppressed = true): Promise<this> {
    return this.edit({ suppressed });
  }

  private requireGuildId(): string {
    const { guildId } = this;
    if (!guildId) throw new Error("This voice state does not belong to a guild");
    return guildId;
  }

  // The bot's own voice state is addressed as `@me`, the only one allowed to request to speak.
  private resolveTarget(): string {
    const client = getGatewayClient();
    return (client.user?.id ?? client.id) === this.userId ? "@me" : this.userId;
  }
}

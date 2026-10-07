import { cachedChannel, cachedGuild, cachedMember } from "../../util/cache.js";
import { VoiceState as BaseVoiceState } from "@discordjs/structures";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { Guild } from "../guilds/Guild.js";
import type { GuildMember } from "../guilds/GuildMember.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, kPatch, StructureMixin } from "../Structure.js";
import type { User } from "../users/User.js";
import { GatewayError } from "../../errors/GatewayError.js";

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
  channel?: AnyChannel | null;
}

export interface VoiceState extends StructureMixin<
  CacheEntityTypes["voiceStates"],
  VoiceStateRelations
> {}

/**
 * The voice state of a guild member: `@discordjs/structures`' `VoiceState`, with its member and guild, and actions
 * through the client.
 *
 * @remarks
 * Unlike `@discordjs/structures`', `deaf` and `mute` also account for the member's own deafen and mute; `serverDeaf`
 * and `serverMute` are the server-wide ones.
 */
export class VoiceState extends BaseVoiceState {
  protected override optimizeData(data: Partial<CacheEntityTypes["voiceStates"]>): void {
    this.optimizeTimestamp("request_to_speak_timestamp", data.request_to_speak_timestamp);
  }

  /**
   * @param data The raw voice state.
   * @param relations The member and guild as resolved from the cache, by `client.voiceStates`.
   */
  public constructor(data: CacheEntityTypes["voiceStates"], relations: VoiceStateRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public [kPatch](data: Readonly<Partial<CacheEntityTypes["voiceStates"]>>): this {
    if (data.member) this.dropRelations("member");
    this.dropChangedRelations(data, { channel: "channel_id" });
    return StructureMixin.prototype[kPatch].call(this, data) as this;
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
   * Whether the member is streaming using "Screen Share", `false` when the payload did not include it.
   */
  public get streaming() {
    return this[kData].self_stream ?? false;
  }

  /**
   * The time at which the member requested to speak, or `null` if they did not. Only meaningful in stage channels.
   */
  public get requestToSpeakAt(): Date | null {
    const timestamp = this.optimizedTimestamp("request_to_speak_timestamp");
    return timestamp === null ? null : new Date(timestamp);
  }

  /**
   * Whether the member is deafened, either by themselves or server-wide.
   */
  public override get deaf() {
    return this.serverDeaf || this.selfDeaf;
  }

  /**
   * Whether the member is muted, either by themselves or server-wide.
   */
  public override get mute() {
    return this.serverMute || this.selfMute;
  }

  /**
   * The member, from the payload or the cache. `null` when neither has it, or when the cache is asynchronous.
   */
  public get member(): GuildMember | null {
    return this.lazyRelation("member", (client) =>
      cachedMember(client, this[kData].guild_id, this[kData].user_id),
    );
  }

  /**
   * The guild, from the cache.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  /**
   * The channel the member is connected to, from the cache, like discord.js's `VoiceState#channel`. `null` when they
   * are disconnected, when the channel is not cached, or when the cache is asynchronous.
   */
  public get channel(): AnyChannel | null {
    return this.lazyRelation("channel", (client) => cachedChannel(client, this[kData].channel_id));
  }

  public fetchMember(): Promise<GuildMember> {
    return this.client.members.fetch(this.requireGuildId(), this.userId);
  }

  public fetchUser(): Promise<User> {
    return this.client.users.fetch(this.userId);
  }

  /**
   * Fetches the channel the member is connected to, `null` when they are disconnected.
   */
  public async fetchChannel(): Promise<AnyChannel | null> {
    const { channelId } = this;
    return channelId ? this.client.channels.fetch(channelId) : null;
  }

  /**
   * Fetches the voice state from the API, and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const state = await this.client.voiceStates.fetch(this.requireGuildId(), this.userId, {
      force: true,
    });
    return this[kPatch](state.toJSON());
  }

  /**
   * Mutes or unmutes the member server-wide.
   */
  public setMute(mute = true, reason?: string): Promise<GuildMember> {
    return this.client.members.edit(this.requireGuildId(), this.userId, { mute, reason });
  }

  /**
   * Deafens or undeafens the member server-wide.
   */
  public setDeaf(deaf = true, reason?: string): Promise<GuildMember> {
    return this.client.members.edit(this.requireGuildId(), this.userId, { deaf, reason });
  }

  /**
   * Moves the member to another voice channel, or disconnects them with `null`.
   */
  public setChannel(channel: string | null, reason?: string): Promise<GuildMember> {
    return this.client.members.edit(this.requireGuildId(), this.userId, {
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
      throw new GatewayError("VoiceStateNotOwn");
    }

    const requestToSpeakTimestamp = options.requestToSpeak
      ? new Date().toISOString()
      : options.requestToSpeak === false
        ? null
        : undefined;
    const body = {
      channel_id: this.channelId ?? undefined,
      request_to_speak_timestamp: requestToSpeakTimestamp,
      suppress: options.suppressed,
    };
    if (target === "@me") {
      await this.client.api.voice.editVoiceState(this.requireGuildId(), body);
    } else {
      await this.client.api.voice.editUserVoiceState(this.requireGuildId(), target, body);
    }

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
    if (!guildId) throw new GatewayError("VoiceStateGuildUnknown");
    return guildId;
  }

  // The bot's own voice state is addressed as `@me`, the only one allowed to request to speak.
  private resolveTarget(): string {
    const client = this.client;
    return (client.user?.id ?? client.id) === this.userId ? "@me" : this.userId;
  }
}

Mixin(VoiceState, [StructureMixin]);

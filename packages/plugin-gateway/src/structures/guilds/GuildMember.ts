import { cachedGuild, cachedPresence, cachedVoiceState, expectSync } from "../../util/cache.js";
import { DiscordAPIError, type ImageURLOptions } from "@discordjs/rest";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { APICollectibles } from "discord-api-types/v10";
import type { BanOptions, GuildMemberEditOptions } from "../../managers/GuildMemberManager.js";
import { GuildMemberRoleManager } from "../../managers/GuildMemberRoleManager.js";
import { cdn } from "../../util/cdn.js";
import {
  transformAPIAvatarDecorationData,
  transformCollectibles,
  type AvatarDecorationData,
  type Collectibles,
} from "../../util/Transformers.js";
import { GuildMemberFlagsBitField, type GuildMemberFlagsResolvable } from "../../util/flags.js";
import {
  MessagePayload,
  type MessageCreateOptions,
  type MessagePayloadResolvable,
} from "../messages/MessagePayload.js";
import {
  computeGuildPermissions,
  computePermissionsIn,
  computePermissionsInSync,
  requireGuild,
  requireMe,
} from "../../util/permissions.js";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { PermissionsBitField } from "../../util/PermissionsBitField.js";
import type { DMChannel } from "../channels/DMChannel.js";
import type { Message } from "../messages/Message.js";
import type { Presence } from "../presences/Presence.js";
import type { VoiceState } from "../voice/VoiceState.js";
import type { Guild } from "./Guild.js";
import type { Role } from "./Role.js";
import { kData, kPatch, kRelations, Structure } from "../Structure.js";
import { User } from "../users/User.js";
import { GatewayError } from "../../errors/GatewayError.js";

/**
 * The relations of a {@link GuildMember}, resolved from the cache by `client.members`.
 */
export interface GuildMemberRelations {
  user?: User;
  guild?: Guild | null;
  /**
   * The member's voice state, `null` when they are not connected.
   */
  voice?: VoiceState | null;
  presence?: Presence | null;
}

/**
 * A member of a Discord guild.
 *
 * @remarks
 * discord.js's `permissions`, `manageable`, `kickable`, ... are read from the cache like there, which needs a
 * synchronous one: with an asynchronous cache they throw, and their `fetch*` twins are the ones to use.
 * `member.roles` reads roles through the (possibly asynchronous) cache, so its getters are `Awaitable`.
 */
export class GuildMember extends Structure<CacheEntityTypes["members"]> {
  declare public [kRelations]: GuildMemberRelations;

  protected override optimizeData(data: Partial<CacheEntityTypes["members"]>): void {
    this.optimizeTimestamp("joined_at", data.joined_at);
    this.optimizeTimestamp("premium_since", data.premium_since);
    this.optimizeTimestamp("communication_disabled_until", data.communication_disabled_until);
  }

  /**
   * @param data The raw member.
   * @param relations The member's user and guild as resolved from the cache, by `client.members`.
   */
  public constructor(data: CacheEntityTypes["members"], relations: GuildMemberRelations = {}) {
    super(data, relations);
  }

  /**
   * The ID of the member's user, or `null` if the payload did not include it.
   */
  public get id(): string | null {
    return this[kData].user?.id ?? null;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  /**
   * The guild, from the cache. `null` when the guild is not cached, or when the cache is asynchronous: use
   * `fetchGuild()` to always get it.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  /**
   * Fetches the guild, cache first.
   */
  public fetchGuild(): Promise<Guild> {
    return this.client.guilds.fetch(this.guildId);
  }

  public override [kPatch](data: Readonly<Partial<CacheEntityTypes["members"]>>): this {
    // A payload carrying the user is fresher than the one resolved when the member was built.
    if (data.user) this.dropRelations("user");
    return super[kPatch](data);
  }

  /**
   * The member's user, or `null` if the payload did not include it. Resolved from `client.users` when the member
   * comes from a manager.
   */
  public get user(): User | null {
    const { user } = this[kData];
    return this[kRelations].user ?? (user ? new User(user) : null);
  }

  public get nickname(): string | null {
    return this[kData].nick ?? null;
  }

  /**
   * The name to show for this member: their nickname, falling back to their user's display name.
   */
  public get displayName(): string | null {
    return this.nickname ?? this.user?.displayName ?? null;
  }

  /**
   * The IDs of the member's roles, excluding the implicit `@everyone` role.
   */
  public get roleIds(): readonly string[] {
    return this[kData].roles;
  }

  /**
   * The member's roles. Changing them needs the member's user ID, which every payload but some partial ones carries.
   */
  public get roles(): GuildMemberRoleManager {
    return new GuildMemberRoleManager(this);
  }

  public get joinedTimestamp(): number | null {
    return this.optimizedTimestamp("joined_at");
  }

  public get joinedAt(): Date | null {
    const { joinedTimestamp } = this;
    return joinedTimestamp === null ? null : new Date(joinedTimestamp);
  }

  /**
   * When the member started boosting the guild, `null` if they are not boosting it.
   */
  public get premiumSinceTimestamp(): number | null {
    return this.optimizedTimestamp("premium_since");
  }

  public get premiumSince(): Date | null {
    const { premiumSinceTimestamp } = this;
    return premiumSinceTimestamp === null ? null : new Date(premiumSinceTimestamp);
  }

  public get communicationDisabledUntilTimestamp(): number | null {
    return this.optimizedTimestamp("communication_disabled_until");
  }

  public get communicationDisabledUntil(): Date | null {
    const { communicationDisabledUntilTimestamp } = this;
    return communicationDisabledUntilTimestamp === null
      ? null
      : new Date(communicationDisabledUntilTimestamp);
  }

  public get pending(): boolean {
    return this[kData].pending ?? false;
  }

  /**
   * Whether the member is deafened in voice channels, by a moderator.
   */
  public get deaf(): boolean {
    return this[kData].deaf ?? false;
  }

  /**
   * Whether the member is muted in voice channels, by a moderator.
   */
  public get mute(): boolean {
    return this[kData].mute ?? false;
  }

  public get flags(): Readonly<GuildMemberFlagsBitField> {
    return new GuildMemberFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  /**
   * The member's guild avatar hash, if any.
   */
  public get avatar(): string | null {
    return this[kData].avatar ?? null;
  }

  /**
   * The member's guild banner hash, if any.
   */
  public get banner(): string | null {
    return this[kData].banner ?? null;
  }

  /**
   * The member's guild avatar decoration, if any.
   */
  public get avatarDecorationData(): AvatarDecorationData | null {
    const data = this[kData].avatar_decoration_data;
    return data ? transformAPIAvatarDecorationData(data) : null;
  }

  /**
   * The member's guild collectibles, camel-cased like discord.js's `GuildMember#collectibles`.
   */
  public get collectibles(): Collectibles | null {
    const collectibles = (this[kData] as { collectibles?: APICollectibles | null }).collectibles;
    return collectibles ? transformCollectibles(collectibles) : null;
  }

  /**
   * Whether the member is timed out right now.
   */
  public isCommunicationDisabled(): boolean {
    const until = this.communicationDisabledUntilTimestamp;
    return until !== null && until > Date.now();
  }

  /**
   * Gets the URL of the member's guild avatar, or `null` if they have none.
   * @param options The image options.
   */
  public avatarURL(options?: ImageURLOptions): string | null {
    const { avatar, id } = this;
    return avatar && id ? cdn.guildMemberAvatar(this.guildId, id, avatar, options) : null;
  }

  /**
   * Gets the URL of the member's guild avatar, falling back to their user's avatar.
   * @param options The image options.
   */
  public displayAvatarURL(options?: ImageURLOptions): string | null {
    return this.avatarURL(options) ?? this.user?.displayAvatarURL(options) ?? null;
  }

  /**
   * Gets the URL of the member's guild banner, or `null` if they have none.
   * @param options The image options.
   */
  public bannerURL(options?: ImageURLOptions): string | null {
    const { banner, id } = this;
    return banner && id ? cdn.guildMemberBanner(this.guildId, id, banner, options) : null;
  }

  /**
   * Gets the URL of the member's guild banner, falling back to their user's banner when known.
   * @param options The image options.
   */
  public displayBannerURL(options?: ImageURLOptions): string | null {
    return this.bannerURL(options) ?? this.user?.bannerURL(options) ?? null;
  }

  /**
   * Gets the URL of the member's guild avatar decoration, or `null` if they have none.
   */
  public avatarDecorationURL(): string | null {
    const asset = this.avatarDecorationData?.asset;
    return asset ? cdn.avatarDecoration(asset) : null;
  }

  /**
   * Gets the URL of the member's guild avatar decoration, falling back to their user's.
   */
  public displayAvatarDecorationURL(): string | null {
    return this.avatarDecorationURL() ?? this.user?.avatarDecorationURL() ?? null;
  }

  /**
   * The member's guild-wide permissions, before channel overwrites, like discord.js's `GuildMember#permissions`:
   * computed from the cached guild and roles, skipping the roles that are not cached.
   *
   * @throws A `GatewayError`: `CacheAsynchronous` with an asynchronous cache (use
   * {@link GuildMember.fetchPermissions}), `GuildUncached` when the guild is not cached.
   */
  public get permissions(): Readonly<PermissionsBitField> {
    const guild = requireGuild(this.client, this.guildId);
    const roles = expectSync(this.roles.cache, "roles");
    return computeGuildPermissions({
      guildId: this.guildId,
      ownerId: guild.ownerId,
      userId: this.requireId(),
      memberRoleIds: this.roleIds,
      roles: roles.map((role) => role.toJSON()),
    });
  }

  /**
   * Fetches the member's guild-wide permissions, before channel overwrites: {@link GuildMember.permissions} with the
   * guild and the roles fetched from the API when they are not cached, whatever the cache.
   */
  public async fetchPermissions(): Promise<Readonly<PermissionsBitField>> {
    const client = this.client;
    const guild = await client.guilds.fetch(this.guildId);
    const roles = await this.roles.fetch();
    return computeGuildPermissions({
      guildId: this.guildId,
      ownerId: guild.ownerId,
      userId: this.requireId(),
      memberRoleIds: this.roleIds,
      roles: roles.map((role) => role.toJSON()),
    });
  }

  /**
   * Fetches the member's permissions in a channel: their guild permissions with the channel's overwrites applied.
   * discord.js: `member.permissionsIn(channel)`.
   *
   * @param channel The channel, or its ID. Threads use their parent's overwrites.
   */
  public fetchPermissionsIn(channel: AnyChannel | string): Promise<Readonly<PermissionsBitField>> {
    return computePermissionsIn(channel, this);
  }

  /**
   * The member's permissions in a channel, like discord.js's `GuildMember#permissionsIn`: their guild permissions
   * with the channel's overwrites applied, read from the cache.
   *
   * @param channel The channel, or the ID of a cached one. Threads use their parent's overwrites.
   * @throws A `GatewayError`: `CacheAsynchronous` with an asynchronous cache (use
   * {@link GuildMember.fetchPermissionsIn}), `ChannelUncached` or `GuildUncached` when they are not cached.
   */
  public permissionsIn(channel: AnyChannel | string): Readonly<PermissionsBitField> {
    return computePermissionsInSync(channel, this);
  }

  /**
   * The member's voice state, from the cache, like discord.js's `GuildMember#voice`: `null` when they are not
   * connected, when the voice state is not cached (it needs the `GuildVoiceStates` intent), or when the cache is
   * asynchronous. Use {@link GuildMember.fetchVoiceState} to ask the API.
   */
  public get voice(): VoiceState | null {
    return this.lazyRelation("voice", (client) => cachedVoiceState(client, this.guildId, this.id));
  }

  /**
   * The member's presence, from the cache, like discord.js's `GuildMember#presence`: `null` when it is not cached
   * (it needs the `GuildPresences` intent), or when the cache is asynchronous.
   */
  public get presence(): Presence | null {
    return this.lazyRelation("presence", (client) => cachedPresence(client, this.guildId, this.id));
  }

  /**
   * Fetches the member's voice state, cache first. discord.js: `member.voice`.
   *
   * @returns The voice state, or `null` when the member is not connected to voice.
   */
  public async fetchVoiceState(): Promise<VoiceState | null> {
    try {
      return await this.client.voiceStates.fetch(this.guildId, this.requireId());
    } catch (error) {
      // Discord answers 404 (Unknown Voice State) for members who are not connected.
      if (error instanceof DiscordAPIError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * Gets the member's presence from the cache. discord.js: `member.presence`.
   *
   * @returns The presence, or `null` when it is not cached (the bot needs the `GuildPresences` intent).
   */
  public async fetchPresence(): Promise<Presence | null> {
    return (
      (await this.client.presences.cache.get(
        this.client.presences.resolveKey(this.guildId, this.requireId()),
      )) ?? null
    );
  }

  /**
   * The color the member's name is displayed in, like discord.js's `GuildMember#displayColor`: the one of their
   * highest cached role that has a color, `0` when none has.
   *
   * @throws A `GatewayError` (`CacheAsynchronous`) with an asynchronous cache: use
   * {@link GuildMember.fetchDisplayColor}.
   */
  public get displayColor(): number {
    return expectSync(this.roles.color, "roles")?.colors.primaryColor ?? 0;
  }

  /**
   * The color the member's name is displayed in, as a `#rrggbb` string, like discord.js's
   * `GuildMember#displayHexColor`. It throws like {@link GuildMember.displayColor}.
   */
  public get displayHexColor(): `#${string}` {
    return `#${this.displayColor.toString(16).padStart(6, "0")}`;
  }

  /**
   * Fetches the color the member's name is displayed in, `0` when none of their roles has one.
   */
  public async fetchDisplayColor(): Promise<number> {
    return (await this.roles.fetchColor())?.colors.primaryColor ?? 0;
  }

  /**
   * Fetches the color the member's name is displayed in, as a `#rrggbb` string.
   */
  public async fetchDisplayHexColor(): Promise<`#${string}`> {
    return `#${(await this.fetchDisplayColor()).toString(16).padStart(6, "0")}`;
  }

  /**
   * Whether the bot ranks above the member, like discord.js's `GuildMember#manageable`: it is not the guild owner, not
   * the bot itself, and the bot's highest role is higher than theirs (or the bot owns the guild).
   *
   * @throws A `GatewayError`: `CacheAsynchronous` with an asynchronous cache (use
   * {@link GuildMember.fetchManageable}), `GuildUncached` or `GuildUncachedMe` when the guild or the bot's member is
   * not cached.
   */
  public get manageable(): boolean {
    const client = this.client;
    const guild = requireGuild(client, this.guildId);
    const settled = this.settledByOwnership(guild.ownerId);
    if (settled !== null) return settled;

    const me = requireMe(client, this.guildId);
    return outranks(expectSync(me.roles.highest, "roles"), expectSync(this.roles.highest, "roles"));
  }

  /**
   * Fetches whether the bot ranks above the member: {@link GuildMember.manageable} with the guild, the bot's member,
   * and the roles fetched from the API when they are not cached, whatever the cache.
   */
  public async fetchManageable(): Promise<boolean> {
    const client = this.client;
    const guild = await client.guilds.fetch(this.guildId);
    const settled = this.settledByOwnership(guild.ownerId);
    if (settled !== null) return settled;

    const me = await client.members.fetchMe(this.guildId);
    const [mine, theirs] = await Promise.all([me.roles.fetchHighest(), this.roles.fetchHighest()]);
    return outranks(mine, theirs);
  }

  /**
   * Whether the bot can kick the member, like discord.js's `GuildMember#kickable`: it outranks them and has
   * `KickMembers`. It throws like {@link GuildMember.manageable}.
   */
  public get kickable(): boolean {
    return this.managedWithSync("KickMembers");
  }

  /**
   * Whether the bot can ban the member, like discord.js's `GuildMember#bannable`: it outranks them and has
   * `BanMembers`. It throws like {@link GuildMember.manageable}.
   */
  public get bannable(): boolean {
    return this.managedWithSync("BanMembers");
  }

  /**
   * Whether the bot can time the member out, like discord.js's `GuildMember#moderatable`: it outranks them, has
   * `ModerateMembers`, and they are no administrator. It throws like {@link GuildMember.manageable}.
   */
  public get moderatable(): boolean {
    return this.managedWithSync("ModerateMembers") && !this.permissions.has("Administrator");
  }

  /**
   * Whether the bot can kick the member: it outranks them and has `KickMembers`.
   */
  public fetchKickable(): Promise<boolean> {
    return this.managedWith("KickMembers");
  }

  /**
   * Whether the bot can ban the member: it outranks them and has `BanMembers`.
   */
  public fetchBannable(): Promise<boolean> {
    return this.managedWith("BanMembers");
  }

  /**
   * Whether the bot can time the member out: it outranks them, has `ModerateMembers`, and they are no administrator.
   */
  public async fetchModeratable(): Promise<boolean> {
    if (!(await this.managedWith("ModerateMembers"))) return false;
    return !(await this.fetchPermissions()).has("Administrator");
  }

  /**
   * Edits the member.
   *
   * @param options The fields to edit.
   * @returns This member, patched.
   */
  public async edit(options: GuildMemberEditOptions): Promise<this> {
    const member = await this.client.members.edit(this.guildId, this.requireId(), options);
    return this[kPatch](member.toJSON());
  }

  public setNickname(nick: string | null, reason?: string): Promise<this> {
    return this.edit({ nick, reason });
  }

  public setFlags(flags: GuildMemberFlagsResolvable, reason?: string): Promise<this> {
    return this.edit({ flags, reason });
  }

  /**
   * Times the member out until a given time, or lifts the timeout with `null`.
   */
  public disableCommunicationUntil(
    communicationDisabledUntil: Date | number | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ communicationDisabledUntil, reason });
  }

  /**
   * Times the member out for a duration in milliseconds, or lifts the timeout with `null`.
   */
  public timeout(duration: number | null, reason?: string): Promise<this> {
    return this.disableCommunicationUntil(duration === null ? null : Date.now() + duration, reason);
  }

  public async kick(reason?: string): Promise<this> {
    await this.client.members.kick(this.guildId, this.requireId(), reason);
    return this;
  }

  public async ban(options?: BanOptions): Promise<this> {
    await this.client.members.ban(this.guildId, this.requireId(), options);
    return this;
  }

  /**
   * Opens a direct message channel with the member, reusing the cached one.
   *
   * @param force Whether to skip the cache lookup and always call the API.
   */
  public createDM(force = false): Promise<DMChannel> {
    return this.client.users.createDM(this.requireId(), { force });
  }

  public deleteDM(): Promise<DMChannel> {
    return this.client.users.deleteDM(this.requireId());
  }

  public send(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    return this.client.users.send(this.requireId(), MessagePayload.create(this, options));
  }

  /**
   * Whether the member is partial: built from its IDs alone for an event about an uncached member, see
   * `Partials.GuildMember`. Only its IDs (and the user a removal carries) are reliable then, and
   * {@link GuildMember.fetch} completes it.
   */
  public get partial(): boolean {
    return this[kData].joined_at === undefined;
  }

  /**
   * Fetches the member from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const member = await this.client.members.fetch(this.guildId, this.requireId(), {
      force: true,
    });
    return this[kPatch](member.toJSON());
  }

  /**
   * Fetches the member's user, cache first.
   */
  public fetchUser(): Promise<User> {
    return this.client.users.fetch(this.requireId());
  }

  /**
   * Whether this member has the same data as another one.
   * @param member The member to compare with.
   */
  public equals(member: GuildMember): boolean {
    return (
      this.id === member.id &&
      this.guildId === member.guildId &&
      this.nickname === member.nickname &&
      this.avatar === member.avatar &&
      this.joinedTimestamp === member.joinedTimestamp &&
      this.premiumSinceTimestamp === member.premiumSinceTimestamp &&
      this.communicationDisabledUntilTimestamp === member.communicationDisabledUntilTimestamp &&
      this.flags.bitField === member.flags.bitField &&
      this.roleIds.length === member.roleIds.length &&
      this.roleIds.every((id) => member.roleIds.includes(id))
    );
  }

  public toString(): string {
    return this.id ? `<@${this.id}>` : "";
  }

  // What the ownership of the guild settles about the bot outranking this member, `null` when the roles decide.
  private settledByOwnership(ownerId: string): boolean | null {
    const client = this.client;
    const id = this.requireId();
    const meId = client.user?.id ?? client.id;
    if (id === ownerId || id === meId) return false;
    return meId === ownerId ? true : null;
  }

  private managedWithSync(permission: "KickMembers" | "BanMembers" | "ModerateMembers") {
    if (!this.manageable) return false;
    return requireMe(this.client, this.guildId).permissions.has(permission);
  }

  private async managedWith(permission: "KickMembers" | "BanMembers" | "ModerateMembers") {
    if (!(await this.fetchManageable())) return false;
    const me = await this.client.members.fetchMe(this.guildId);
    return (await me.fetchPermissions()).has(permission);
  }

  private requireId(): string {
    const { id } = this;
    if (id === null) throw new GatewayError("GuildMemberUserUnknown");
    return id;
  }
}

// Whether the bot's highest role is above the member's.
function outranks(mine: Role | null, theirs: Role | null): boolean {
  return mine !== null && theirs !== null && mine.comparePositionTo(theirs) > 0;
}

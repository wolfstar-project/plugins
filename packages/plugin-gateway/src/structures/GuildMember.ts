import type { ImageURLOptions } from "@discordjs/rest";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { APIAvatarDecorationData } from "discord-api-types/v10";
import type { BanOptions, GuildMemberEditOptions } from "../managers/GuildMemberManager.js";
import { GuildMemberRoleManager } from "../managers/GuildMemberRoleManager.js";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import { GuildMemberFlagsBitField, type GuildMemberFlagsResolvable } from "../util/flags.js";
import type { MessageCreateOptions, MessagePayloadResolvable } from "../util/messages.js";
import { computeGuildPermissions } from "../util/permissions.js";
import type { PermissionsBitField } from "../util/PermissionsBitField.js";
import type { DMChannel } from "./DMChannel.js";
import type { Message } from "./Message.js";
import { kData, kPatch, Structure } from "./Structure.js";
import { User } from "./User.js";

function timestamp(value: string | null | undefined): number | null {
  return value ? Date.parse(value) : null;
}

/**
 * A member of a Discord guild.
 *
 * @remarks
 * Relations are asynchronous, unlike discord.js: `member.roles` reads roles through the (possibly asynchronous)
 * cache, and discord.js's `permissions`, `manageable`, `kickable`, ... are the `fetch*` methods below.
 */
export class GuildMember extends Structure<CacheEntityTypes["members"]> {
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
   * The member's user, or `null` if the payload did not include it.
   */
  public get user(): User | null {
    const { user } = this[kData];
    return user ? new User(user) : null;
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
   * The member's roles. It needs the member's user ID, which every payload but some partial ones carries.
   */
  public get roles(): GuildMemberRoleManager {
    return new GuildMemberRoleManager(
      getGatewayClient(),
      this.guildId,
      this.requireId(),
      this.roleIds,
    );
  }

  public get joinedTimestamp(): number | null {
    return timestamp(this[kData].joined_at);
  }

  public get joinedAt(): Date | null {
    const { joinedTimestamp } = this;
    return joinedTimestamp === null ? null : new Date(joinedTimestamp);
  }

  /**
   * When the member started boosting the guild, `null` if they are not boosting it.
   */
  public get premiumSinceTimestamp(): number | null {
    return timestamp(this[kData].premium_since);
  }

  public get premiumSince(): Date | null {
    const { premiumSinceTimestamp } = this;
    return premiumSinceTimestamp === null ? null : new Date(premiumSinceTimestamp);
  }

  public get communicationDisabledUntilTimestamp(): number | null {
    return timestamp(this[kData].communication_disabled_until);
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
  public get avatarDecorationData(): APIAvatarDecorationData | null {
    return this[kData].avatar_decoration_data ?? null;
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
   * Computes the member's guild-wide permissions, before channel overwrites.
   */
  public async fetchPermissions(): Promise<Readonly<PermissionsBitField>> {
    const client = getGatewayClient();
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
   * Fetches the color the member's name is displayed in, `0` when none of their roles has one.
   */
  public async fetchDisplayColor(): Promise<number> {
    return (await this.roles.fetchColor())?.color ?? 0;
  }

  /**
   * Fetches the color the member's name is displayed in, as a `#rrggbb` string.
   */
  public async fetchDisplayHexColor(): Promise<`#${string}`> {
    return `#${(await this.fetchDisplayColor()).toString(16).padStart(6, "0")}`;
  }

  /**
   * Whether the bot ranks above the member: it is not the guild owner, not the bot itself, and the bot's highest
   * role is higher than theirs (or the bot owns the guild).
   */
  public async fetchManageable(): Promise<boolean> {
    const client = getGatewayClient();
    const id = this.requireId();
    const guild = await client.guilds.fetch(this.guildId);
    const meId = client.user?.id ?? client.id;
    if (id === guild.ownerId || id === meId) return false;
    if (meId === guild.ownerId) return true;

    const me = await client.members.fetchMe(this.guildId);
    const [mine, theirs] = await Promise.all([me.roles.fetchHighest(), this.roles.fetchHighest()]);
    return mine !== null && theirs !== null && mine.comparePositionTo(theirs) > 0;
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
    const member = await getGatewayClient().members.edit(this.guildId, this.requireId(), options);
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
    await getGatewayClient().members.kick(this.guildId, this.requireId(), reason);
    return this;
  }

  public async ban(options?: BanOptions): Promise<this> {
    await getGatewayClient().members.ban(this.guildId, this.requireId(), options);
    return this;
  }

  public createDM(): Promise<DMChannel> {
    return getGatewayClient().users.createDM(this.requireId());
  }

  public deleteDM(): Promise<DMChannel> {
    return getGatewayClient().users.deleteDM(this.requireId());
  }

  public send(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    return getGatewayClient().users.send(this.requireId(), options);
  }

  /**
   * Fetches the member from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const member = await getGatewayClient().members.fetch(this.guildId, this.requireId(), {
      force: true,
    });
    return this[kPatch](member.toJSON());
  }

  /**
   * Fetches the member's user, cache first.
   */
  public fetchUser(): Promise<User> {
    return getGatewayClient().users.fetch(this.requireId());
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

  private async managedWith(permission: "KickMembers" | "BanMembers" | "ModerateMembers") {
    if (!(await this.fetchManageable())) return false;
    const me = await getGatewayClient().members.fetchMe(this.guildId);
    return (await me.fetchPermissions()).has(permission);
  }

  private requireId(): string {
    const { id } = this;
    if (id === null) throw new Error("This member has no user data: its ID is unknown");
    return id;
  }
}

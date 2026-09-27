import { Invite, Structure as BaseStructure, type APIActualInvite } from "@discordjs/structures";
import {
  InviteType,
  type APIApplication,
  type APIExtendedInvite,
  type APIInviteChannel,
  type GatewayInviteCreateDispatchData,
} from "discord-api-types/v10";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { Guild } from "../guilds/Guild.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, kPatch, kRelations, StructureMixin } from "../Structure.js";
import { User } from "../users/User.js";

/**
 * The raw data of an invite, from the REST API (`APIExtendedInvite`, with a nested `channel` and `guild`) or from an
 * `INVITE_CREATE` dispatch (with `channel_id` and `guild_id`).
 */
export type InviteData = { code: string } & Partial<Omit<APIExtendedInvite, "code" | "uses">> &
  Partial<Omit<GatewayInviteCreateDispatchData, "code" | "uses">> & { uses?: number };

/**
 * The relations of an invite, resolved from the cache by `client.guilds.invites()`.
 */
export interface InviteRelations {
  inviter?: User;
  targetUser?: User;
  guild?: Guild | null;
  channel?: AnyChannel | null;
}

export interface BaseInvite<Data extends InviteData = InviteData> extends StructureMixin<
  Data,
  InviteRelations
> {}

/**
 * The base of every invite, to a guild, to a group direct message, or a friend invite: `@discordjs/structures`'
 * `Invite`, with its channel, inviter, target user, and discord.js' helpers.
 *
 * @typeParam Data The raw invite data this structure wraps.
 */
export class BaseInvite<Data extends InviteData = InviteData> extends Invite<""> {
  /**
   * Keeps the raw `created_at` and `expires_at`, which `@discordjs/structures` strips and re-serializes in its own
   * format, so that {@link BaseInvite.toJSON} returns the invite as received.
   */
  public static override readonly DataTemplate: Partial<APIActualInvite> = {};

  protected override optimizeData(data: Partial<Data>): void {
    super.optimizeData(data as Partial<APIActualInvite>);
    this.optimizeTimestamp("created_at", data.created_at);
    this.optimizeTimestamp("expires_at", data.expires_at);
  }

  /**
   * @param data The raw invite.
   * @param relations The inviter, target user, and guild as resolved from the cache, by `client.guilds.invites()`.
   */
  public constructor(data: Data, relations: InviteRelations = {}) {
    // An `INVITE_CREATE` dispatch has neither the `type` nor the `channel` `@discordjs/structures` expects.
    super(data as unknown as APIActualInvite);
    initStructure(this, data, relations);
  }

  public [kPatch](data: Readonly<Partial<Data>>): this {
    if (data.inviter) this.dropRelations("inviter");
    if (data.target_user) this.dropRelations("targetUser");
    return StructureMixin.prototype[kPatch].call(this, data) as this;
  }

  /**
   * The URL of the invite.
   */
  public override get url(): string {
    return `https://discord.gg/${this.code}`;
  }

  public override get type(): InviteType {
    return this[kData].type ?? (this[kData].guild_id ? InviteType.Guild : InviteType.Friend);
  }

  public get channelId(): string | null {
    return this[kData].channel?.id ?? this[kData].channel_id ?? null;
  }

  /**
   * The channel the invite leads to, like discord.js's `BaseInvite#channel`: the cached channel, else the partial
   * channel the API returns with the invite, if any.
   */
  public get channel(): AnyChannel | APIInviteChannel | null {
    return this[kRelations].channel ?? this[kData].channel ?? null;
  }

  /**
   * The user who created the invite, if known.
   */
  public get inviter(): User | null {
    const { inviter } = this[kData];
    return this[kRelations].inviter ?? (inviter ? new User(inviter) : null);
  }

  public get inviterId(): string | null {
    return this[kData].inviter?.id ?? null;
  }

  public get targetUser(): User | null {
    const { target_user: targetUser } = this[kData];
    return this[kRelations].targetUser ?? (targetUser ? new User(targetUser) : null);
  }

  public get targetApplication(): Partial<APIApplication> | null {
    return this[kData].target_application ?? null;
  }

  public override get createdTimestamp(): number | null {
    return this.optimizedTimestamp("created_at");
  }

  public get createdAt(): Date | null {
    const { createdTimestamp } = this;
    return createdTimestamp === null ? null : new Date(createdTimestamp);
  }

  /**
   * When the invite expires, `null` when it never does or it is unknown.
   */
  public override get expiresTimestamp(): number | null {
    const expiresAt = this.optimizedTimestamp("expires_at");
    if (expiresAt !== null) return expiresAt;

    const { createdTimestamp, maxAge } = this;
    return createdTimestamp !== null && maxAge ? createdTimestamp + maxAge * 1000 : null;
  }

  public get expiresAt(): Date | null {
    const { expiresTimestamp } = this;
    return expiresTimestamp === null ? null : new Date(expiresTimestamp);
  }

  /**
   * Transforms this invite into its raw data, as received.
   *
   * @remarks
   * Typed as `@discordjs/structures`' `APIActualInvite`, but an invite built from an `INVITE_CREATE` dispatch has the
   * dispatch's fields instead.
   */
  public override toJSON(): APIActualInvite {
    return BaseStructure.prototype.toJSON.call(this) as APIActualInvite;
  }

  public override valueOf(): string {
    return this.code;
  }
}

Mixin(BaseInvite, [StructureMixin]);

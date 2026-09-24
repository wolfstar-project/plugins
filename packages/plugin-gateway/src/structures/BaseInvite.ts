import {
  InviteType,
  type APIApplication,
  type APIExtendedInvite,
  type APIInviteChannel,
  type GatewayInviteCreateDispatchData,
  type InviteTargetType,
} from "discord-api-types/v10";
import type { Guild } from "./Guild.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";
import { User } from "./User.js";

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
}

/**
 * The base of every invite: to a guild, to a group direct message, or a friend invite.
 *
 * @typeParam Data The raw invite data this structure wraps.
 */
export class BaseInvite<Data extends InviteData = InviteData> extends Structure<Data> {
  declare protected [kRelations]: InviteRelations;

  /**
   * @param data The raw invite.
   * @param relations The inviter, target user, and guild as resolved from the cache, by `client.guilds.invites()`.
   */
  public constructor(data: Data, relations: InviteRelations = {}) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<Data>>): this {
    if (data.inviter) this.dropRelations("inviter");
    if (data.target_user) this.dropRelations("targetUser");
    return super[kPatch](data);
  }

  public get code() {
    return this[kData].code;
  }

  /**
   * The URL of the invite.
   */
  public get url(): string {
    return `https://discord.gg/${this.code}`;
  }

  public get type(): InviteType {
    return this[kData].type ?? (this[kData].guild_id ? InviteType.Guild : InviteType.Friend);
  }

  public get channelId(): string | null {
    return this[kData].channel?.id ?? this[kData].channel_id ?? null;
  }

  /**
   * The channel the invite leads to, as the partial channel the API returns, if known.
   */
  public get channel(): APIInviteChannel | null {
    return this[kData].channel ?? null;
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

  /**
   * What the invite targets in a voice channel: a stream, or an embedded application.
   */
  public get targetType(): InviteTargetType | null {
    return this[kData].target_type ?? null;
  }

  public get targetUser(): User | null {
    const { target_user: targetUser } = this[kData];
    return this[kRelations].targetUser ?? (targetUser ? new User(targetUser) : null);
  }

  public get targetApplication(): Partial<APIApplication> | null {
    return this[kData].target_application ?? null;
  }

  public get approximateMemberCount(): number | null {
    return this[kData].approximate_member_count ?? null;
  }

  public get approximatePresenceCount(): number | null {
    return this[kData].approximate_presence_count ?? null;
  }

  /**
   * How many times the invite was used, `null` when the payload omits it.
   */
  public get uses(): number | null {
    return this[kData].uses ?? null;
  }

  /**
   * How many times the invite can be used, `0` for unlimited, `null` when the payload omits it.
   */
  public get maxUses(): number | null {
    return this[kData].max_uses ?? null;
  }

  /**
   * How long the invite lasts, in seconds, `0` for forever, `null` when the payload omits it.
   */
  public get maxAge(): number | null {
    return this[kData].max_age ?? null;
  }

  /**
   * Whether the invite only grants temporary membership, `null` when the payload omits it.
   */
  public get temporary(): boolean | null {
    return this[kData].temporary ?? null;
  }

  public get createdTimestamp(): number | null {
    const { created_at: createdAt } = this[kData];
    return createdAt ? Date.parse(createdAt) : null;
  }

  public get createdAt(): Date | null {
    const { createdTimestamp } = this;
    return createdTimestamp === null ? null : new Date(createdTimestamp);
  }

  /**
   * When the invite expires, `null` when it never does or it is unknown.
   */
  public get expiresTimestamp(): number | null {
    const { expires_at: expiresAt } = this[kData];
    if (expiresAt) return Date.parse(expiresAt);

    const { createdTimestamp, maxAge } = this;
    return createdTimestamp !== null && maxAge ? createdTimestamp + maxAge * 1000 : null;
  }

  public get expiresAt(): Date | null {
    const { expiresTimestamp } = this;
    return expiresTimestamp === null ? null : new Date(expiresTimestamp);
  }

  public toString(): string {
    return this.url;
  }

  public valueOf(): string {
    return this.code;
  }
}

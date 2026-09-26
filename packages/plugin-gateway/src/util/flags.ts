import {
  ActivityFlags,
  AttachmentFlags,
  ChannelFlags,
  GatewayIntentBits,
  GuildMemberFlags,
  GuildSystemChannelFlags,
  MessageFlags,
  RoleFlags,
  UserFlags,
} from "discord-api-types/v10";
import { BitField, type BitFieldResolvable } from "./BitField.js";

// `BitField.resolve` returns a flag's enum value as is, which is a `number` for the 32-bit flag enums: combining it
// with the `bigint` bits then throws "Cannot mix BigInt and other types". Every flags bitfield below overrides `resolve`
// to always return a `bigint`.

/**
 * A 32-bit flags bitfield, resolving flag names to `bigint`s and serializing to a `number`.
 */
export abstract class NumberFlagsBitField<Flags extends string> extends BitField<Flags> {
  public static override resolve<Flags extends string = string>(
    bit: BitFieldResolvable<Flags>,
  ): bigint {
    return BigInt(super.resolve(bit));
  }

  public override toJSON(): number {
    return super.toJSON(true) as number;
  }
}

export type ActivityFlagsString = keyof typeof ActivityFlags;
export type ActivityFlagsResolvable = BitFieldResolvable<ActivityFlagsString>;

/**
 * The flags of a presence activity.
 */
export class ActivityFlagsBitField extends NumberFlagsBitField<ActivityFlagsString> {
  public static override readonly Flags = ActivityFlags;
}

export type AttachmentFlagsString = keyof typeof AttachmentFlags;
export type AttachmentFlagsResolvable = BitFieldResolvable<AttachmentFlagsString>;

/**
 * The flags of a message attachment.
 */
export class AttachmentFlagsBitField extends NumberFlagsBitField<AttachmentFlagsString> {
  public static override readonly Flags = AttachmentFlags;
}

export type ChannelFlagsString = keyof typeof ChannelFlags;
export type ChannelFlagsResolvable = BitFieldResolvable<ChannelFlagsString>;

/**
 * The flags of a channel.
 */
export class ChannelFlagsBitField extends NumberFlagsBitField<ChannelFlagsString> {
  public static override readonly Flags = ChannelFlags;
}

export type MessageFlagsString = keyof typeof MessageFlags;
export type MessageFlagsResolvable = BitFieldResolvable<MessageFlagsString>;

/**
 * The flags of a message.
 */
export class MessageFlagsBitField extends NumberFlagsBitField<MessageFlagsString> {
  public static override readonly Flags = MessageFlags;
}

export type GuildMemberFlagsString = keyof typeof GuildMemberFlags;
export type GuildMemberFlagsResolvable = BitFieldResolvable<GuildMemberFlagsString>;

/**
 * The flags of a guild member.
 */
export class GuildMemberFlagsBitField extends NumberFlagsBitField<GuildMemberFlagsString> {
  public static override readonly Flags = GuildMemberFlags;
}

export type IntentsString = keyof typeof GatewayIntentBits;
export type IntentsResolvable = BitFieldResolvable<IntentsString>;

/**
 * The gateway intents to identify with.
 */
export class IntentsBitField extends NumberFlagsBitField<IntentsString> {
  public static override readonly Flags = GatewayIntentBits;
}

export type RoleFlagsString = keyof typeof RoleFlags;
export type RoleFlagsResolvable = BitFieldResolvable<RoleFlagsString>;

/**
 * The flags of a role.
 */
export class RoleFlagsBitField extends NumberFlagsBitField<RoleFlagsString> {
  public static override readonly Flags = RoleFlags;
}

export type SystemChannelFlagsString = keyof typeof GuildSystemChannelFlags;
export type SystemChannelFlagsResolvable = BitFieldResolvable<SystemChannelFlagsString>;

/**
 * The flags of a guild's system channel, deciding which system messages are suppressed.
 */
export class SystemChannelFlagsBitField extends NumberFlagsBitField<SystemChannelFlagsString> {
  public static override readonly Flags = GuildSystemChannelFlags;
}

export type UserFlagsString = keyof typeof UserFlags;
export type UserFlagsResolvable = BitFieldResolvable<UserFlagsString>;

/**
 * The flags (badges) of a user.
 */
export class UserFlagsBitField extends NumberFlagsBitField<UserFlagsString> {
  public static override readonly Flags = UserFlags;
}

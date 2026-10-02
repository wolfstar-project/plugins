// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the derived getters of
// discord.js are synchronous here too.
import type { GuildEmoji, GuildMember, Message, Role, TextChannel } from "../../src/index.js";

declare const member: GuildMember;
declare const message: Message;
declare const role: Role;
declare const channel: TextChannel;
declare const emoji: GuildEmoji;

export const canBan: boolean = member.permissions.has("BanMembers");
export const inChannel: boolean = member.permissionsIn(channel).has("SendMessages");
export const checks: boolean[] = [
  member.manageable,
  member.kickable,
  member.bannable,
  member.moderatable,
];
export const color: number = member.displayColor;
export const hexColor: `#${string}` = member.displayHexColor;
export const messageChecks: boolean[] = [
  message.editable,
  message.deletable,
  message.pinnable,
  message.crosspostable,
  message.bulkDeletable,
];
export const roleEditable: boolean = role.editable;
export const roleInChannel: boolean = role.permissionsIn(channel).has("ViewChannel");
export const forMember: boolean = channel.permissionsFor(member).has("ViewChannel");
export const emojiDeletable: boolean = emoji.deletable;
export const guildName: string | undefined = message.guild?.name;

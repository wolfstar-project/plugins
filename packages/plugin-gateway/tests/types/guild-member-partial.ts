// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the events handing out a
// member that may be partial say so, and `isPartial` narrows to `PartialGuildMember`.
import type {
  GatewayEventMap,
  GuildMember,
  GuildMemberRoleManager,
  PartialGuildMember,
  Typing,
} from "../../src/index.js";

declare const member: GuildMember;
declare const remove: GatewayEventMap["guildMemberRemove"];
declare const update: GatewayEventMap["guildMemberUpdate"];
declare const typing: Typing;

export const partialRoles: GuildMemberRoleManager = member.roles;
export const rolesPartial: boolean = member.roles.partial;

if (member.isPartial()) {
  takesPartial(member);
} else {
  // @ts-expect-error a member that is not partial is not a PartialGuildMember
  takesPartial(member);
}

function takesPartial(value: PartialGuildMember) {
  return value.partial;
}

export const removed: GuildMember | PartialGuildMember | null = remove[0];
export const previous: GuildMember | PartialGuildMember | null = update[0];
export const typist: GuildMember | PartialGuildMember | null = typing.member;

// The new member of an update is never built from IDs alone.
// @ts-expect-error `newMember` is a GuildMember, not a PartialGuildMember
export const fresh: PartialGuildMember = update[1];

// @ts-expect-error `partial` of a PartialGuildMember is always true
export const notPartial: false = (null as unknown as PartialGuildMember).partial;

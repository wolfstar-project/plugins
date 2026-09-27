import { InviteType } from "discord-api-types/v10";
import { BaseInvite, type InviteData } from "./BaseInvite.js";
import { GuildInvite } from "./GuildInvite.js";

/**
 * An invite to a group direct message. Its channel (name, icon, recipients) is exposed as `channel`.
 */
export class GroupDMInvite extends BaseInvite {}

/**
 * Builds the invite structure matching the type of a raw invite.
 *
 * @param data The raw invite.
 */
export function createInvite(data: InviteData): BaseInvite {
  switch (data.type ?? (data.guild_id || data.guild ? InviteType.Guild : InviteType.Friend)) {
    case InviteType.Guild:
      return new GuildInvite(data);
    case InviteType.GroupDM:
      return new GroupDMInvite(data);
    default:
      return new BaseInvite(data);
  }
}

import { InviteType } from "discord-api-types/v10";
import { BaseInvite, type InviteData, type InviteRelations } from "./BaseInvite.js";
import { GuildInvite } from "./GuildInvite.js";

/**
 * An invite to a group direct message. Its channel (name, icon, recipients) is exposed as `channel`.
 */
export class GroupDMInvite extends BaseInvite {}

/**
 * Builds the invite structure matching the type of a raw invite.
 *
 * @param data The raw invite.
 * @param relations The related structures, resolved from the cache.
 */
export function createInvite(data: InviteData, relations: InviteRelations = {}): BaseInvite {
  switch (data.type ?? (data.guild_id || data.guild ? InviteType.Guild : InviteType.Friend)) {
    case InviteType.Guild:
      return new GuildInvite(data, relations);
    case InviteType.GroupDM:
      return new GroupDMInvite(data, relations);
    default:
      return new BaseInvite(data, relations);
  }
}

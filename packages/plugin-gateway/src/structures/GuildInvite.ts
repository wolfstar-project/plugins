import { getGatewayClient } from "../util/container.js";
import { BaseInvite } from "./BaseInvite.js";
import { InviteGuild } from "./InviteGuild.js";
import type { Guild } from "./Guild.js";
import { kData, kRelations } from "./Structure.js";

/**
 * An invite to a guild.
 */
export class GuildInvite extends BaseInvite {
  public get guildId(): string | null {
    return this[kData].guild?.id ?? this[kData].guild_id ?? null;
  }

  /**
   * The guild the invite leads to: the cached guild when the invite comes from a manager, like discord.js, else the
   * partial guild the API returns with the invite, if any.
   */
  public get guild(): Guild | InviteGuild | null {
    const { guild } = this[kData];
    return this[kRelations].guild ?? (guild ? new InviteGuild(guild) : null);
  }

  /**
   * Whether the bot can delete the invite: it created it, or it has `ManageGuild` (or `ManageChannels`).
   */
  public async fetchDeletable(): Promise<boolean> {
    const client = getGatewayClient();
    const { guildId } = this;
    if (!guildId) return false;
    if (this.inviterId === (client.user?.id ?? client.id)) return true;

    const me = await client.members.fetchMe(guildId);
    const permissions = await me.fetchPermissions();
    return permissions.any(["ManageGuild", "ManageChannels"]);
  }

  /**
   * Deletes the invite.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    const { guildId } = this;
    if (!guildId) throw new Error(`Invite ${this.code} has no known guild`);
    await getGatewayClient().guilds.invites(guildId).delete(this.code, reason);
    return this;
  }
}

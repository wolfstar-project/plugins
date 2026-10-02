import { requireMe } from "../../util/permissions.js";
import { BaseInvite } from "./BaseInvite.js";
import { InviteGuild } from "../guilds/InviteGuild.js";
import type { Guild } from "../guilds/Guild.js";
import { kData, kRelations } from "../Structure.js";
import { GatewayError } from "../../errors/GatewayError.js";

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
   * Whether the bot can delete the invite, like discord.js's `GuildInvite#deletable`: it created it, or it has
   * `ManageGuild` (or `ManageChannels`).
   *
   * @throws A `GatewayError` when the permissions are needed: `CacheAsynchronous` with an asynchronous cache (use
   * {@link GuildInvite.fetchDeletable}), `GuildUncachedMe` or `GuildUncached` on a cache miss.
   */
  public get deletable(): boolean {
    const client = this.client;
    const { guildId } = this;
    if (!guildId) return false;
    if (this.inviterId === (client.user?.id ?? client.id)) return true;

    return requireMe(client, guildId).permissions.any(["ManageGuild", "ManageChannels"]);
  }

  /**
   * Whether the bot can delete the invite: it created it, or it has `ManageGuild` (or `ManageChannels`).
   */
  public async fetchDeletable(): Promise<boolean> {
    const client = this.client;
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
    if (!guildId) throw new GatewayError("InviteGuildUnknown", this.code);
    await this.client.guilds.invites(guildId).delete(this.code, reason);
    return this;
  }
}

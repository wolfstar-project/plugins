import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData, kPatch, lazyRelation } from "../../Structure.js";
import { cachedChannel } from "../../../util/cache.js";
import type { APIOverwrite } from "discord-api-types/v10";
import type { SetPositionOptions } from "../../../managers/GuildChannelManager.js";
import { PermissionOverwriteManager } from "../../../managers/PermissionOverwriteManager.js";
import type { IdResolvable } from "../../../util/channels.js";
import { computeTargetPermissions } from "../../../util/permissions.js";
import type { PermissionsBitField } from "../../../util/PermissionsBitField.js";
import type { GuildMember } from "../../guilds/GuildMember.js";
import type { Role } from "../../guilds/Role.js";
import { editChannel } from "./edit.js";
import { GatewayError } from "../../../errors/GatewayError.js";

type Data = {
  guild_id?: string;
  parent_id?: string | null;
  position?: number;
  permission_overwrites?: APIOverwrite[];
};

// Whether two channels have the same permission overwrites, in any order.
function sameOverwrites(channel: Data, parent: Data): boolean {
  const own = channel.permission_overwrites ?? [];
  const theirs = parent.permission_overwrites ?? [];
  return (
    own.length === theirs.length &&
    own.every((overwrite) =>
      theirs.some(
        (other) =>
          other.id === overwrite.id &&
          other.type === overwrite.type &&
          other.allow === overwrite.allow &&
          other.deny === overwrite.deny,
      ),
    )
  );
}

export interface ChannelPermissionMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the position and permission overwrites of guild channels other than threads.
 */
export class ChannelPermissionMixin<Type extends ChannelType = ChannelType> {
  public get position(): number {
    return (this[kData] as Data).position ?? 0;
  }

  /**
   * The permission overwrites of the channel.
   */
  public get permissionOverwrites(): PermissionOverwriteManager {
    const data = this[kData] as Data;
    return new PermissionOverwriteManager(
      this.client,
      this.id,
      data.guild_id ?? null,
      data.permission_overwrites ?? [],
      this as never,
    );
  }

  /**
   * Whether the channel's overwrites are the same as its category's, like discord.js's
   * `GuildChannel#permissionsLocked`: `null` when it has no category, or when the category is not in a synchronous cache (see
   * {@link ChannelPermissionMixin.fetchPermissionsLocked}).
   */
  public get permissionsLocked(): boolean | null {
    const parent = lazyRelation<{ toJSON(): unknown }>(this, "parent", (client) =>
      cachedChannel(client, (this[kData] as Data).parent_id),
    );
    if (!parent) return null;
    return sameOverwrites(this[kData] as Data, parent.toJSON() as Data);
  }

  /**
   * Moves the channel among the channels it is sorted with, like discord.js's `GuildChannel#setPosition`.
   *
   * @param position The index to move it to among them, or the offset to move it by with `relative`.
   * @param options Whether the position is relative, and the reason for the audit log.
   */
  public async setPosition(position: number, options: SetPositionOptions = {}): Promise<this> {
    const { guild_id: guildId } = this[kData] as Data;
    if (!guildId) throw new GatewayError("ChannelGuildUnknown", this.id);

    const moved = await this.client.guilds
      .channels(guildId)
      .setPosition(this.id, position, options);
    return this[kPatch]({ position: (moved.toJSON() as Data).position } as never);
  }

  /**
   * Moves the channel into a category, or out of its category.
   *
   * @param parent The category, `null` to move the channel out.
   * @param options Whether to copy the category's overwrites (the default), and the reason for the audit log.
   */
  public setParent(
    parent: IdResolvable | null,
    options: { lockPermissions?: boolean; reason?: string } = {},
  ): Promise<this> {
    return editChannel(this, {
      parent,
      lockPermissions: options.lockPermissions ?? true,
      reason: options.reason,
    });
  }

  public setNSFW(nsfw = true, reason?: string): Promise<this> {
    return editChannel(this, { nsfw, reason });
  }

  /**
   * Replaces the channel's overwrites with its category's.
   *
   * @param reason The reason for the audit log.
   */
  public lockPermissions(reason?: string): Promise<this> {
    if (!(this[kData] as Data).parent_id) {
      throw new GatewayError("GuildChannelOrphan", this.id);
    }

    return editChannel(this, { lockPermissions: true, reason });
  }

  /**
   * Fetches whether the channel's overwrites are the same as its category's. `null` without a category.
   */
  public async fetchPermissionsLocked(): Promise<boolean | null> {
    const { parent_id: parentId } = this[kData] as Data;
    if (!parentId) return null;

    const parent = (await this.client.channels.fetch(parentId)).toJSON() as Data;
    return sameOverwrites(this[kData] as Data, parent);
  }

  /**
   * Fetches the permissions of a member or role in the channel: their guild permissions with the channel's overwrites
   * applied. discord.js: `channel.permissionsFor(memberOrRole)`.
   *
   * @param target A member, a role, or the ID of a member.
   */
  public async fetchPermissionsFor(
    target: GuildMember | Role | string,
  ): Promise<Readonly<PermissionsBitField>> {
    const { guild_id: guildId, permission_overwrites: overwrites = [] } = this[kData] as Data;
    if (!guildId) throw new GatewayError("ChannelGuildUnknown", this.id);
    return computeTargetPermissions(guildId, overwrites, target);
  }
}

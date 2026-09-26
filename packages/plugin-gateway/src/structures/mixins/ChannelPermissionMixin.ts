import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData, kPatch } from "../Structure.js";
import type { APIOverwrite } from "discord-api-types/v10";
import { PermissionOverwriteManager } from "../../managers/PermissionOverwriteManager.js";
import type { IdResolvable } from "../../util/channels.js";
import { getGatewayClient } from "../../util/container.js";
import { computeTargetPermissions } from "../../util/permissions.js";
import type { PermissionsBitField } from "../../util/PermissionsBitField.js";
import type { GuildMember } from "../GuildMember.js";
import type { Role } from "../Role.js";
import { editChannel } from "./edit.js";

type Data = {
  guild_id?: string;
  parent_id?: string | null;
  position?: number;
  permission_overwrites?: APIOverwrite[];
};

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
      getGatewayClient(),
      this.id,
      data.guild_id ?? null,
      data.permission_overwrites ?? [],
    );
  }

  /**
   * Moves the channel.
   *
   * @param position The new position, or the offset from the current one with `relative`.
   * @param options Whether the position is relative, and the reason for the audit log.
   */
  public async setPosition(
    position: number,
    options: { relative?: boolean; reason?: string } = {},
  ): Promise<this> {
    const { guild_id: guildId } = this[kData] as Data;
    if (!guildId) throw new Error(`Channel ${this.id} has no known guild`);

    const target = options.relative ? this.position + position : position;
    await getGatewayClient()
      .guilds.channels(guildId)
      .setPositions([{ channel: this.id, position: target }], options.reason);
    return this[kPatch]({ position: target } as never);
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
      throw new Error(`Channel ${this.id} has no category to sync its permissions with`);
    }

    return editChannel(this, { lockPermissions: true, reason });
  }

  /**
   * Fetches whether the channel's overwrites are the same as its category's. `null` without a category.
   */
  public async fetchPermissionsLocked(): Promise<boolean | null> {
    const { parent_id: parentId } = this[kData] as Data;
    if (!parentId) return null;

    const parent = (await getGatewayClient().channels.fetch(parentId)).toJSON() as Data;
    const own = (this[kData] as Data).permission_overwrites ?? [];
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
    if (!guildId) throw new Error(`Channel ${this.id} has no known guild`);
    return computeTargetPermissions(guildId, overwrites, target);
  }
}

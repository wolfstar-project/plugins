import type { APIOverwrite } from "discord-api-types/v10";
import { getGatewayClient } from "../util/container.js";
import type { PermissionOverwriteOptions } from "../util/channels.js";
import { PermissionsBitField } from "../util/PermissionsBitField.js";
import { kData, kPatch, Structure } from "./Structure.js";

/**
 * The raw data of a permission overwrite, with the channel it belongs to.
 */
export type PermissionOverwritesData = APIOverwrite & { channel_id: string };

/**
 * A permission overwrite of a channel: what it allows and denies to a role or a member.
 */
export class PermissionOverwrites extends Structure<PermissionOverwritesData> {
  /**
   * The ID of the role or member the overwrite targets.
   */
  public get id() {
    return this[kData].id;
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  /**
   * Whether the overwrite targets a role or a member.
   */
  public get type() {
    return this[kData].type;
  }

  public get allow(): Readonly<PermissionsBitField> {
    return new PermissionsBitField(BigInt(this[kData].allow)).freeze();
  }

  public get deny(): Readonly<PermissionsBitField> {
    return new PermissionsBitField(BigInt(this[kData].deny)).freeze();
  }

  /**
   * Changes some permissions of the overwrite, keeping the others.
   *
   * @param options The permissions to change.
   * @param reason The reason for the audit log.
   */
  public async edit(options: PermissionOverwriteOptions, reason?: string): Promise<this> {
    const overwrites = await getGatewayClient().channels.permissionOverwrites(this.channelId);
    const edited = await overwrites.edit(this.id, options, { type: this.type, reason });
    return this[kPatch](edited.toJSON());
  }

  /**
   * Deletes the overwrite.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    const overwrites = await getGatewayClient().channels.permissionOverwrites(this.channelId);
    await overwrites.delete(this.id, reason);
    return this;
  }
}

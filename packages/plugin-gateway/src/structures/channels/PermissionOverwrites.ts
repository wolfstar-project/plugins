import { cachedChannel } from "../../util/cache.js";
import type { APIOverwrite } from "discord-api-types/v10";
import type { PermissionOverwriteOptions } from "../../util/channels.js";
import { PermissionsBitField } from "../../util/PermissionsBitField.js";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import { kData, kPatch, type kRelations, Structure } from "../Structure.js";

/**
 * The relations of a {@link PermissionOverwrites}: the channel it belongs to.
 */
export interface PermissionOverwritesRelations {
  channel?: AnyChannel | null;
}

/**
 * The raw data of a permission overwrite, with the channel it belongs to.
 */
export type PermissionOverwritesData = APIOverwrite & { channel_id: string };
const kOptimizedAllow: unique symbol = Symbol("overwrite.allow");
const kOptimizedDeny: unique symbol = Symbol("overwrite.deny");

/**
 * A permission overwrite of a channel: what it allows and denies to a role or a member.
 */
export class PermissionOverwrites extends Structure<PermissionOverwritesData> {
  declare public [kRelations]: PermissionOverwritesRelations;

  declare protected [kOptimizedAllow]: bigint;
  declare protected [kOptimizedDeny]: bigint;

  protected override optimizeData(data: Partial<PermissionOverwritesData>): void {
    if (data.allow !== undefined) this[kOptimizedAllow] = BigInt(data.allow);
    if (data.deny !== undefined) this[kOptimizedDeny] = BigInt(data.deny);
  }

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
   * The channel the overwrite belongs to, like discord.js's `PermissionOverwrites#channel`: `null` when the overwrite
   * was not read from a channel.
   */
  public get channel(): AnyChannel | null {
    return this.lazyRelation("channel", (client) => cachedChannel(client, this[kData].channel_id));
  }

  /**
   * Whether the overwrite targets a role or a member.
   */
  public get type() {
    return this[kData].type;
  }

  public get allow(): Readonly<PermissionsBitField> {
    return new PermissionsBitField(this[kOptimizedAllow] ?? 0n).freeze();
  }

  public get deny(): Readonly<PermissionsBitField> {
    return new PermissionsBitField(this[kOptimizedDeny] ?? 0n).freeze();
  }

  /**
   * Changes some permissions of the overwrite, keeping the others.
   *
   * @param options The permissions to change.
   * @param reason The reason for the audit log.
   */
  public async edit(options: PermissionOverwriteOptions, reason?: string): Promise<this> {
    const overwrites = await this.client.channels.permissionOverwrites(this.channelId);
    const edited = await overwrites.edit(this.id, options, { type: this.type, reason });
    return this[kPatch](edited.toJSON());
  }

  /**
   * Deletes the overwrite.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    const overwrites = await this.client.channels.permissionOverwrites(this.channelId);
    await overwrites.delete(this.id, reason);
    return this;
  }
}

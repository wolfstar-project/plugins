import type { Channel as BaseChannelStructure } from "@discordjs/structures";
import { type ChannelType } from "discord-api-types/v10";
import { ChannelFlagsBitField } from "../../../util/flags.js";
import type { ChannelDataType, ChannelRelations } from "../Channel.js";
import {
  kData,
  kPatch,
  kPatchRelations,
  snowflakeTimestamp,
  type StructureMixin,
} from "../../Structure.js";

export interface BaseChannelMixin<Type extends ChannelType = ChannelType>
  extends BaseChannelStructure<Type>, StructureMixin<ChannelDataType<Type>, ChannelRelations> {}

/**
 * Adds what every channel shares on top of `@discordjs/structures`' `Channel`: its relations, and the REST actions
 * every channel supports.
 */
export class BaseChannelMixin<Type extends ChannelType = ChannelType> {
  /**
   * Forgets the parent when a patch moves the channel.
   *
   * @internal
   */
  public [kPatchRelations](data: object): void {
    this.dropChangedRelations(data, { parent: "parent_id" });
  }

  /**
   * Whether the channel is partial, like discord.js's `BaseChannel#partial`: only direct messages can be, see
   * `Partials.Channel`.
   */
  public get partial(): boolean {
    return false;
  }

  /**
   * The flags of the channel.
   */
  public get flags(): Readonly<ChannelFlagsBitField> {
    return new ChannelFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  public toString(): `<#${string}>` {
    return `<#${this.id}>`;
  }

  /**
   * Deletes the channel, or closes it for a direct message, and drops it from the cache.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await this.client.channels.delete(this.id, reason);
    return this;
  }

  /**
   * Fetches the channel from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const data = await this.client.api.channels.get(this.id);
    if (data.type !== this.type) {
      throw new TypeError(`Channel ${this.id} changed type from ${this.type} to ${data.type}`);
    }

    return this[kPatch](data as ChannelDataType<Type>);
  }
}

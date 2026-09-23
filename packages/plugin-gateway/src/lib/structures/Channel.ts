import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { ChannelType } from "discord-api-types/v10";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

type ChannelData = CacheEntityTypes["channels"];

// Reads a field that only some channel types have, e.g. `topic`.
type Field<Key extends PropertyKey> = ChannelData extends infer Variant
  ? Variant extends { [K in Key]?: infer Value }
    ? Value
    : never
  : never;

const ThreadTypes: readonly ChannelType[] = [
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
];

/**
 * A Discord channel of any type, threads included.
 */
export class Channel extends Structure<ChannelData> {
  public get id() {
    return this[kData].id;
  }

  public get type() {
    return this[kData].type;
  }

  public get name(): string | null {
    return this.field("name") ?? null;
  }

  public get guildId(): string | null {
    return this.field("guild_id") ?? null;
  }

  public get parentId(): string | null {
    return this.field("parent_id") ?? null;
  }

  public get topic(): string | null {
    return this.field("topic") ?? null;
  }

  public get nsfw(): boolean {
    return this.field("nsfw") ?? false;
  }

  public get position(): number | null {
    return this.field("position") ?? null;
  }

  public get lastMessageId(): string | null {
    return this.field("last_message_id") ?? null;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * Whether this channel is a thread.
   */
  public isThread(): boolean {
    return ThreadTypes.includes(this.type);
  }

  /**
   * Whether this channel is a direct message or a group direct message.
   */
  public isDMBased(): boolean {
    return this.type === ChannelType.DM || this.type === ChannelType.GroupDM;
  }

  public toString(): `<#${string}>` {
    return `<#${this.id}>`;
  }

  private field<Key extends string>(key: Key): Field<Key> | undefined {
    return (this[kData] as { [K in Key]?: Field<Key> })[key];
  }
}

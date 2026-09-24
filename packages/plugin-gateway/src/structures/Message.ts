import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";
import { User } from "./User.js";
import { GuildMember } from "./GuildMember.js";

/**
 * A Discord message.
 */
export class Message extends Structure<CacheEntityTypes["messages"]> {
  public get id() {
    return this[kData].id;
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  public get content() {
    return this[kData].content;
  }

  public get type() {
    return this[kData].type;
  }

  public get author(): User {
    return new User(this[kData].author);
  }

  /**
   * The author as a guild member, or `null` for messages sent outside of a guild or by a webhook.
   */
  public get member(): GuildMember | null {
    const { member, guild_id: guildId, author } = this[kData];
    return member && guildId
      ? new GuildMember({ ...member, user: author, guild_id: guildId })
      : null;
  }

  public get webhookId(): string | null {
    return this[kData].webhook_id ?? null;
  }

  public get pinned() {
    return this[kData].pinned;
  }

  public get tts() {
    return this[kData].tts;
  }

  public get attachments() {
    return this[kData].attachments;
  }

  public get embeds() {
    return this[kData].embeds;
  }

  public get components() {
    return this[kData].components ?? [];
  }

  /**
   * The users mentioned in the message.
   */
  public get mentions(): User[] {
    return this[kData].mentions.map((user) => new User(user));
  }

  public get mentionedRoleIds(): readonly string[] {
    return this[kData].mention_roles;
  }

  public get mentionsEveryone() {
    return this[kData].mention_everyone;
  }

  public get reference() {
    return this[kData].message_reference ?? null;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  public get editedTimestamp(): number | null {
    const editedAt = this[kData].edited_timestamp;
    return editedAt ? Date.parse(editedAt) : null;
  }

  /**
   * The URL to jump to this message.
   */
  public get url(): string {
    return `https://discord.com/channels/${this.guildId ?? "@me"}/${this.channelId}/${this.id}`;
  }

  public toString(): string {
    return this.content;
  }
}

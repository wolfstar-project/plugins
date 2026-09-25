import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageFlags,
  MessageReferenceType,
  MessageType,
  type APIMessage,
  type APIThreadChannel,
} from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { MessageThreadCreateOptions } from "../managers/MessageManager.js";
import { ReactionManager } from "../managers/ReactionManager.js";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import { getGatewayClient } from "../util/container.js";
import { isDeepEqual } from "../util/equal.js";
import { MessageFlagsBitField } from "../util/flags.js";
import type {
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayloadResolvable,
} from "../util/messages.js";
import type { PermissionsString } from "../util/PermissionsBitField.js";
import { Attachment } from "./Attachment.js";
import { Embed } from "./Embed.js";
import type { Guild } from "./Guild.js";
import { GuildMember } from "./GuildMember.js";
import { MessageMentions } from "./MessageMentions.js";
import { Poll } from "./Poll.js";
import type { EmojiIdentifierResolvable } from "./ReactionEmoji.js";
import { kData, kPatch, snowflakeTimestamp, Structure } from "./Structure.js";
import { User } from "./User.js";

const ZeroWidthSpace = String.fromCodePoint(0x20_0b);

// The message types a user can send; every other type is a system message.
const NonSystemTypes: readonly MessageType[] = [
  MessageType.Default,
  MessageType.Reply,
  MessageType.ChatInputCommand,
  MessageType.ContextMenuCommand,
];

/**
 * A Discord message.
 *
 * @remarks
 * Relations discord.js reads synchronously from its cache are asynchronous here: `fetchChannel()`, `fetchGuild()`,
 * `fetchReference()`, and the `fetch*able()` permission checks. Those checks use guild-wide permissions: channel
 * overwrites come with the channel phase of #54.
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

  /**
   * Whether the message was sent by Discord, e.g. a member join or a pin notice.
   */
  public get system(): boolean {
    return !NonSystemTypes.includes(this.type);
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

  /**
   * The ID of the application that sent the message, for interaction responses and webhooks of an application.
   */
  public get applicationId(): string | null {
    return this[kData].application_id ?? null;
  }

  public get pinned() {
    return this[kData].pinned;
  }

  public get tts() {
    return this[kData].tts;
  }

  /**
   * The nonce the message was sent with, used to confirm it was sent.
   */
  public get nonce(): string | number | null {
    return this[kData].nonce ?? null;
  }

  /**
   * The position of the message in its thread, if it was sent in one.
   */
  public get position(): number | null {
    return this[kData].position ?? null;
  }

  public get flags(): Readonly<MessageFlagsBitField> {
    return new MessageFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  public get attachments(): Attachment[] {
    return this[kData].attachments.map((attachment) => new Attachment(attachment));
  }

  public get embeds(): Embed[] {
    return this[kData].embeds.map((embed) => new Embed(embed));
  }

  /**
   * The raw components of the message. Build components with `@discordjs/builders`.
   */
  public get components() {
    return this[kData].components ?? [];
  }

  /**
   * The raw sticker items of the message; fetch a full sticker with `client.fetchSticker(id)`.
   */
  public get stickers() {
    return this[kData].sticker_items ?? [];
  }

  public get mentions(): MessageMentions {
    return new MessageMentions(this[kData]);
  }

  public get reactions(): ReactionManager {
    return new ReactionManager(
      getGatewayClient(),
      this.channelId,
      this.id,
      this[kData].reactions ?? [],
    );
  }

  public get poll(): Poll | null {
    const { poll } = this[kData];
    return poll ? new Poll({ ...poll, channel_id: this.channelId, message_id: this.id }) : null;
  }

  /**
   * The reference of a reply, crosspost, forward, or pin notice, if any.
   */
  public get reference() {
    return this[kData].message_reference ?? null;
  }

  /**
   * The snapshots of the messages this one forwards.
   */
  public get messageSnapshots() {
    return this[kData].message_snapshots ?? [];
  }

  /**
   * The rich presence activity the message was sent with, e.g. a game invite.
   */
  public get activity() {
    return this[kData].activity ?? null;
  }

  /**
   * The metadata of the interaction the message answers, if any.
   */
  public get interactionMetadata() {
    return this[kData].interaction_metadata ?? null;
  }

  /**
   * The call a call message is about.
   */
  public get call() {
    return this[kData].call ?? null;
  }

  /**
   * The subscription a role subscription purchase message is about.
   */
  public get roleSubscriptionData() {
    return this[kData].role_subscription_data ?? null;
  }

  /**
   * Whether a thread was started from the message.
   */
  public get hasThread(): boolean {
    return this.flags.has(MessageFlags.HasThread);
  }

  /**
   * The thread started from the message, when the payload includes it.
   */
  public get thread(): AnyThreadChannel | null {
    const { thread } = this[kData] as APIMessage & { thread?: APIThreadChannel };
    return thread ? getGatewayClient().threads.createStructure(thread) : null;
  }

  /**
   * The content with user mentions replaced by names, and `@everyone`/`@here` defused. Role and channel mentions are
   * kept, since resolving them would take the (asynchronous) cache.
   */
  public get cleanContent(): string {
    const members = new Map(
      this.mentions.members.map((member) => [member.id, member.displayName] as const),
    );
    const users = new Map(this.mentions.users.map((user) => [user.id, user.displayName] as const));
    return this.content
      .replaceAll(MessageMentions.UsersPattern, (match, id: string) => {
        const name = members.get(id) ?? users.get(id);
        return name ? `@${name}` : match;
      })
      .replaceAll(/@(everyone|here)/g, `@${ZeroWidthSpace}$1`);
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

  public get editedAt(): Date | null {
    const { editedTimestamp } = this;
    return editedTimestamp === null ? null : new Date(editedTimestamp);
  }

  /**
   * The URL to jump to this message.
   */
  public get url(): string {
    return `https://discord.com/channels/${this.guildId ?? "@me"}/${this.channelId}/${this.id}`;
  }

  /**
   * Whether the message was sent in a guild.
   */
  public inGuild(): boolean {
    return this.guildId !== null;
  }

  /**
   * Fetches the channel the message was sent in.
   */
  public fetchChannel(): Promise<AnyChannel> {
    return getGatewayClient().channels.fetch(this.channelId);
  }

  /**
   * Fetches the guild the message was sent in, `null` outside of guilds.
   */
  public async fetchGuild(): Promise<Guild | null> {
    const { guildId } = this;
    return guildId ? getGatewayClient().guilds.fetch(guildId) : null;
  }

  /**
   * Fetches the message this one replies to, crossposts, or forwards.
   */
  public async fetchReference(): Promise<Message> {
    const reference = this.reference;
    if (!reference?.message_id) throw new Error(`Message ${this.id} references no message`);
    return getGatewayClient().messages.fetch(
      reference.channel_id ?? this.channelId,
      reference.message_id,
    );
  }

  /**
   * Whether the bot can edit the message: it is the author.
   */
  public async fetchEditable(): Promise<boolean> {
    const client = getGatewayClient();
    return this.author.id === (client.user?.id ?? client.id);
  }

  /**
   * Whether the bot can delete the message: it is the author, or it has `ManageMessages` in the guild.
   */
  public async fetchDeletable(): Promise<boolean> {
    return (await this.fetchEditable()) || this.hasPermission("ManageMessages");
  }

  /**
   * Whether the bot can bulk delete the message: it can delete it, and it is newer than 14 days.
   */
  public async fetchBulkDeletable(): Promise<boolean> {
    return (
      Date.now() - this.createdTimestamp < 14 * 24 * 60 * 60 * 1000 &&
      (await this.hasPermission("ManageMessages"))
    );
  }

  /**
   * Whether the bot can pin the message: it is not a system message, and the bot has `PinMessages`.
   */
  public async fetchPinnable(): Promise<boolean> {
    if (this.system) return false;
    return !this.inGuild() || this.hasPermission("PinMessages");
  }

  /**
   * Whether the bot can publish the message: it is in an announcement channel, not crossposted yet, and the bot
   * authored it or has `ManageMessages`.
   */
  public async fetchCrosspostable(): Promise<boolean> {
    if (this.flags.has(MessageFlags.Crossposted) || this.system || !this.inGuild()) return false;
    const channel = await this.fetchChannel();
    if (channel.type !== ChannelType.GuildAnnouncement) return false;
    return (await this.fetchEditable()) || this.hasPermission("ManageMessages");
  }

  /**
   * Fetches the message from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const message = await getGatewayClient().messages.fetch(this.channelId, this.id, {
      force: true,
    });
    return this[kPatch](message.toJSON());
  }

  /**
   * Edits the message.
   *
   * @param options The changes, or the new content.
   */
  public async edit(options: MessagePayloadResolvable<MessageEditOptions>): Promise<this> {
    const message = await getGatewayClient().messages.edit(this.channelId, this.id, options);
    return this[kPatch](message.toJSON());
  }

  /**
   * Replies to the message.
   *
   * @param options The reply, or its content.
   */
  public reply(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    const payload = typeof options === "string" ? { content: options } : options;
    return getGatewayClient().messages.send(this.channelId, {
      ...payload,
      message_reference: {
        type: MessageReferenceType.Default,
        message_id: this.id,
        channel_id: this.channelId,
        fail_if_not_exists: false,
      },
    });
  }

  /**
   * Forwards the message to another channel.
   *
   * @param channelId The ID of the channel to forward it to.
   */
  public forward(channelId: string): Promise<Message> {
    return getGatewayClient().messages.forward(this.channelId, this.id, channelId);
  }

  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().messages.delete(this.channelId, this.id, reason);
    return this;
  }

  public async pin(reason?: string): Promise<this> {
    await getGatewayClient().messages.pin(this.channelId, this.id, reason);
    return this[kPatch]({ pinned: true });
  }

  public async unpin(reason?: string): Promise<this> {
    await getGatewayClient().messages.unpin(this.channelId, this.id, reason);
    return this[kPatch]({ pinned: false });
  }

  /**
   * Reacts to the message as the bot.
   *
   * @param emoji The emoji.
   */
  public async react(emoji: EmojiIdentifierResolvable): Promise<this> {
    await getGatewayClient().messages.react(this.channelId, this.id, emoji);
    return this;
  }

  /**
   * Publishes the message of an announcement channel to the channels following it.
   */
  public async crosspost(): Promise<this> {
    const message = await getGatewayClient().messages.crosspost(this.channelId, this.id);
    return this[kPatch](message.toJSON());
  }

  /**
   * Starts a thread from the message.
   *
   * @param options The thread's name and settings.
   */
  public startThread(options: MessageThreadCreateOptions): Promise<AnyThreadChannel> {
    return getGatewayClient().messages.startThread(this.channelId, this.id, options);
  }

  /**
   * Hides or shows the embeds of the message.
   *
   * @param suppress Whether to hide them.
   */
  public suppressEmbeds(suppress = true): Promise<this> {
    const flags = new MessageFlagsBitField(this.flags.bitField);
    if (suppress) flags.add(MessageFlags.SuppressEmbeds);
    else flags.remove(MessageFlags.SuppressEmbeds);
    return this.edit({ flags: Number(flags.bitField) });
  }

  /**
   * Removes every attachment of the message.
   */
  public removeAttachments(): Promise<this> {
    return this.edit({ attachments: [] });
  }

  /**
   * Whether this message has the same data as another one, or as a raw message.
   * @param message The message to compare with.
   */
  public equals(message: Message | APIMessage): boolean {
    const other = message instanceof Message ? message.toJSON() : message;
    return (
      this.id === other.id &&
      this.content === other.content &&
      this.author.id === other.author.id &&
      this.pinned === other.pinned &&
      this.tts === other.tts &&
      this.editedTimestamp ===
        (other.edited_timestamp ? Date.parse(other.edited_timestamp) : null) &&
      isDeepEqual(this[kData].embeds, other.embeds) &&
      isDeepEqual(this[kData].attachments, other.attachments)
    );
  }

  public toString(): string {
    return this.content;
  }

  private async hasPermission(permission: PermissionsString): Promise<boolean> {
    const { guildId } = this;
    if (!guildId) return false;
    const me = await getGatewayClient().members.fetchMe(guildId);
    return (await me.fetchPermissions()).has(permission);
  }
}

import type { Awaitable } from "@wolfstar/plugin-cache";
import {
  cachedChannel,
  cachedGuild,
  cacheRead,
  peekCache,
  whenAll,
  type CacheRead,
} from "../../util/cache.js";
import { Collection } from "@discordjs/collection";
import { Message as BaseMessage, Structure as BaseStructure } from "@discordjs/structures";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageFlags,
  MessageType,
  type APIMessage,
  type APIThreadChannel,
} from "discord-api-types/v10";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { MessageThreadCreateOptions } from "../../managers/MessageManager.js";
import { ReactionManager } from "../../managers/ReactionManager.js";
import type { AnyThreadChannel } from "../../managers/ThreadManager.js";
import {
  createComponent,
  findComponentByCustomId,
  type AnyComponent,
  type MessageTopLevelComponent,
} from "../../util/components.js";
import type { APIAnyComponent } from "../components/Component.js";
import { isDeepEqual } from "../../util/equal.js";
import {
  transformAPIMessageActivity,
  transformAPIMessageCall,
  transformAPIMessageInteractionMetadata,
  transformAPIMessageReference,
  transformAPIMessageSharedClientTheme,
  transformAPIRoleSubscriptionData,
  type MessageActivity,
  type MessageCall,
  type MessageInteractionMetadata,
  type MessageReference,
  type RoleSubscriptionData,
  type SharedClientTheme,
} from "../../util/Transformers.js";
import type { Webhook } from "../webhooks/Webhook.js";
import { MessageFlagsBitField } from "../../util/flags.js";
import { requireMe } from "../../util/permissions.js";
import { withOwnReaction } from "../../util/reactions.js";
import {
  MessagePayload,
  type MessageCreateOptions,
  type MessageEditOptions,
  type MessagePayloadResolvable,
} from "./MessagePayload.js";
import type { PermissionsString } from "../../util/PermissionsBitField.js";
import { Attachment } from "./Attachment.js";
import { Embed } from "./Embed.js";
import type { Guild } from "../guilds/Guild.js";
import { GuildMember } from "../guilds/GuildMember.js";
import type { MessageReaction } from "./MessageReaction.js";
import { MessageMentions, type MessageMentionsRelations } from "./MessageMentions.js";
import type { GuildEmoji } from "../emojis/GuildEmoji.js";
import { Poll } from "../polls/Poll.js";
import { Sticker } from "../stickers/Sticker.js";
import type { EmojiIdentifierResolvable } from "../emojis/ReactionEmoji.js";
import { Mixin } from "../Mixin.js";
import {
  bindClient,
  initStructure,
  kClient,
  kData,
  kPatch,
  kRelations,
  snowflakeTimestamp,
  StructureMixin,
} from "../Structure.js";
import { User } from "../users/User.js";
import { GatewayError } from "../../errors/GatewayError.js";
import type {
  GuildTextBasedChannel,
  If,
  Partialize,
  TextBasedChannel,
  TextBasedChannelResolvable,
} from "../../types.js";
import type { GroupDMChannel } from "../channels/GroupDMChannel.js";

const ZeroWidthSpace = String.fromCodePoint(0x20_0b);

/**
 * The relations of a {@link Message}, resolved from the cache by `client.messages`.
 */
export interface MessageRelations {
  author?: User;
  /**
   * The author as a member, `null` outside of guilds.
   */
  member?: GuildMember | null;
  guild?: Guild | null;
  channel?: AnyChannel | null;
  /**
   * The thread started from the message, from the thread cache.
   */
  thread?: AnyThreadChannel | null;
  /**
   * The mentioned users, members, roles, and channels, from the cache.
   */
  mentions?: MessageMentionsRelations;
  /**
   * The cached custom emojis of the message's reactions and poll answers, by ID, when they belong to its guild.
   */
  emojis?: ReadonlyMap<string, GuildEmoji>;
}

// The message types a user can send; every other type is a system message.
const NonSystemTypes: readonly MessageType[] = [
  MessageType.Default,
  MessageType.Reply,
  MessageType.ChatInputCommand,
  MessageType.ContextMenuCommand,
];

// oxlint-disable-next-line no-unused-vars -- merged with the class, which uses it; the declarations must match.
export interface Message<InGuild extends boolean = boolean> extends StructureMixin<
  CacheEntityTypes["messages"],
  MessageRelations
> {}

/**
 * A message built from its IDs alone, like discord.js's `PartialMessage`: `partial` is `true`, and `content`, `author`
 * and `cleanContent` may be missing. Narrow a `Message | PartialMessage` with `partial`; {@link Message.fetch}
 * completes it.
 */
export interface PartialMessage<InGuild extends boolean = boolean> extends Partialize<
  Message<InGuild>,
  "pinned" | "system" | "tts" | "type",
  "author" | "cleanContent" | "content"
> {}

/**
 * A structure whose `channel` can not be a group direct message, like discord.js's `OmitPartialGroupDMChannel`: what
 * the message actions resolve to.
 */
export type OmitPartialGroupDMChannel<Structure extends { channel: AnyChannel | null }> =
  Structure & { channel: Exclude<Structure["channel"], GroupDMChannel> };

/**
 * A snapshot of a forwarded message, like discord.js's `MessageSnapshot`: only the data Discord keeps, the rest may be
 * `null`.
 */
export type MessageSnapshot = Partialize<
  Message,
  null,
  Exclude<
    keyof Message,
    | "attachments"
    | "client"
    | "components"
    | "content"
    | "createdTimestamp"
    | "editedTimestamp"
    | "embeds"
    | "flags"
    | "mentions"
    | "stickers"
    | "type"
  >
>;

/**
 * A Discord message: `@discordjs/structures`' `Message`, with its relations, substructures, and actions through the
 * client.
 *
 * @remarks
 * What discord.js reads synchronously from its cache is read the same way here with a synchronous cache: `guild`,
 * `channel`, and the `editable`, `deletable`, ... permission checks, which apply the channel's overwrites. With an
 * asynchronous cache the relation getters are `null` (use `fetchChannel()`, `fetchGuild()`, `fetchReference()`), and
 * the checks answer a promise read from the cache, typed as one once `GatewayCacheConfig` declares the cache
 * asynchronous. The `fetch*able()` twins also ask the API for what is not cached.
 */
export class Message<InGuild extends boolean = boolean> extends BaseMessage<""> {
  /**
   * Keeps the raw `timestamp` and `edited_timestamp`, which `@discordjs/structures` strips and re-serializes in its own
   * format, so that {@link Message.toJSON} returns the message as received.
   */
  public static override DataTemplate: Partial<APIMessage> = {};

  protected override optimizeData(data: Partial<CacheEntityTypes["messages"]>): void {
    super.optimizeData(data);
    this.optimizeTimestamp("edited_timestamp", data.edited_timestamp);
  }

  /**
   * @param data The raw message.
   * @param relations The author, member, guild, and channel as resolved from the cache, by `client.messages`.
   */
  public constructor(data: CacheEntityTypes["messages"], relations: MessageRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public [kPatch](data: Readonly<Partial<CacheEntityTypes["messages"]>>): this {
    // A payload carrying the author is fresher than the one resolved when the message was built.
    if (data.author) this.dropRelations("author", "member");
    else if (data.member) this.dropRelations("member");
    if (data.content !== undefined || data.mentions || data.mention_roles) {
      this.dropRelations("mentions");
    }

    if (data.reactions || data.poll) this.dropRelations("emojis");
    if ("thread" in data) this.dropRelations("thread");
    return StructureMixin.prototype[kPatch].call(this, data) as this;
  }

  public get guildId(): If<InGuild, string> {
    return (this[kData].guild_id ?? null) as If<InGuild, string>;
  }

  /**
   * Whether the message was sent by Discord, e.g. a member join or a pin notice.
   */
  public get system(): boolean {
    return !NonSystemTypes.includes(this.type);
  }

  /**
   * The author. Resolved from `client.users` when the message comes from a manager, so it has the latest known data of
   * the user, not only the copy embedded in the message.
   */
  public get author(): User {
    // Only a partial message lacks its author: it gets an empty user rather than a crash.
    return this[kRelations].author ?? new User(this[kData].author ?? ({} as never));
  }

  /**
   * The author as a guild member, or `null` for messages sent outside of a guild or by a webhook.
   */
  public get member(): GuildMember | null {
    const { member: resolved } = this[kRelations];
    if (resolved !== undefined) return resolved;
    const { member, guild_id: guildId, author } = this[kData];
    return member && guildId
      ? new GuildMember({ ...member, user: author, guild_id: guildId })
      : null;
  }

  /**
   * The guild the message was sent in, from the cache. `null` outside of guilds, when the guild is not cached, or when
   * the cache is asynchronous: use {@link Message.fetchGuild} to always get it.
   */
  public get guild(): If<InGuild, Guild | null, null> {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id)) as If<
      InGuild,
      Guild | null,
      null
    >;
  }

  /**
   * The channel the message was sent in, from the cache. `null` when the channel is not cached, or when the cache is
   * asynchronous: use {@link Message.fetchChannel} to always get it.
   */
  public get channel(): If<InGuild, GuildTextBasedChannel, TextBasedChannel> | null {
    return this.lazyRelation("channel", (client) =>
      cachedChannel(client, this[kData].channel_id),
    ) as If<InGuild, GuildTextBasedChannel, TextBasedChannel> | null;
  }

  public override get flags(): Readonly<MessageFlagsBitField> {
    return new MessageFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  /**
   * The attachments of the message, by ID, like discord.js's `Message#attachments`.
   */
  public get attachments(): Collection<string, Attachment> {
    return new Collection(
      (this[kData].attachments ?? []).map((attachment) => [
        attachment.id,
        new Attachment(attachment),
      ]),
    );
  }

  public get embeds(): Embed[] {
    return (this[kData].embeds ?? []).map((embed) => new Embed(embed));
  }

  /**
   * The top-level components of the message, like discord.js'. Their `toJSON` returns the raw components; build new
   * ones with `@discordjs/builders`.
   */
  public get components(): MessageTopLevelComponent[] {
    return (this[kData].components ?? []).map((component) => createComponent(component));
  }

  /**
   * The stickers of the message, by ID, like discord.js's `Message#stickers`: partial stickers carrying the ID, name,
   * and format of the payload's sticker items. Fetch a full one with `client.fetchSticker(id)`.
   */
  public get stickers(): Collection<string, Sticker> {
    const client = this[kClient];
    return new Collection(
      (this[kData].sticker_items ?? []).map((item) => {
        const sticker = new Sticker(item as never);
        return [item.id, client ? bindClient(sticker, client) : sticker];
      }),
    );
  }

  /**
   * The users, members, roles, and channels the message mentions: their cached copies when the message was built by
   * `client.messages`, like discord.js.
   */
  public get mentions(): MessageMentions<InGuild> {
    return new MessageMentions<InGuild>(this[kData], {
      guild: this.guild,
      ...this[kRelations].mentions,
    });
  }

  /**
   * The reactions of the message, whose `message` is this one, and whose custom emojis are the cached ones.
   */
  public get reactions(): ReactionManager {
    return new ReactionManager(
      this.client,
      this.channelId,
      this.id,
      this[kData].reactions ?? [],
      this,
      this[kRelations].emojis,
    );
  }

  /**
   * The poll of the message, whose `message` is this one.
   */
  public get poll(): Poll | null {
    const { poll } = this[kData];
    if (!poll) return null;
    return bindClient(
      new Poll(
        { ...poll, channel_id: this.channelId, message_id: this.id },
        { message: this, channel: this.channel, emojis: this[kRelations].emojis },
      ),
      this.client,
    );
  }

  /**
   * The reference of a reply, crosspost, forward, or pin notice, if any, camel-cased like discord.js's
   * `Message#reference`.
   */
  public get reference(): MessageReference | null {
    const reference = this[kData].message_reference;
    return reference ? transformAPIMessageReference(reference) : null;
  }

  /**
   * The snapshots of the messages this one forwards, as a collection of messages carrying the IDs of the forwarded
   * message, by that ID, like discord.js's `Message#messageSnapshots`.
   */
  public get messageSnapshots(): Collection<string, MessageSnapshot> {
    const collection = new Collection<string, MessageSnapshot>();
    const snapshots = this[kData].message_snapshots;
    if (!snapshots?.length) return collection;
    const reference = this[kData].message_reference;
    const client = this[kClient];
    for (const snapshot of snapshots) {
      const message = new Message({
        ...snapshot.message,
        id: reference?.message_id ?? this.id,
        channel_id: reference?.channel_id ?? this.channelId,
        guild_id: reference?.guild_id,
      } as CacheEntityTypes["messages"]);
      collection.set(
        message.id,
        (client ? bindClient(message, client) : message) as unknown as MessageSnapshot,
      );
    }

    return collection;
  }

  /**
   * The rich presence activity the message was sent with, e.g. a game invite, camel-cased like discord.js's
   * `Message#activity`.
   */
  public get activity(): MessageActivity | null {
    const activity = this[kData].activity;
    return activity ? transformAPIMessageActivity(activity) : null;
  }

  /**
   * The metadata of the interaction the message answers, if any, camel-cased like discord.js's
   * `Message#interactionMetadata`.
   */
  public get interactionMetadata(): MessageInteractionMetadata | null {
    const metadata = this[kData].interaction_metadata;
    return metadata ? transformAPIMessageInteractionMetadata(metadata, this[kClient]) : null;
  }

  /**
   * The call a call message is about, camel-cased like discord.js's `Message#call`.
   */
  public get call(): MessageCall | null {
    const call = this[kData].call;
    return call ? transformAPIMessageCall(call) : null;
  }

  /**
   * The subscription a role subscription purchase message is about, camel-cased like discord.js's
   * `Message#roleSubscriptionData`.
   */
  public get roleSubscriptionData(): RoleSubscriptionData | null {
    const data = this[kData].role_subscription_data;
    return data ? transformAPIRoleSubscriptionData(data) : null;
  }

  /**
   * The custom client theme the message was shared with, camel-cased like discord.js's `Message#sharedClientTheme`.
   */
  public get sharedClientTheme(): SharedClientTheme | null {
    const theme = this[kData].shared_client_theme;
    return theme ? transformAPIMessageSharedClientTheme(theme) : null;
  }

  /**
   * Whether a thread was started from the message.
   */
  public get hasThread(): boolean {
    return this.flags.has(MessageFlags.HasThread);
  }

  /**
   * The thread started from the message, like discord.js's `Message#thread`: the cached thread (its ID is the
   * message's), else the one of the payload.
   */
  public get thread(): AnyThreadChannel | null {
    const resolved = this[kRelations].thread;
    if (resolved) return resolved;
    const { thread } = this[kData] as APIMessage & { thread?: APIThreadChannel };
    return thread ? this.client.threads.cache.construct(thread) : null;
  }

  /**
   * The content with user, role, and channel mentions replaced by names, and `@everyone`/`@here` defused, like
   * discord.js's `Message#cleanContent`. Mentions of entities that are not cached are kept.
   */
  public get cleanContent(): string {
    const { mentions } = this;
    const members = new Map(
      mentions.members.map((member) => [member.id, member.displayName] as const),
    );
    const users = new Map(
      [...mentions.users, ...mentions.parsedUsers.values()].map(
        (user) => [user.id, user.displayName] as const,
      ),
    );
    const { roles, channels } = mentions;
    return this.content
      .replaceAll(MessageMentions.UsersPattern, (match, id: string) => {
        const name = members.get(id) ?? users.get(id);
        return name ? `@${name}` : match;
      })
      .replaceAll(MessageMentions.RolesPattern, (match, id: string) => {
        const role = roles.get(id);
        return role ? `@${role.name}` : match;
      })
      .replaceAll(MessageMentions.ChannelsPattern, (match, id: string) => {
        const channel = channels.get(id) as { name?: string | null } | undefined;
        return channel?.name ? `#${channel.name}` : match;
      })
      .replaceAll(/@(everyone|here)/g, `@${ZeroWidthSpace}$1`);
  }

  public override get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * When the message was last edited, `null` if it never was.
   */
  public override get editedTimestamp(): number | null {
    return this.optimizedTimestamp("edited_timestamp");
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
  public inGuild(): this is Message<true> {
    return this.guildId !== null;
  }

  /**
   * Fetches the channel the message was sent in.
   */
  public fetchChannel(): Promise<AnyChannel> {
    return this.client.channels.fetch(this.channelId);
  }

  /**
   * Fetches the guild the message was sent in, `null` outside of guilds.
   */
  public async fetchGuild(): Promise<Guild | null> {
    const { guildId } = this;
    return guildId ? this.client.guilds.fetch(guildId) : null;
  }

  /**
   * Fetches the message this one replies to, crossposts, or forwards.
   */
  public async fetchReference(): Promise<OmitPartialGroupDMChannel<Message<InGuild>>> {
    const reference = this.reference;
    if (!reference?.messageId) throw new GatewayError("MessageReferenceMissing", this.id);
    return (await this.client.messages.fetch(
      reference.channelId ?? this.channelId,
      reference.messageId,
    )) as unknown as OmitPartialGroupDMChannel<Message<InGuild>>;
  }

  /**
   * Whether the bot can edit the message, like discord.js's `Message#editable`: it is the author.
   */
  public get editable(): boolean {
    const client = this.client;
    return this.author.id === (client.user?.id ?? client.id);
  }

  /**
   * Whether the bot can delete the message, like discord.js's `Message#deletable`: it is the author, or it has
   * `ManageMessages` in the channel.
   *
   * @throws A `GatewayError` when the permissions are needed: `GuildUncachedMe`, `GuildUncached` or `ChannelUncached` on a cache miss.
   */
  public get deletable(): CacheRead<boolean> {
    return cacheRead(this.editable || this.hasCachedPermission("ManageMessages"));
  }

  /**
   * Whether the bot can bulk delete the message, like discord.js's `Message#bulkDeletable`: it is newer than 14 days,
   * and the bot has `ManageMessages`. It throws like {@link Message.deletable}.
   */
  public get bulkDeletable(): CacheRead<boolean> {
    return cacheRead(
      Date.now() - this.createdTimestamp < 14 * 24 * 60 * 60 * 1000 &&
        this.hasCachedPermission("ManageMessages"),
    );
  }

  /**
   * Whether the bot can pin the message, like discord.js's `Message#pinnable`: it is not a system message, and the
   * bot has `PinMessages`. It throws like {@link Message.deletable}.
   */
  public get pinnable(): CacheRead<boolean> {
    if (this.system) return cacheRead(false);
    return cacheRead(!this.inGuild() || this.hasCachedPermission("PinMessages"));
  }

  /**
   * Whether the bot can publish the message, like discord.js's `Message#crosspostable`: it is in an announcement
   * channel, not crossposted yet, and the bot authored it or has `ManageMessages`. It throws like
   * {@link Message.deletable}.
   */
  public get crosspostable(): CacheRead<boolean> {
    if (this.flags.has(MessageFlags.Crossposted) || this.system || !this.inGuild()) {
      return cacheRead(false);
    }

    // Not the `channel` getter, which is `null` with an asynchronous cache.
    const cached =
      this[kRelations].channel ?? peekCache(this.client.channels.cache, this.channelId);
    return cacheRead(
      whenAll([cached], ([channel]) => {
        if (!channel) throw new GatewayError("ChannelUncached", this.channelId);
        if (channel.type !== ChannelType.GuildAnnouncement) return false;
        return this.editable || this.hasCachedPermission("ManageMessages");
      }),
    );
  }

  /**
   * Whether the bot can delete the message: it is the author, or it has `ManageMessages` in the guild.
   *
   * @deprecated Use {@link Message.deletable}. When the guild, the channel or the bot's member may be missing from the
   * cache (a filtered cache, a `plugin-broker` worker), fetch them first (`client.members.fetchMe(guildId)`), then read
   * the getter.
   */
  public async fetchDeletable(): Promise<boolean> {
    return this.editable || this.hasPermission("ManageMessages");
  }

  /**
   * Whether the bot can bulk delete the message: it can delete it, and it is newer than 14 days.
   *
   * @deprecated Use {@link Message.bulkDeletable}. See {@link Message.fetchDeletable} for the cache-miss fallback.
   */
  public async fetchBulkDeletable(): Promise<boolean> {
    return (
      Date.now() - this.createdTimestamp < 14 * 24 * 60 * 60 * 1000 &&
      (await this.hasPermission("ManageMessages"))
    );
  }

  /**
   * Whether the bot can pin the message: it is not a system message, and the bot has `PinMessages`.
   *
   * @deprecated Use {@link Message.pinnable}. See {@link Message.fetchDeletable} for the cache-miss fallback.
   */
  public async fetchPinnable(): Promise<boolean> {
    if (this.system) return false;
    return !this.inGuild() || this.hasPermission("PinMessages");
  }

  /**
   * Whether the bot can publish the message: it is in an announcement channel, not crossposted yet, and the bot
   * authored it or has `ManageMessages`.
   *
   * @deprecated Use {@link Message.crosspostable}. See {@link Message.fetchDeletable} for the cache-miss fallback.
   */
  public async fetchCrosspostable(): Promise<boolean> {
    if (this.flags.has(MessageFlags.Crossposted) || this.system || !this.inGuild()) return false;
    const channel = await this.fetchChannel();
    if (channel.type !== ChannelType.GuildAnnouncement) return false;
    return this.editable || this.hasPermission("ManageMessages");
  }

  /**
   * Whether the message is partial, like discord.js's `Message#partial`: it lacks its content or its author. That is
   * a message built from its IDs alone for an event about an uncached message (see `Partials.Message`), or from an
   * update that carried neither. Only `id`, `channelId`, and `guildId` are reliable then, and {@link Message.fetch}
   * completes it.
   *
   * Typed `false`, like discord.js: a partial message is a {@link PartialMessage}, whose `partial` is `true`.
   */
  public get partial(): false {
    return (typeof this[kData].content !== "string" || this[kData].author === undefined) as false;
  }

  /**
   * Finds a component of the message by its custom ID, like discord.js's `Message#resolveComponent`.
   *
   * @param customId The custom ID.
   */
  public resolveComponent(customId: string): AnyComponent | APIAnyComponent | null {
    return findComponentByCustomId(this.components, customId);
  }

  /**
   * Fetches the webhook that sent the message, like discord.js's `Message#fetchWebhook`.
   *
   * @throws A `GatewayError`: `WebhookMessage` when a webhook did not send the message, `WebhookApplication` when the
   * webhook belongs to an application.
   */
  public async fetchWebhook(): Promise<Webhook> {
    const { webhookId } = this;
    if (!webhookId) throw new GatewayError("WebhookMessage");
    if (webhookId === this.applicationId) throw new GatewayError("WebhookApplication");
    return this.client.fetchWebhook(webhookId);
  }

  /**
   * Fetches the message and patches this structure with the result.
   *
   * @param force Whether to ask the API even when the message is cached. Defaults to `true`, like discord.js.
   */
  public async fetch(force = true): Promise<OmitPartialGroupDMChannel<this>> {
    const message = await this.client.messages.fetch(this.channelId, this.id, { force });
    return this[kPatch](message.toJSON()) as OmitPartialGroupDMChannel<this>;
  }

  /**
   * Edits the message.
   *
   * @param options The changes, or the new content.
   */
  public async edit(
    options: MessagePayloadResolvable<MessageEditOptions>,
  ): Promise<OmitPartialGroupDMChannel<this>> {
    const message = await this.client.messages.edit(
      this.channelId,
      this.id,
      MessagePayload.create(this, options, { edit: true }),
    );
    return this[kPatch](message.toJSON()) as OmitPartialGroupDMChannel<this>;
  }

  /**
   * Replies to the message.
   *
   * @param options The reply, or its content.
   */
  public reply(
    options: MessagePayloadResolvable<MessageCreateOptions>,
  ): Promise<OmitPartialGroupDMChannel<Message<InGuild>>> {
    const payload = MessagePayload.create(this, options);
    return this.client.messages.send(
      this.channelId,
      MessagePayload.create(this, {
        ...payload.options,
        reply: { messageReference: this },
      }),
    ) as unknown as Promise<OmitPartialGroupDMChannel<Message<InGuild>>>;
  }

  /**
   * Forwards the message to another channel.
   *
   * @param channel The channel to forward it to, or its ID.
   */
  public forward(
    channel: Exclude<TextBasedChannelResolvable, GroupDMChannel>,
  ): Promise<OmitPartialGroupDMChannel<Message<InGuild>>> {
    const channelId = typeof channel === "string" ? channel : channel.id;
    return this.client.messages.forward(this.channelId, this.id, channelId) as unknown as Promise<
      OmitPartialGroupDMChannel<Message<InGuild>>
    >;
  }

  public async delete(reason?: string): Promise<OmitPartialGroupDMChannel<this>> {
    await this.client.messages.delete(this.channelId, this.id, reason);
    return this as OmitPartialGroupDMChannel<this>;
  }

  public async pin(reason?: string): Promise<OmitPartialGroupDMChannel<this>> {
    await this.client.messages.pin(this.channelId, this.id, reason);
    return this[kPatch]({ pinned: true }) as OmitPartialGroupDMChannel<this>;
  }

  public async unpin(reason?: string): Promise<OmitPartialGroupDMChannel<this>> {
    await this.client.messages.unpin(this.channelId, this.id, reason);
    return this[kPatch]({ pinned: false }) as OmitPartialGroupDMChannel<this>;
  }

  /**
   * Reacts to the message as the bot.
   *
   * @param emoji The emoji.
   * @returns The reaction, counting the bot, like discord.js's `Message#react`.
   */
  public async react(emoji: EmojiIdentifierResolvable): Promise<MessageReaction> {
    // Counting the bot adds no custom emoji the cache was not asked for already: the resolved ones stay valid.
    const { emojis } = this[kRelations];
    await this.client.messages.react(this.channelId, this.id, emoji);
    // With a cache of instances the manager already patched this very message: the bot is counted once.
    const current = this[kData].reactions;
    const reactions = withOwnReaction(current, emoji);
    if (reactions !== current) this[kPatch]({ reactions });
    if (emojis && !this[kRelations].emojis) this[kRelations] = { ...this[kRelations], emojis };
    return this.reactions.resolve(emoji)!;
  }

  /**
   * Publishes the message of an announcement channel to the channels following it.
   */
  public async crosspost(): Promise<OmitPartialGroupDMChannel<this>> {
    const message = await this.client.messages.crosspost(this.channelId, this.id);
    return this[kPatch](message.toJSON()) as OmitPartialGroupDMChannel<this>;
  }

  /**
   * Starts a thread from the message.
   *
   * @param options The thread's name and settings.
   */
  public startThread(options: MessageThreadCreateOptions): Promise<AnyThreadChannel> {
    return this.client.messages.startThread(this.channelId, this.id, options);
  }

  /**
   * Hides or shows the embeds of the message.
   *
   * @param suppress Whether to hide them.
   */
  public suppressEmbeds(suppress = true): Promise<OmitPartialGroupDMChannel<this>> {
    const flags = new MessageFlagsBitField(this.flags.bitField);
    if (suppress) flags.add(MessageFlags.SuppressEmbeds);
    else flags.remove(MessageFlags.SuppressEmbeds);
    return this.edit({ flags: Number(flags.bitField) });
  }

  /**
   * Removes every attachment of the message.
   */
  public removeAttachments(): Promise<OmitPartialGroupDMChannel<this>> {
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

  public override toJSON(): CacheEntityTypes["messages"] {
    return BaseStructure.prototype.toJSON.call(this) as CacheEntityTypes["messages"];
  }

  public toString(): string {
    return this.content;
  }

  // `hasPermission` from the cache alone.
  private hasCachedPermission(permission: PermissionsString): Awaitable<boolean> {
    const { guildId } = this;
    if (!guildId) return false;
    return whenAll([requireMe(this.client, guildId)], ([me]) =>
      whenAll([me.permissionsIn(this.channelId)], ([permissions]) => permissions.has(permission)),
    );
  }

  // The bot's permissions in the message's channel, overwrites included.
  private async hasPermission(permission: PermissionsString): Promise<boolean> {
    const { guildId } = this;
    if (!guildId) return false;
    const me = await this.client.members.fetchMe(guildId);
    return (await me.fetchPermissionsIn(this.channelId)).has(permission);
  }
}

Mixin(Message, [StructureMixin]);

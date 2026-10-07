import type { APIGuildMember, APIMessage, APIUser } from "discord-api-types/v10";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { Guild } from "../guilds/Guild.js";
import { GuildMember } from "../guilds/GuildMember.js";
import type { Role } from "../guilds/Role.js";
import { User } from "../users/User.js";
import type { If } from "../../types.js";
import { pickCached as pick } from "../../util/cache.js";
import { transformAPIChannelMention, type CrosspostedChannel } from "../../util/Transformers.js";

/**
 * The mentioned entities, resolved from the cache by `client.messages`, each by ID.
 */
export interface MessageMentionsRelations {
  /**
   * The mentioned users and the ones parsed from the content, and the author of the replied message.
   */
  users?: ReadonlyMap<string, User>;
  members?: ReadonlyMap<string, GuildMember>;
  roles?: ReadonlyMap<string, Role>;
  /**
   * The channels mentioned in the content.
   */
  channels?: ReadonlyMap<string, AnyChannel>;
  guild?: Guild | null;
}

/**
 * The raw fields of a message the mentions are read from.
 */
export type MessageMentionsData = Pick<
  APIMessage,
  "content" | "mention_everyone" | "mention_roles"
> &
  Partial<Pick<APIMessage, "mention_channels" | "referenced_message">> & {
    guild_id?: string;
    /**
     * The mentioned users. In guilds, the gateway attaches each one's partial member.
     */
    mentions: (APIUser & { member?: Omit<APIGuildMember, "user"> })[];
  };

/**
 * The options of {@link MessageMentions.has}.
 */
export interface MentionsHasOptions {
  /**
   * Whether to ignore direct mentions of the user, role, or channel.
   */
  ignoreDirect?: boolean;
  /**
   * Whether to ignore mentions of the member's roles.
   */
  ignoreRoles?: boolean;
  /**
   * Whether to ignore the author of the replied message.
   */
  ignoreRepliedUser?: boolean;
  /**
   * Whether to ignore `@everyone` and `@here`.
   */
  ignoreEveryone?: boolean;
}

/**
 * The users, roles, and channels a message mentions.
 *
 * @remarks
 * Users and members come with the message payload, and are replaced by their cached copies when the message was built
 * by `client.messages`, which also resolves the mentioned roles and channels from the cache, like discord.js.
 */
export class MessageMentions<InGuild extends boolean = boolean> {
  /**
   * Matches `@everyone` and `@here`.
   */
  public static readonly EveryonePattern = /@(?<mention>everyone|here)/;

  /**
   * Matches user mentions, `<@id>` and the legacy `<@!id>`.
   */
  public static readonly UsersPattern = /<@!?(?<id>\d{17,20})>/g;

  /**
   * Matches role mentions, `<@&id>`.
   */
  public static readonly RolesPattern = /<@&(?<id>\d{17,20})>/g;

  /**
   * Matches channel mentions, `<#id>`.
   */
  public static readonly ChannelsPattern = /<#(?<id>\d{17,20})>/g;

  readonly #data: MessageMentionsData;

  readonly #relations: MessageMentionsRelations;

  /**
   * @param data The raw fields of the message.
   * @param relations The mentioned entities, as resolved from the cache.
   */
  public constructor(data: MessageMentionsData, relations: MessageMentionsRelations = {}) {
    this.#data = data;
    this.#relations = relations;
  }

  /**
   * The guild of the message, from the cache, like discord.js's `MessageMentions#guild`.
   */
  public get guild(): If<InGuild, Guild | null, null> {
    return (this.#relations.guild ?? null) as If<InGuild, Guild | null, null>;
  }

  /**
   * The cached roles the message mentions, by ID, like discord.js's `MessageMentions#roles`.
   */
  public get roles(): Map<string, Role> {
    return pick(this.#data.mention_roles, this.#relations.roles);
  }

  /**
   * The cached channels the content mentions, by ID, like discord.js's `MessageMentions#channels`.
   */
  public get channels(): Map<string, AnyChannel> {
    return pick(this.parsedChannelIds, this.#relations.channels);
  }

  /**
   * The cached users the content mentions, by ID, like discord.js's `MessageMentions#parsedUsers`, which also
   * counts the users the message does not ping.
   */
  public get parsedUsers(): Map<string, User> {
    return pick(this.parsedUserIds, this.#relations.users);
  }

  /**
   * Whether the message mentions `@everyone` or `@here`.
   */
  public get everyone(): boolean {
    return this.#data.mention_everyone;
  }

  /**
   * The mentioned users: their cached copies, else the payload's.
   */
  public get users(): User[] {
    const cached = this.#relations.users;
    return this.#data.mentions.map((user) => cached?.get(user.id) ?? new User(user));
  }

  /**
   * The mentioned users as members, for messages sent in a guild.
   */
  public get members(): GuildMember[] {
    const guildId = this.#data.guild_id;
    if (!guildId) return [];

    const cached = this.#relations.members;
    return this.#data.mentions.flatMap(({ member, ...user }) => {
      if (!member) return [];
      return [cached?.get(user.id) ?? new GuildMember({ ...member, user, guild_id: guildId })];
    });
  }

  public get roleIds(): readonly string[] {
    return this.#data.mention_roles;
  }

  /**
   * The IDs of the channels mentioned in the content, and of the crossposted channels.
   */
  public get channelIds(): string[] {
    return [
      ...new Set([
        ...this.crosspostedChannels.map((channel) => channel.channelId),
        ...this.parsedChannelIds,
      ]),
    ];
  }

  /**
   * The IDs of the channels mentioned in the content.
   */
  public get parsedChannelIds(): string[] {
    return MessageMentions.parseIds(this.#data.content, MessageMentions.ChannelsPattern);
  }

  /**
   * The channels a crossposted message mentions, from other guilds, camel-cased like discord.js's
   * `MessageMentions#crosspostedChannels`.
   */
  public get crosspostedChannels(): CrosspostedChannel[] {
    return (this.#data.mention_channels ?? []).map(transformAPIChannelMention);
  }

  /**
   * The author of the message this one replies to, if any.
   */
  public get repliedUser(): User | null {
    const author = this.#data.referenced_message?.author;
    return author ? (this.#relations.users?.get(author.id) ?? new User(author)) : null;
  }

  /**
   * The IDs of the users mentioned in the content, including the ones Discord did not resolve.
   */
  public get parsedUserIds(): string[] {
    return MessageMentions.parseIds(this.#data.content, MessageMentions.UsersPattern);
  }

  /**
   * Lists the unique IDs a mention pattern matches in a content.
   *
   * @param content The content.
   * @param pattern One of the global mention patterns, e.g. {@link MessageMentions.ChannelsPattern}.
   */
  public static parseIds(content: string, pattern: RegExp): string[] {
    return [...new Set([...content.matchAll(pattern)].map((match) => match.groups!.id!))];
  }

  /**
   * Whether the message mentions a user, member, role, or channel.
   *
   * @param target The ID, or a structure with an `id` (and `roleIds` for members).
   * @param options What kinds of mentions to ignore.
   */
  public has(
    target: string | { id: string | null; roleIds?: readonly string[] },
    options: MentionsHasOptions = {},
  ): boolean {
    const id = typeof target === "string" ? target : target.id;
    if (!id) return false;

    if (!options.ignoreEveryone && this.everyone) return true;
    if (!options.ignoreRepliedUser && this.repliedUser?.id === id) return true;

    if (!options.ignoreDirect) {
      if (this.#data.mentions.some((user) => user.id === id)) return true;
      if (this.roleIds.includes(id)) return true;
      if (this.channelIds.includes(id)) return true;
    }

    if (!options.ignoreRoles && typeof target !== "string" && target.roleIds) {
      return target.roleIds.some((roleId) => this.roleIds.includes(roleId));
    }

    return false;
  }
}

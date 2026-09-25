import type { APIChannelMention, APIGuildMember, APIMessage, APIUser } from "discord-api-types/v10";
import { GuildMember } from "./GuildMember.js";
import { User } from "./User.js";

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
 * Users and members come with the message payload. Roles and channels are IDs: resolve them with `client.roles` and
 * `client.channels`, since discord.js's synchronous cache lookups have no equivalent here.
 */
export class MessageMentions {
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

  public constructor(data: MessageMentionsData) {
    this.#data = data;
  }

  /**
   * Whether the message mentions `@everyone` or `@here`.
   */
  public get everyone(): boolean {
    return this.#data.mention_everyone;
  }

  public get users(): User[] {
    return this.#data.mentions.map((user) => new User(user));
  }

  /**
   * The mentioned users as members, for messages sent in a guild.
   */
  public get members(): GuildMember[] {
    const guildId = this.#data.guild_id;
    if (!guildId) return [];

    return this.#data.mentions.flatMap(({ member, ...user }) =>
      member ? [new GuildMember({ ...member, user, guild_id: guildId })] : [],
    );
  }

  public get roleIds(): readonly string[] {
    return this.#data.mention_roles;
  }

  /**
   * The IDs of the channels mentioned in the content, and of the crossposted channels.
   */
  public get channelIds(): string[] {
    const ids = new Set(this.crosspostedChannels.map((channel) => channel.id));
    for (const match of this.#data.content.matchAll(MessageMentions.ChannelsPattern)) {
      ids.add(match.groups!.id!);
    }

    return [...ids];
  }

  /**
   * The channels a crossposted message mentions, from other guilds.
   */
  public get crosspostedChannels(): readonly APIChannelMention[] {
    return this.#data.mention_channels ?? [];
  }

  /**
   * The author of the message this one replies to, if any.
   */
  public get repliedUser(): User | null {
    const author = this.#data.referenced_message?.author;
    return author ? new User(author) : null;
  }

  /**
   * The IDs of the users mentioned in the content, including the ones Discord did not resolve.
   */
  public get parsedUserIds(): string[] {
    return [
      ...new Set(
        [...this.#data.content.matchAll(MessageMentions.UsersPattern)].map(
          (match) => match.groups!.id!,
        ),
      ),
    ];
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

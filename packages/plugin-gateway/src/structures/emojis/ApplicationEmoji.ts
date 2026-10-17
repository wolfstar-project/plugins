import type { APIApplicationEmoji } from "discord-api-types/v10";
import type { ApplicationEmojiEditOptions } from "../../managers/ApplicationEmojiManager.js";
import type { ClientApplication } from "../applications/ClientApplication.js";
import { kData, kPatch, kRelations } from "../Structure.js";
import { User } from "../users/User.js";
import { Emoji } from "./Emoji.js";

/**
 * The relations of an {@link ApplicationEmoji}, resolved from the cache by `client.application.emojis`.
 */
export interface ApplicationEmojiRelations {
  author?: User;
}

/**
 * A custom emoji owned by the application rather than by a guild, usable by the bot everywhere. Like discord.js's
 * `ApplicationEmoji`.
 *
 * @remarks
 * Discord sends no event for application emojis, so they are never cached: `client.application.emojis` fetches them
 * from the API. The payload also carries no `managed`, `requires_colons`, `available` nor `roles`.
 */
export class ApplicationEmoji extends Emoji<APIApplicationEmoji, ApplicationEmojiRelations> {
  /**
   * @param data The raw emoji.
   * @param relations The uploader as resolved from the cache, by `client.application.emojis`.
   */
  public constructor(data: APIApplicationEmoji, relations: ApplicationEmojiRelations = {}) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<APIApplicationEmoji>>): this {
    if (data.user) this.dropRelations("author");
    return super[kPatch](data);
  }

  public override get id(): string {
    return this[kData].id;
  }

  public override get name(): string {
    return this[kData].name;
  }

  /**
   * The application that owns the emoji: the application of the client.
   */
  public get application(): ClientApplication {
    return this.client.application;
  }

  /**
   * The user who uploaded the emoji. The API always sends it for application emojis.
   */
  public get author(): User {
    return this[kRelations].author ?? new User(this[kData].user);
  }

  /**
   * Fetches the user who uploaded the emoji, from the API.
   */
  public fetchAuthor(): Promise<User> {
    return this.client.application.emojis.fetchAuthor(this.id);
  }

  /**
   * Edits the emoji, and patches this structure with the result.
   *
   * @param options The changes to apply.
   * @returns This emoji.
   */
  public async edit(options: ApplicationEmojiEditOptions): Promise<this> {
    const emoji = await this.client.application.emojis.edit(this.id, options);
    return this[kPatch](emoji.toJSON() as APIApplicationEmoji);
  }

  /**
   * Sets the name of the emoji.
   *
   * @param name The new name.
   */
  public setName(name: string): Promise<this> {
    return this.edit({ name });
  }

  /**
   * Deletes the emoji.
   *
   * @returns This emoji.
   */
  public async delete(): Promise<this> {
    await this.client.application.emojis.delete(this.id);
    return this;
  }

  /**
   * Whether this emoji has the same data as another one, like discord.js's `ApplicationEmoji#equals`. Against an
   * application emoji or a raw one, it compares the ID, name, and `animated`: the only fields the API sends, so unlike
   * `GuildEmoji#equals` there is no `managed`, `available`, `requiresColons` nor roles to compare. `false` for
   * anything else, including another kind of emoji.
   *
   * @param other The application emoji, or raw one, to compare with.
   */
  public equals(other: unknown): boolean {
    if (other instanceof ApplicationEmoji) {
      return other.id === this.id && other.name === this.name && other.animated === this.animated;
    }

    if (typeof other !== "object" || other === null || other instanceof Emoji) return false;
    const raw = other as Partial<APIApplicationEmoji>;
    return (
      raw.id === this.id && raw.name === this.name && (raw.animated ?? false) === this.animated
    );
  }
}

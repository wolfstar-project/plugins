import { Collection } from "@discordjs/collection";
import type {
  APIApplicationEmoji,
  RESTPatchAPIApplicationEmojiJSONBody,
  RESTPostAPIApplicationEmojiJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { ApplicationEmoji } from "../structures/emojis/ApplicationEmoji.js";
import { bindClient } from "../structures/Structure.js";
import type { User } from "../structures/users/User.js";
import { resolveImage, type ImageResolvable } from "../util/DataResolver.js";
import { BaseManager } from "./BaseManager.js";

/**
 * An application emoji, or its ID.
 */
export type ApplicationEmojiResolvable = ApplicationEmoji | string;

/**
 * The options to create an application emoji with.
 */
export interface ApplicationEmojiCreateOptions {
  /**
   * The image, up to 256 KiB: a data URI (`data:image/png;base64,...`), its contents, a path, a URL, a stream, or a
   * blob.
   */
  attachment: ImageResolvable;
  name: string;
}

/**
 * The options to edit an application emoji with.
 */
export interface ApplicationEmojiEditOptions {
  name?: string;
}

/**
 * Manages the emojis of the application, `client.application.emojis`. Discord does not send them over the gateway, so
 * they are never cached: every method calls the API.
 */
export class ApplicationEmojiManager extends BaseManager {
  public constructor(client: GatewayClient) {
    super(client);
  }

  /**
   * The ID of the application the emojis belong to.
   */
  public get applicationId(): string {
    return this.client.application.id;
  }

  /**
   * Fetches an emoji of the application, or every one of them.
   *
   * @param emojiId The ID of the emoji, omit it to fetch them all.
   * @returns The emoji, or a `Collection` of every emoji by ID.
   */
  public fetch(): Promise<Collection<string, ApplicationEmoji>>;
  public fetch(emojiId: string): Promise<ApplicationEmoji>;
  public async fetch(
    emojiId?: string,
  ): Promise<ApplicationEmoji | Collection<string, ApplicationEmoji>> {
    if (emojiId !== undefined) {
      return this.hydrate(await this.client.api.applications.getEmoji(this.applicationId, emojiId));
    }

    const { items } = await this.client.api.applications.getEmojis(this.applicationId);
    const emojis = await Promise.all(items.map((emoji) => this.hydrate(emoji)));
    return new Collection(emojis.map((emoji) => [emoji.id, emoji]));
  }

  /**
   * Uploads an emoji.
   *
   * @param options The image and name.
   */
  public async create(options: ApplicationEmojiCreateOptions): Promise<ApplicationEmoji> {
    const body: RESTPostAPIApplicationEmojiJSONBody = {
      image: (await resolveImage(options.attachment))!,
      name: options.name,
    };
    return this.hydrate(await this.client.api.applications.createEmoji(this.applicationId, body));
  }

  /**
   * Edits an emoji.
   *
   * @param emoji The emoji, or its ID.
   * @param options The changes to apply.
   */
  public async edit(
    emoji: ApplicationEmojiResolvable,
    options: ApplicationEmojiEditOptions,
  ): Promise<ApplicationEmoji> {
    const body: RESTPatchAPIApplicationEmojiJSONBody = { name: options.name };
    const edited = await this.client.api.applications.editEmoji(
      this.applicationId,
      resolveEmojiId(emoji),
      body,
    );
    return this.hydrate(edited);
  }

  /**
   * Deletes an emoji.
   *
   * @param emoji The emoji, or its ID.
   */
  public async delete(emoji: ApplicationEmojiResolvable): Promise<void> {
    await this.client.api.applications.deleteEmoji(this.applicationId, resolveEmojiId(emoji));
  }

  /**
   * Fetches the user who uploaded an emoji.
   *
   * @param emoji The emoji, or its ID.
   */
  public async fetchAuthor(emoji: ApplicationEmojiResolvable): Promise<User> {
    const fetched = await this.fetch(resolveEmojiId(emoji));
    return fetched.author;
  }

  /**
   * Builds the structure of a raw emoji, resolving its uploader from the cache.
   *
   * @param data The raw emoji.
   */
  public async hydrate(data: APIApplicationEmoji): Promise<ApplicationEmoji> {
    const author = await this.client.users._resolveData(data.user);
    return bindClient(new ApplicationEmoji(data, { author }), this.client);
  }
}

function resolveEmojiId(emoji: ApplicationEmojiResolvable): string {
  return typeof emoji === "string" ? emoji : emoji.id;
}

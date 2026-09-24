import { soundboardSoundKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APISoundboardSound,
  type RESTGetAPIGuildSoundboardSoundsResult,
  type RESTPatchAPIGuildSoundboardSoundJSONBody,
  type RESTPostAPIGuildSoundboardSoundJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { SoundboardSound } from "../structures/SoundboardSound.js";
import { container } from "../util/container.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

/**
 * The fields of a soundboard sound that can be edited.
 */
export interface SoundboardSoundEditOptions {
  name?: string;
  /**
   * The volume, from 0 to 1.
   */
  volume?: number | null;
  emojiId?: string | null;
  emojiName?: string | null;
  reason?: string;
}

/**
 * The options to upload a soundboard sound with.
 */
export interface SoundboardSoundCreateOptions extends SoundboardSoundEditOptions {
  name: string;
  /**
   * The MP3 or OGG sound, as a data URI.
   */
  sound: string;
}

/**
 * Manages the soundboard sounds of one guild.
 */
export class GuildSoundboardSoundManager extends CachedManager<
  "soundboardSounds",
  SoundboardSound,
  [soundId: string]
> {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "soundboardSounds");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["soundboardSounds"]): SoundboardSound {
    return new SoundboardSound(data);
  }

  public keyOf(data: CacheEntityTypes["soundboardSounds"]): string {
    return this.resolveKey(data.sound_id);
  }

  public resolveKey(soundId: string): string {
    return soundboardSoundKey(this.guildId, soundId);
  }

  /**
   * Adds a sound to the cache, and its uploader to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["soundboardSounds"],
    cache = true,
    options?: AddOptions,
  ): Promise<SoundboardSound> {
    if (data.user) await this.client.users._add(data.user, cache);
    return super._add(data, cache, options);
  }

  public override async hydrate(
    data: CacheEntityTypes["soundboardSounds"],
  ): Promise<SoundboardSound> {
    const [user, guild] = await Promise.all([
      data.user ? this.client.users.resolveData(data.user) : null,
      this.cachedGuild(data.guild_id),
    ]);
    return new SoundboardSound(data, { user, guild });
  }

  /**
   * Fetches every soundboard sound of the guild, and caches them.
   */
  public async fetchAll(): Promise<SoundboardSound[]> {
    const { items } = (await container.rest.get(
      Routes.guildSoundboardSounds(this.guildId),
    )) as RESTGetAPIGuildSoundboardSoundsResult;
    return Promise.all(items.map((sound) => this._add(this.withGuildId(sound))));
  }

  /**
   * Uploads a soundboard sound.
   *
   * @param options The sound file, its name, volume, and emoji.
   */
  public async create(options: SoundboardSoundCreateOptions): Promise<SoundboardSound> {
    const body: RESTPostAPIGuildSoundboardSoundJSONBody = {
      ...toSoundBody(options),
      name: options.name,
      sound: options.sound,
    };
    const sound = (await container.rest.post(Routes.guildSoundboardSounds(this.guildId), {
      body,
      reason: options.reason,
    })) as APISoundboardSound;
    return this._add(this.withGuildId(sound));
  }

  /**
   * Edits a soundboard sound.
   *
   * @param soundId The ID of the sound.
   * @param options The fields to edit, and the reason for the audit log.
   */
  public async edit(
    soundId: string,
    options: SoundboardSoundEditOptions,
  ): Promise<SoundboardSound> {
    const sound = (await container.rest.patch(Routes.guildSoundboardSound(this.guildId, soundId), {
      body: toSoundBody(options),
      reason: options.reason,
    })) as APISoundboardSound;
    return this._add(this.withGuildId(sound));
  }

  /**
   * Deletes a soundboard sound.
   *
   * @param soundId The ID of the sound.
   * @param reason The reason for the audit log.
   */
  public async delete(soundId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildSoundboardSound(this.guildId, soundId), { reason });
    await this.cache?.delete(this.resolveKey(soundId));
  }

  protected async fetchRaw(soundId: string) {
    const sound = (await container.rest.get(
      Routes.guildSoundboardSound(this.guildId, soundId),
    )) as APISoundboardSound;
    return this.withGuildId(sound);
  }

  private withGuildId(sound: APISoundboardSound): APISoundboardSound {
    return { ...sound, guild_id: sound.guild_id ?? this.guildId };
  }
}

function toSoundBody(
  options: SoundboardSoundEditOptions,
): RESTPatchAPIGuildSoundboardSoundJSONBody {
  const body: RESTPatchAPIGuildSoundboardSoundJSONBody = {
    name: options.name,
    volume: options.volume,
    emoji_id: options.emojiId,
    emoji_name: options.emojiName,
  };
  for (const key of Object.keys(body) as (keyof typeof body)[]) {
    if (body[key] === undefined) delete body[key];
  }

  return body;
}

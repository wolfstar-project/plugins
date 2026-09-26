import type { APISoundboardSound } from "discord-api-types/v10";
import type { SoundboardSoundEditOptions } from "../managers/GuildSoundboardSoundManager.js";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { kData, kPatch, kRelations, snowflakeTimestamp, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * The relations of a {@link SoundboardSound}, resolved from the cache by the guild's soundboard manager.
 */
export interface SoundboardSoundRelations {
  user?: User | null;
  guild?: Guild | null;
}

/**
 * A soundboard sound: one of Discord's defaults, or a guild's.
 */
export class SoundboardSound extends Structure<APISoundboardSound> {
  declare public [kRelations]: SoundboardSoundRelations;

  /**
   * @param data The raw sound.
   * @param relations The uploader and guild as resolved from the cache, by the guild's soundboard manager.
   */
  public constructor(data: APISoundboardSound, relations: SoundboardSoundRelations = {}) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<APISoundboardSound>>): this {
    if (data.user) this.dropRelations("user");
    return super[kPatch](data);
  }

  /**
   * The ID of the sound. Default sounds have small numeric IDs rather than snowflakes.
   */
  public get soundId() {
    return this[kData].sound_id;
  }

  public get name() {
    return this[kData].name;
  }

  /**
   * The volume, from 0 to 1.
   */
  public get volume() {
    return this[kData].volume;
  }

  public get emojiId(): string | null {
    return this[kData].emoji_id;
  }

  public get emojiName(): string | null {
    return this[kData].emoji_name;
  }

  /**
   * The ID of the guild, `null` for a default sound.
   */
  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  /**
   * Whether the sound can be played; guild sounds can become unavailable when the guild loses boosts.
   */
  public get available() {
    return this[kData].available;
  }

  /**
   * The user who uploaded a guild sound, when the payload includes it.
   */
  public get user(): User | null {
    const { user } = this[kData];
    return this[kRelations].user ?? (user ? new User(user) : null);
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * The URL of the sound file.
   */
  public get url(): string {
    return cdn.soundboardSound(this.soundId);
  }

  /**
   * When a guild sound was created. Default sounds have no snowflake, so theirs is `null`.
   */
  public get createdTimestamp(): number | null {
    return this.guildId ? snowflakeTimestamp(this.soundId) : null;
  }

  public edit(options: SoundboardSoundEditOptions): Promise<this> {
    return this.withGuild(async (guildId) => {
      const sound = await getGatewayClient()
        .guilds.soundboardSounds(guildId)
        .edit(this.soundId, options);
      return this[kPatch](sound.toJSON());
    });
  }

  public delete(reason?: string): Promise<this> {
    return this.withGuild(async (guildId) => {
      await getGatewayClient().guilds.soundboardSounds(guildId).delete(this.soundId, reason);
      return this;
    });
  }

  private withGuild(action: (guildId: string) => Promise<this>): Promise<this> {
    const { guildId } = this;
    if (!guildId) return Promise.reject(new Error("Default soundboard sounds cannot be changed"));
    return action(guildId);
  }
}

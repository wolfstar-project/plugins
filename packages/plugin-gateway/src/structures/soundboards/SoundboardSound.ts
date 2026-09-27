import { SoundboardSound as BaseSoundboardSound } from "@discordjs/structures";
import type { APISoundboardSound } from "discord-api-types/v10";
import type { SoundboardSoundEditOptions } from "../../managers/GuildSoundboardSoundManager.js";
import { cdn } from "../../util/cdn.js";
import { getGatewayClient } from "../../util/container.js";
import type { Guild } from "../guilds/Guild.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, kPatch, kRelations, StructureMixin } from "../Structure.js";
import { User } from "../users/User.js";

/**
 * The relations of a {@link SoundboardSound}, resolved from the cache by the guild's soundboard manager.
 */
export interface SoundboardSoundRelations {
  user?: User | null;
  guild?: Guild | null;
}

export interface SoundboardSound extends StructureMixin<
  APISoundboardSound,
  SoundboardSoundRelations
> {}

/**
 * A soundboard sound, one of Discord's defaults or a guild's: `@discordjs/structures`' `SoundboardSound`, with its
 * uploader, guild, and URL, and actions through the client.
 */
export class SoundboardSound extends BaseSoundboardSound {
  /**
   * @param data The raw sound.
   * @param relations The uploader and guild as resolved from the cache, by the guild's soundboard manager.
   */
  public constructor(data: APISoundboardSound, relations: SoundboardSoundRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public [kPatch](data: Readonly<Partial<APISoundboardSound>>): this {
    if (data.user) this.dropRelations("user");
    return StructureMixin.prototype[kPatch].call(this, data) as this;
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

Mixin(SoundboardSound, [StructureMixin]);

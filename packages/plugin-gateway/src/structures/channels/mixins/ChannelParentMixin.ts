import type { ChannelType } from "discord-api-types/v10";
import type { AnyChannel } from "../../../managers/ChannelManager.js";
import type { Channel } from "../Channel.js";
import { kData, kRelations } from "../../Structure.js";

type Data = { parent_id?: string | null; nsfw?: boolean };

export interface ChannelParentMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the parent (a category, or a channel for threads) and the age restriction of guild channels.
 */
export class ChannelParentMixin<Type extends ChannelType = ChannelType> {
  public get parentId(): string | null {
    return (this[kData] as Data).parent_id ?? null;
  }

  /**
   * The parent of the channel, from the cache, like discord.js's `parent`: the category of a guild channel, or the
   * channel a thread belongs to. `null` when it has none, when it is not cached, or when the channel was not built by
   * a manager.
   */
  public get parent(): AnyChannel | null {
    return this[kRelations].parent ?? null;
  }

  public get nsfw(): boolean {
    return (this[kData] as Data).nsfw ?? false;
  }
}

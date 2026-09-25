import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { parent_id?: string | null; nsfw?: boolean };

export interface ChannelParentMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the parent (a category, or a channel for threads) and the age restriction of guild channels.
 */
export class ChannelParentMixin<Type extends ChannelType = ChannelType> {
  public get parentId(): string | null {
    return (this[kData] as Data).parent_id ?? null;
  }

  public get nsfw(): boolean {
    return (this[kData] as Data).nsfw ?? false;
  }
}

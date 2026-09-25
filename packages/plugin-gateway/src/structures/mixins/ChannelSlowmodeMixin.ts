import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { rate_limit_per_user?: number };

export interface ChannelSlowmodeMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the slowmode of channels users can send messages in.
 */
export class ChannelSlowmodeMixin<Type extends ChannelType = ChannelType> {
  /**
   * The slowmode, in seconds. `0` when disabled.
   */
  public get rateLimitPerUser(): number {
    return (this[kData] as Data).rate_limit_per_user ?? 0;
  }
}

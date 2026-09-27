import type { ChannelType } from "discord-api-types/v10";
import { Channel } from "./Channel.js";

/**
 * A channel of a type no other structure covers yet.
 */
export class BaseChannel extends Channel<ChannelType> {}

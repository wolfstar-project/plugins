import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import type { ImageURLOptions } from "@discordjs/rest";
import { cdn } from "../../util/cdn.js";

type Data = { name?: string | null; icon?: string | null; application_id?: string };

export interface GroupDMMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields of group direct messages.
 */
export class GroupDMMixin<Type extends ChannelType = ChannelType> {
  public get name(): string | null {
    return (this[kData] as Data).name ?? null;
  }

  public get icon(): string | null {
    return (this[kData] as Data).icon ?? null;
  }

  /**
   * The ID of the application that created the group, if any.
   */
  public get applicationId(): string | null {
    return (this[kData] as Data).application_id ?? null;
  }

  /**
   * Gets the URL of the group's icon, or `null` if it has none.
   * @param options The image options.
   */
  public iconURL(options?: ImageURLOptions): string | null {
    const { icon } = this[kData] as Data;
    return icon ? cdn.channelIcon(this.id, icon, options) : null;
  }
}

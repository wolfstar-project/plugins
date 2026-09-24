import type { GuildChannelEditOptions } from "../../util/channels.js";
import { getGatewayClient } from "../../util/container.js";
import type { Channel } from "../Channel.js";
import { kPatch } from "../Structure.js";

/**
 * Edits a channel through `client.channels` and patches the structure with the result. Shared by the mixins' setters.
 *
 * @param channel The channel structure.
 * @param options The fields to edit.
 */
export async function editChannel<Value extends Channel>(
  channel: Value,
  options: GuildChannelEditOptions,
): Promise<Value> {
  const edited = await getGatewayClient().channels.edit(channel.id, options);
  return channel[kPatch](edited.toJSON() as never);
}

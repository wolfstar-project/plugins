import type { GuildChannelEditOptions } from "../../../util/channels.js";
import { kPatch, type StructureMixin } from "../../Structure.js";

/**
 * Edits a channel through `client.channels` and patches the structure with the result. Shared by the mixins' setters.
 *
 * @param channel The channel structure.
 * @param options The fields to edit.
 */
export async function editChannel<Value extends StructureMixin<object> & { id: string }>(
  channel: Value,
  options: GuildChannelEditOptions,
): Promise<Value> {
  const edited = await channel.client.channels.edit(channel.id, options);
  return channel[kPatch](edited.toJSON() as never);
}

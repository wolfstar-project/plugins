import type { Collection } from "@discordjs/collection";
import type {
  AnnouncementChannel,
  DMChannel,
  GroupDMChannel,
  Message,
  PartialMessage,
  TextChannel,
} from "../../src/index.js";

declare const channel: TextChannel;
declare const announcement: AnnouncementChannel;
declare const dm: DMChannel;
declare const groupDm: GroupDMChannel;
declare const message: Message;
declare const messages: Collection<string, Message>;

// Like discord.js: messages, IDs, a Collection, or a count, resolving to the deleted messages by ID.
const byCount: Promise<Collection<string, Message | PartialMessage | undefined>> =
  channel.bulkDelete(10, true);
void channel.bulkDelete([message, "1"]);
void channel.bulkDelete(messages);
void announcement.bulkDelete(5);

// Text-based channels outside of a guild have no `bulkDelete`.
// @ts-expect-error direct messages can not bulk delete
void dm.bulkDelete(1);
// @ts-expect-error group direct messages can not bulk delete
void groupDm.bulkDelete(1);

// A partial message narrows from the union with `partial`.
declare const deleted: Message | PartialMessage | undefined;
if (deleted?.partial) {
  const partial: PartialMessage = deleted;
  void partial;
}

// Anything else is rejected.
// @ts-expect-error a string is not a MessageResolvable[]
void channel.bulkDelete("1");

void byCount;

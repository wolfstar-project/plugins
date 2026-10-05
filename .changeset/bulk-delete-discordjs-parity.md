---
"@wolfstar/plugin-gateway": minor
---

Make `bulkDelete` match discord.js's `TextBasedChannel#bulkDelete`. It accepts messages, message IDs, a `Collection` of messages, or a count, throws a `TypeError` (`MessageBulkDeleteType`) for anything else, and resolves to a `Collection<string, Message | PartialMessage | undefined>` of the deleted messages by ID: the cached message, else a partial one with `Partials.Message`, else `undefined`. This applies to `MessageManager#bulkDelete`, `ChannelMessageManager#bulkDelete` and the channels' `bulkDelete`. Add the `PartialMessage` type.

`bulkDelete` moves to the new `TextGuildChannelMixin`, applied to guild text, announcement, voice, stage and thread channels. `DMChannel` and `GroupDMChannel` no longer have it, as in discord.js: Discord refuses it there.

Breaking, under 0.x: `bulkDelete` resolved to the deleted IDs (`string[]`), and now resolves to a `Collection` keyed by them. Use `[...deleted.keys()]` for the IDs.

---
"@wolfstar/plugin-gateway": minor
---

`transformResolved` now also resolves `messages` (IDs read from the cache of the new `channelId` option, raw data resolved to the cached message or built from it) and `attachments` (built as `Attachment`), like discord.js. `MessageMentions#parsedUsers` now includes the users the payload mentions even when they are not cached, as discord.js does by adding them to its cache; nothing is written to the cache.

---
"@wolfstar/plugin-gateway": minor
---

Add `Message#threadable`, like discord.js: whether the bot can start a thread from the message (a text or announcement channel, no thread yet, and `ViewChannel` plus `CreatePublicThreads`). It reads the cache, so it is a promise with an asynchronous cache and throws `ChannelUncached`, `GuildUncachedMe` or `GuildUncached` on a miss, like the other message checks. Unlike discord.js, an administrator bot is threadable, as the API allows it.

---
"@wolfstar/plugin-gateway": minor
---

Add small manager methods of discord.js to `@wolfstar/plugin-gateway`: `DataManager#valueOf()` (the manager's cache), `GuildEmojiManager#resolveIdentifier()`, `GuildManager#widgetImageURL(guild, style?)` and `GuildChannelManager#channelCountWithoutThreads`.

Unlike discord.js, `resolveIdentifier` throws for a value it cannot resolve instead of returning `null` (an uncached emoji ID still answers `null`), and `channelCountWithoutThreads` throws `CacheNotIterable` when the channel store cannot enumerate its entries.

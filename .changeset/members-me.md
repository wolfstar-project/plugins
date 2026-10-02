---
"@wolfstar/plugin-gateway": minor
---

`client.members.me(guildId)`: the bot's own member in a guild, read from the cache alone, like discord.js's `guild.members.me`. It is `null` when the member is not cached, and `Awaitable`: synchronous with the default `CollectionCache`, a promise with an asynchronous store. `fetchMe(guildId)` stays as the variant that falls back to the API.

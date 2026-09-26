---
"@wolfstar/plugin-gateway": minor
---

Request guild members over the gateway (`REQUEST_GUILD_MEMBERS`) with `client.members.request(guildId, options)` or `guild.requestMembers(options)`, discord.js's `guild.members.fetch()`: every member, a `query`, or up to 100 `userIds`, resolving with the `GuildMember`s once the last `GUILD_MEMBERS_CHUNK` of the request's nonce is cached. It rejects with the new `GuildMembersTimeoutError` when the chunks stop arriving, or `GuildMembersRateLimitError` when Discord answers with `RATE_LIMITED`. Every chunk is also emitted as the new `guildMembersChunk` event (`members`, `guild | null`, `data`).

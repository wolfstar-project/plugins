---
"@wolfstar/plugin-gateway": minor
---

Add `Guild#searchMessages(options?)` and `client.guilds.searchMessages(guildId, options?)`, the guild message search of discord.js (`GET /guilds/{guild.id}/messages/search`). The ID options take the usual resolvables, the result holds `Collection`s of `messages`, `threads` and `threadMembers` (by thread, then user) with `totalResults`, `doingDeepHistoricalIndex` and `documentsIndexed`, and the results are cached unless `cache: false`. While Discord indexes the guild the search waits the `retry_after` and retries, or throws `SearchIndexNotYetAvailable` with `retryOnMissingIndex: false`; a `signal` cancels the request and the wait. A query over the documented limits (content, slop, channels, limit, offset) throws a `GatewayRangeError` before the request.

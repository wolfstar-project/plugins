---
"@wolfstar/plugin-gateway": minor
---

Align the managers with the discord.js RFC #11426 (zero caching, complete flexibility):

- Add the `makeCache`, `policies`, and `cacheErrors` options. `makeCache(entity)` creates the store of each entity kind, `null` not to cache it, and is called once per entity kind when the client is constructed; `policies` decide entry by entry what gets cached and for how long, for dispatches and managers alike; `cacheErrors` (`"miss"` by default, or `"throw"`) decides what the managers do when a store fails, always emitting the new `cacheError` event.
- Managers build structures with `construct` (the RFC's `StructureCreator`, `createStructure` is kept as a deprecated alias), write through the store's `upsert`, and `CachedManager` is also exported as `BaseManager`.
- Every feature now works with any subset of entity caches, or none: `GUILD_EMOJIS_UPDATE` and `GUILD_STICKERS_UPDATE` always emit the new `guildEmojisUpdate` / `guildStickersUpdate` events (the granular diff events still need a cache), permission overwrite types and member roles are read from one guild roles request without a roles cache, `presences.fetch` explains presences only come from the gateway, and `thread.joined` is `null` when it cannot be told.

Migration: `thread.joined` is now `boolean | null`; `listCached` throws a `TypeError` for a store that cannot enumerate its entries.

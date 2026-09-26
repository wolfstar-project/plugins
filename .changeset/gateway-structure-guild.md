---
"@wolfstar/plugin-gateway": minor
---

Resolve `guild` from the cache on every guild structure (channels, threads, members, roles, messages, emojis, stickers, invites) and `channel` on messages, like discord.js, with `fetchGuild()` for when the guild is not cached. Structures keep their resolved relations under the exported `kRelations` symbol, and clones keep them.

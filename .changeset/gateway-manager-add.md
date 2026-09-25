---
"@wolfstar/plugin-gateway": minor
---

Add discord.js's `CachedManager#_add` and `DataManager#resolve` to every manager: API payloads are merged into the cached entry, and structures resolve their relations from the cache, so `message.author`, `message.member`, `member.user`, `emoji.author`, `sticker.user`, and `invite.inviter` are the entries of `client.users` and `client.members` rather than the copies embedded in the payload.

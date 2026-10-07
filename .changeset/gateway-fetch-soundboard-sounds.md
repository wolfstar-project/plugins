---
"@wolfstar/plugin-gateway": minor
---

Add `GuildManager#fetchSoundboardSounds(guildIds, options?)` to `@wolfstar/plugin-gateway`, which requests the soundboard sounds of several guilds over the gateway (opcode 31) like discord.js, caches them, and resolves with a `Collection` of each guild's sounds. It sends one request per shard and waits for the `SOUNDBOARD_SOUNDS` reply of every guild, rejecting with the new `GuildSoundboardSoundsTimeoutError` (listing the guilds still missing) when they take longer than `time` (10 seconds by default, restarted by each reply).

The replies carry no nonce, so only the process that sent the request resolves it, and a reply arriving after the timeout is only cached.

---
"@wolfstar/plugin-gateway": minor
---

Add the status and start time of voice channels to `@wolfstar/plugin-gateway`, after discord.js. `VoiceChannel` gets `status`, `voiceStartTimestamp` and `voiceStartAt` (all `null` until Discord sends them) and `setStatus()`. The new `voiceChannelStatusUpdate` and `voiceChannelStartTimeUpdate` events carry the channel before and after, and `client.channels.requestInfo()` (also `guild.requestChannelInfo()`) asks a guild's shard for the info over the gateway, resolving once the `channelInfo` reply is cached or rejecting with a `GuildChannelInfoTimeoutError`.

Requests for one guild run one after the other, because Discord's reply has no nonce, and only the process that sent a request resolves it. A `GUILD_CREATE` resets both fields to `null`.

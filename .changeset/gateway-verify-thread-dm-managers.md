---
"@wolfstar/plugin-gateway": minor
---

Check the options of `threads.create` and the guild-only message paths against discord.js. `ThreadCreateOptions` is now `TextThreadCreateOptions | ForumThreadCreateOptions`, so mixing the options of a thread (`type`, `invitable`) with those of a forum or media post (`message`, `appliedTags`) is a compile error, and throws a `GatewayTypeError` before any request instead of being dropped silently: `ThreadOptionsPostOnly`, `ThreadOptionsThreadOnly`, and, in a forum or media channel without `message`, `ThreadPostMessageRequired`. `ChannelThreadManager` and `ChannelMessageManager` take the channel type as an optional last constructor argument (`channelType`), which `channel.threads` and `channel.messages` pass. In a direct message or group direct message, `messages.crosspost`, `messages.bulkDelete`, and `messages.startThread` now throw `ChannelMessagesGuildOnly` before any request, as discord.js's `DMMessageManager` has no such methods.

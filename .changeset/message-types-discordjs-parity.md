---
"@wolfstar/plugin-gateway": minor
---

Make `Message` match discord.js's typings. `Message<InGuild>` is generic: `guildId`, `guild`, `channel` and `mentions` narrow with it, and `inGuild()` narrows to `Message<true>`. `PartialMessage` is now a `Partialize` of `Message`, with `partial: true` while `Message#partial` is `false`, so `partial` narrows a `Message | PartialMessage`. Add `MessageSnapshot`, `OmitPartialGroupDMChannel`, `GuildTextBasedChannel`, `If` and `Partialize`. `edit`, `delete`, `pin`, `unpin`, `crosspost`, `suppressEmbeds`, `removeAttachments`, `reply` and `forward` resolve to messages that are never from a group DM.

Add `Message#fetch(force)` (answers from the cache with `false`), `Message#sharedClientTheme`, `Message#resolveComponent()` and `Message#fetchWebhook()` (rejects with the `WebhookMessage` and `WebhookApplication` errors). `Message#forward()` now accepts a channel as well as its ID.

Breaking, under 0.x: `PartialMessage` is no longer assignable to `Message`. Narrow with `message.partial` before using one as a `Message`.

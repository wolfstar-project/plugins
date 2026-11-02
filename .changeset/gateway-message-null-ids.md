---
"@wolfstar/plugin-gateway": patch
---

`Message#webhookId`, `applicationId`, `nonce` and `position` are `null` when the message has none, like discord.js, instead of the `undefined` they inherited from `@discordjs/structures`, so a check such as `message.webhookId !== null` no longer takes every message for the one of a webhook.

---
"@wolfstar/plugin-gateway": minor
"@wolfstar/plugin-cache": patch
---

discord.js parity for the structure members that had its names but not its contracts.

**Breaking (`@wolfstar/plugin-gateway`):**

- `Message#react()` resolves to the `MessageReaction` instead of the message, and counts the bot on the message and on its cached entry. `MessageReaction#react()` bumps its counts too.
- `Message#attachments`, `Message#stickers`, `Message#messageSnapshots` and `ReactionManager#cache` are `Collection`s instead of arrays: use `.first()`, `.size`, `.get(id)`. Reactions are keyed by emoji ID, or name for Unicode emojis. The `messageReactionRemoveAll` event carries a `Collection` as well.
- `Message#stickers` holds partial `Sticker` structures instead of raw sticker items (`format_type` → `format`).
- `Message#partial` is `true` when the message lacks its content, not only its author.
- `valueOf()` of a structure is its ID when it has one, so structures compare and sort by ID.

`@wolfstar/plugin-cache`: a `MESSAGE_REACTION_ADD` for the bot's own reaction is no longer counted when the cached reaction already has `me` set.

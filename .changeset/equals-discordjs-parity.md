---
"@wolfstar/plugin-gateway": minor
---

Align `equals()` with discord.js (v14 and v15 share the same comparisons) on every structure that has one.

New: `GuildChannel#equals`, on every guild channel and thread (ID, type, name, topic, position, and permission overwrites in any order; the category is not compared, as in discord.js), and `SoundboardSound#equals`. Both accept the structure or its raw payload.

Changed comparisons:

- `Message#equals(message, rawData?)` compares the ID, author, content, `nonce`, `tts`, the attachments by ID, and the embeds through `Embed#equals`. With `rawData`, it also compares `mention_everyone` and the timestamps. A raw embed update (no author, no attachments) only compares the ID and the number of embeds. `pinned` and the content of attachments are no longer compared.
- `Embed#equals` deep-compares two embeds, and compares a raw embed field by field (author, color, description, footer, image, thumbnail, timestamp as a date, title, URL, video, fields with a missing `inline` as `false`, provider), so `type` and proxy URLs no longer matter there.
- `Guild#equals` compares the ID, `available`, name, icon, splashes, owner, `memberCount`, `large`, verification level, and features in order. The AFK and system channels, content filter, MFA level, banner, description and vanity code are no longer compared.
- `GuildMember#equals` also compares `partial`, banner, `pending`, the avatar decoration and the nameplate, and compares roles in order.
- `Role#equals` compares the three `colors` instead of `color`.
- `User#equals` also compares the avatar decoration SKU, the nameplate and the primary guild.
- `Sticker#equals` also compares the type, pack and sort value against a sticker, and only the ID, description, name and tags against a raw sticker. `GuildEmoji#equals` only compares the ID, name and roles against a raw emoji.

`Guild#equals`, `GuildMember#equals`, `Sticker#equals`, `GuildEmoji#equals`, `GuildChannel#equals` and `SoundboardSound#equals` take `unknown` and return `false` for a foreign argument instead of throwing; `Role#equals`, `User#equals`, `Embed#equals` and `Message#equals` accept `null` and `undefined`.

None of this affects `messageUpdate` or the other update events, which do not rely on `equals`; `emojiUpdate` and `stickerUpdate` still do.

---
"@wolfstar/plugin-gateway": minor
---

Add `AttachmentBuilder` to `@wolfstar/plugin-gateway`, like discord.js: `new AttachmentBuilder(file, { name, description })` with the chainable `setFile`, `setName`, `setDescription`, `setSpoiler`, `setTitle`, `setDuration` and `setWaveform`, the `spoiler` getter, `toJSON()`, and `AttachmentBuilder.from(other)` to copy a builder, a payload or a received `Attachment`. Pass it in the `files` of a message. `Attachment#attachment` now returns the URL of a received attachment, as in discord.js.

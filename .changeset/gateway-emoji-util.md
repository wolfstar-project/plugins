---
"@wolfstar/plugin-gateway": minor
---

Add `parseEmoji` and `resolvePartialEmoji` utilities (discord.js `Util` parity). `ReactionEmoji.resolveIdentifier`, `ReactionEmoji.resolvePartial`, and poll answer emojis now share them, so a bare emoji ID given as a poll answer emoji is sent as an ID instead of a name.

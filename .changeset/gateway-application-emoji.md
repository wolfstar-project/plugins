---
"@wolfstar/plugin-gateway": minor
---

Add `ApplicationEmoji` and `ApplicationEmojiManager`, discord.js's emojis owned by the application rather than a guild, reachable as `client.application.emojis`. The manager is fetch-only (Discord sends no event for these emojis, so nothing is cached): `fetch()` lists them in a `Collection` and `fetch(id)` gets one, with `create`, `edit`, `delete` and `fetchAuthor`. An `ApplicationEmoji` extends `Emoji` with `author`, `application`, `edit`, `setName`, `delete`, `fetchAuthor` and `equals`, which compares only the ID, name and `animated`, the fields the API sends.

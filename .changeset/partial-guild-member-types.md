---
"@wolfstar/plugin-gateway": minor
---

Add the `PartialGuildMember` type and `GuildMember#isPartial()`, a type guard narrowing to it. The `guildMemberUpdate` (old member), `guildMemberRemove` (member) and `typingStart` (`Typing#member`) payloads are now typed as `GuildMember | PartialGuildMember | null`, since they hand out a partial member for an uncached one with `Partials.GuildMember`.

`joinedAt` and `joinedTimestamp` stay `| null` on `GuildMember`: Discord types `joined_at` as nullable on gateway member payloads, so `partial` alone can not narrow them to a date. A listener that passes the old member or the removed member to code expecting a plain `GuildMember` now has to narrow it with `isPartial()` first.

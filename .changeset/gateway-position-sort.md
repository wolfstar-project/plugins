---
"@wolfstar/plugin-gateway": minor
---

Add discord.js `Util` position sorting and `transformResolved`:

- `discordSort` sorts roles and guild channels the way Discord displays them. `RoleManager.fetchAll`/`setPositions` use it.
- `GuildChannelManager.setPosition` and `fetchSorted`: a channel is now moved among the channels of its category and group (text-like, voice, or categories), like discord.js. `GuildChannel#setPosition`'s position is an index among them (or an offset with `relative`), no longer a raw position.
- `RoleManager.setPosition` and `Role#setPosition` move a role among the sorted roles of its guild and accept `{ relative, reason }` (a plain reason string still works). An index out of range leaves the roles where they are.
- `transformResolved` resolves users, members, roles, and channels, by ID from the cache or from raw data, into structures. `client.messages` builds a message's `MessageMentions` with it.

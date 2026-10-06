---
"@wolfstar/plugin-gateway": minor
---

Add `category.children` and `answer.voters` to `@wolfstar/plugin-gateway`, after discord.js. `category.children` is a `CategoryChannelChildManager`: its `cache` lists the cached channels of the category (a promise with an asynchronous cache), `create()` makes a channel inside it, and `resolve()`/`resolveId()` look one up. `answer.voters` is a `PollAnswerVoterManager` whose `fetch()` lists the users who voted for the answer; `fetchVoters()` now goes through it.

Unlike discord.js, `children.cache` is read from the channel store on each access, so a store that cannot enumerate its entries throws `CacheNotIterable`, and `create()` rejects a category as the channel type. `answer.voters` has no `cache`.

---
"@wolfstar/plugin-cache": minor
---

Count reactions and poll votes into the cached message (`MESSAGE_REACTION_*`, `MESSAGE_POLL_VOTE_*`), with an optional `{ clientUserId }` context on `applyGatewayDispatch`/`createCacheOperations` for the `me` and `me_voted` flags, and a new `update` cache operation.

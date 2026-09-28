---
"@wolfstar/plugin-gateway": minor
---

Add discord.js-style errors: every error thrown or emitted by the package is now a `GatewayError`, `GatewayTypeError`, or `GatewayRangeError` carrying a `code` from `GatewayErrorCodes`, with its message in `GatewayErrorMessages`. `DispatchTimeoutError`, `GuildMembersTimeoutError`, `GuildMembersRateLimitError`, and `GatewaySessionStoreError` extend `GatewayError`, so their `name` now includes the code (e.g. `GuildMembersTimeoutError [GuildMembersTimeout]`). Adapted from discord.js (Apache-2.0).

---
"@wolfstar/plugin-gateway": minor
---

Add `client.application` to `@wolfstar/plugin-gateway`, a `ClientApplication` like discord.js's, with the `Application`, `Team` and `TeamMember` structures. It exists from the construction of the client with only the client ID known (`partial`), unlike discord.js where it is `null` until `READY`; `READY` patches the same instance with the application's flags, and `fetch()` (`GET /applications/@me`) with the rest. It also has `edit()`, `fetchRoleConnectionMetadataRecords()` and `editRoleConnectionMetadataRecords()`, and exposes the install params, integration types config, `owner` (a `Team` or a `User`), the event webhooks and the guild and user install counts.

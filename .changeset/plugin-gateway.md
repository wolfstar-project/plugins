---
"@wolfstar/plugin-gateway": minor
---

Add `@wolfstar/plugin-gateway`, implementing the Gateway RFC (#54). `GatewayClient` extends the framework's `Client` with a Discord gateway connection (through `@discordjs/ws`), per-entity managers (`users`, `guilds`, `channels`, `threads`, `messages`, `members`, `roles`) reading from an optional `@wolfstar/plugin-cache` cache, and events carrying structures (`Message`, `User`, `Guild`, ...) instead of raw payloads. Gateway events can be handled from the `listeners` directory with `EventGatewayListener`, optionally through the `RegisterAsGatewayListener` decorator.

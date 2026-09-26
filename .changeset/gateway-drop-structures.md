---
"@wolfstar/plugin-gateway": patch
---

Drop the dependency on a `@discordjs/structures` dev snapshot: the `Structure` base, `BitField`, `PermissionsBitField`, and the flags bitfields it provided are now part of this package, with the same exports. `kData`, `kPatch`, and `kClone` remain the `Symbol.for` symbols `@discordjs/structures` uses. The package now supports Node.js 20 and later (`engines.node` goes from `>=24.17.0` to `>=20.0.0`), matching its dependencies.

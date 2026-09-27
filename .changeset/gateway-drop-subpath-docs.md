---
"@wolfstar/plugin-gateway": patch
---

Remove the README's "Subpath exports" section: `@wolfstar/plugin-gateway/rest` and `@wolfstar/plugin-gateway/ws` were never exported (importing them failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`). Depend on `@discordjs/rest` and `@discordjs/ws` directly instead.

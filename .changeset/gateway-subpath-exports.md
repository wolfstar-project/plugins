---
"@wolfstar/plugin-gateway": patch
---

Export the `@wolfstar/plugin-gateway/rest` and `@wolfstar/plugin-gateway/ws` subpaths documented in the README, re-exporting `@discordjs/rest` and `@discordjs/ws`: importing either failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

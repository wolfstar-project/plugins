---
"@wolfstar/plugin-cache": patch
"@wolfstar/plugin-gateway": patch
"@wolfstar/plugin-sharder": patch
---

Add a `./register` subpath export. The Stars CLI build imports `<name>/register` for every `@wolfstar/plugin-*` dependency of a project, so these packages crashed their consumers at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The entrypoint is a no-op: none of them has an `@wolfstar/http-framework` `Plugin` hook to register.

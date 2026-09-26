---
"@wolfstar/plugin-gateway": patch
"@wolfstar/plugin-cache": patch
"@wolfstar/plugin-sharder": patch
---

Add a `./register` subpath export (a no-op placeholder — none of these packages register any
`@wolfstar/http-framework` `Plugin` lifecycle hooks today).

`@wolfstar/cli`'s Stars build transform injects `import "<name>/register"` for every
`@wolfstar/plugin-*` dependency unconditionally, regardless of whether that package declares the
subpath. Without it, consuming projects crashed at runtime with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

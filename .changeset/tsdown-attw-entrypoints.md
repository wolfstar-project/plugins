---
"@wolfstar/plugin-api": patch
"@wolfstar/plugin-i18next": patch
"@wolfstar/plugin-subcommands-advanced": patch
---

Validate every published subpath export with `are-the-types-wrong`, not just the main entrypoint.

`createTsdownOptions` hardcoded `attw.entrypoints` to `["."]`, so the `./register` export of each
package shipped unchecked. It now accepts an `attwEntrypoints` option, and all packages list their
real entrypoints.

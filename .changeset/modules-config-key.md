---
"@wolfstar/plugin-api": minor
"@wolfstar/plugin-broker": minor
"@wolfstar/plugin-cache": minor
"@wolfstar/plugin-gateway": minor
"@wolfstar/plugin-i18next": minor
"@wolfstar/plugin-logger": minor
"@wolfstar/plugin-scheduled-tasks": minor
"@wolfstar/plugin-sharder": minor
"@wolfstar/plugin-subcommands-advanced": minor
---

Every module sets `meta.configKey`, so an application writes a module's options under its own top-level key of `stars.config` (`api`, `broker`, `cache`, `gateway`, `i18n`, `logger`, `scheduledTasks`, `sharder`, `subcommandsAdvanced`) instead of the `[specifier, options]` tuple of `modules`. The tuple still works and is merged over the key. The key is typed in `defineConfig` once the module is imported in `stars.config.ts`; `cache`, `gateway`, `sharder` and `subcommandsAdvanced` take no options yet and only reserve their name.

The `@wolfstar/kit` peer range moves from `^0.1.0` to `^0.2.0`, the first version that reads `configKey`, and `@wolfstar/schema` (`^0.9.0`) is a new optional peer that carries the `StarsConfig` type the keys extend. A project on `@wolfstar/kit` 0.1 has to update it.

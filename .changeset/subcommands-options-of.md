---
"@wolfstar/plugin-subcommands-advanced": minor
---

Add `Command.OptionsOf` and `Subcommand.OptionsOf`, re-exporting the framework's `Command.OptionsOf` so command classes that import `Command` from this package can type their generated options (`stars codegen`). Requires `@wolfstar/http-framework` 6.2.0 or later for the type.

---
"@wolfstar/plugin-subcommands-advanced": patch
---

A subcommand piece registered with `RegisterAsSubcommand` or `RegisterAsSubcommandGroup` now has its `preconditions` option run before its `chatInputRun`, after those of the parent. A denial emits `chatInputCommandDenied` and the subcommand does not run; before, the option was ignored and the subcommand ran for everybody. Needs `@wolfstar/http-framework` 6.3.0 or later; on an older framework the option does not exist and nothing changes.

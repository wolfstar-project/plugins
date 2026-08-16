---
"@wolfstar/plugin-subcommands-advanced": patch
---

Fix `RegisterAsSubcommand` and `RegisterAsSubcommandGroup` not registering the decorated subcommand piece in `applicationCommandRegistry`, which prevented modular subcommand classes from being recognized as application commands.

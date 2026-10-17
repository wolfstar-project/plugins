---
"@wolfstar/plugin-subcommands-advanced": patch
---

Register modular subcommands (and groups) sorted by name instead of in the order the stores loaded them. The load order is not stable between starts, so the same pieces could produce differently ordered options, and `@wolfstar/http-framework` compares deployed commands by position, which updated every parent with modular subcommands on each start. The first start after upgrading may update those commands once; the order is stable after that. Subcommands the parent declares itself keep their place before the registered ones.

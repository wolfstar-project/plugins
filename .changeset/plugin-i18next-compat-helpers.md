---
"@wolfstar/plugin-i18next": minor
---

feat: export `T`, `FT`, `resolveKey`, `resolveUserKey`, `TypedT` and `TypedFT` again as deprecated compatibility shims with `@wolfstar/http-framework-i18n`'s names and signatures, so a migration only has to rename the module specifier instead of failing at load time with `does not provide an export named 'T'` (#114)

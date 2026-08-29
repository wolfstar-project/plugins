---
"@wolfstar/plugin-i18next": major
---

feat: add `@wolfstar/plugin-i18next`

An internationalization layer for `@wolfstar/http-framework` powered by `i18next` and
`@wolfstar/i18next-backend`, merging `@wolfstar/http-framework-i18n` (HTTP-interaction helpers, typed
`T` / `FT` keys, builder localization) with the plugin architecture of `@sapphire/plugin-i18next`
(`container.i18n`, `InternationalizationHandler`, custom `fetchLanguage`, formatters and HMR).

Register it before creating the client:

```typescript
import "@wolfstar/plugin-i18next/register";
```

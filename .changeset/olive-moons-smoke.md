---
"@wolfstar/plugin-i18next": patch
---

fix(plugin-i18next): honour `defaultName` and register resources added by HMR

Two issues found in review of #50:

`getSupportedLanguageName` and `getSupportedUserLanguageName` returned a hard-coded `'en-US'` when
none of the interaction's locales was loaded, so `InternationalizationOptions.defaultName` was never
consulted. A bot with only `es-ES` loaded and `defaultName: 'es-ES'` made `fetchT` throw
`ReferenceError: Invalid language (en-US)` on any interaction with an unmatched locale. Both helpers
now fall back to `defaultName` when it is a loaded Discord locale, and only then to `'en-US'`.

The HMR watcher subscribed to `change` and `unlink` only, so adding a locale directory or a namespace
file (`addDir` / `add`) triggered no reload, and `reloadResources` never registered anything
discovered after `init`. It now watches additions and deletions of both files and directories, calls
`i18next.loadLanguages` / `loadNamespaces` for what appeared since startup, and keeps
`InternationalizationHandler#languages` and `#namespaces` in sync. Reloads are serialized, since a
single edit can emit several events.

`hmr.options.ignoreInitial` now defaults to `true`, otherwise chokidar replays an `add` per existing
translation file on startup. The watcher is exposed as `I18nextPlugin.watcher` so it can be closed on
shutdown.

# @wolfstar/plugin-i18next

## 1.0.0

### Major Changes

- [#50](https://github.com/wolfstar-project/plugins/pull/50) [`2db769d`](https://github.com/wolfstar-project/plugins/commit/2db769d8ef0d92388cab9c11b6ef96f8be194233) - feat: add `@wolfstar/plugin-i18next`

  An internationalization layer for `@wolfstar/http-framework` powered by `i18next` and
  `@wolfstar/i18next-backend`, merging `@wolfstar/http-framework-i18n` (HTTP-interaction helpers, typed
  `T` / `FT` keys, builder localization) with the plugin architecture of `@sapphire/plugin-i18next`
  (`container.i18n`, `InternationalizationHandler`, custom `fetchLanguage`, formatters and HMR).

  Register it before creating the client:

  ```typescript
  import "@wolfstar/plugin-i18next/register";
  ```

### Minor Changes

- [#53](https://github.com/wolfstar-project/plugins/pull/53) [`6cc8e72`](https://github.com/wolfstar-project/plugins/commit/6cc8e725610c011c61b8ad9210bc845f2e7288cd) - feat(plugin-i18next): accept guild, channel and message targets

  `Target` was `Interaction` only, so the guild, channel and message targets `@sapphire/plugin-i18next`
  supports had no equivalent here — the note in [#50](https://github.com/wolfstar-project/plugins/issues/50) about dropping the `Message` / `Guild` /
  `BaseInteraction` union in favour of raw `APIInteraction` payloads left that gap open.

  `Target` is now `Interaction | MessageTarget | ChannelTarget | GuildTarget`, and every helper
  (`getSupportedLanguageName`, `getSupportedUserLanguageName`, their `…T` variants, `resolveKey`,
  `resolveUserKey`, `fetchLanguage`, `fetchT`, `fetchKey`) accepts all four. `APIGuild`, `APIChannel`
  and `APIMessage` satisfy the matching target structurally, so payloads can be passed straight
  through.

  Since the framework receives raw JSON rather than `discord.js` class instances, the members are told
  apart by shape: an interaction has `locale`, a message has `channel_id`, a channel has `type`, and
  anything left is a guild.

  A guild resolves its language from `preferred_locale`, mirroring `Guild#preferredLocale` in Sapphire.
  Channels and messages carry no locale, so the synchronous helpers fall back to `defaultName` for
  them; `InternationalizationContext` now also carries `preferredLocale`, and the hook keeps receiving
  `guildId`, `channelId` and `userId` so an asynchronous lookup can resolve them.

  Interaction behaviour is unchanged.

### Patch Changes

- [#52](https://github.com/wolfstar-project/plugins/pull/52) [`2bd2760`](https://github.com/wolfstar-project/plugins/commit/2bd276061ff905e211e035b2295245cf25d1f84a) - fix(plugin-i18next): honour `defaultName` and register resources added by HMR

  Two issues found in review of [#50](https://github.com/wolfstar-project/plugins/issues/50):

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

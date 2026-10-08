# @wolfstar/plugin-subcommands-advanced

## 2.2.0

### Minor Changes

- [#231](https://github.com/wolfstar-project/plugins/pull/231) [`99bd589`](https://github.com/wolfstar-project/plugins/commit/99bd589da290cbb9b5bd5887c6293dcc7cd828f4) - Add `Command.OptionsOf` and `Subcommand.OptionsOf`, re-exporting the framework's `Command.OptionsOf` so command classes that import `Command` from this package can type their generated options (`stars codegen`). Requires `@wolfstar/http-framework` 6.2.0 or later for the type.

## 2.1.0

### Minor Changes

- [#193](https://github.com/wolfstar-project/plugins/pull/193) [`1e5f320`](https://github.com/wolfstar-project/plugins/commit/1e5f320d8e2769d7e7868fac78b05f6519b960e2) - Add `@wolfstar/plugin-subcommands-advanced/module` and `@wolfstar/plugin-subcommands-advanced/plugin`: list the module in `modules` in `stars.config`, or pass the `definePlugin` factory to `plugins`. Both need framework 6.1 (and `@wolfstar/kit` for the module); `./register` is unchanged and still supports framework v3, v5 and v6.

## 2.0.6

### Patch Changes

- [#176](https://github.com/wolfstar-project/plugins/pull/176) [`c989f83`](https://github.com/wolfstar-project/plugins/commit/c989f8396af21be2038ffbb513e38eb1189ccbde) - Accept `@wolfstar/http-framework` v6 in the peer range (`|| ^6.0.0`).

## 2.0.5

### Patch Changes

- [#125](https://github.com/wolfstar-project/plugins/pull/125) [`27f8d59`](https://github.com/wolfstar-project/plugins/commit/27f8d59bec0d0bd193be4ab27f86e893e19afa32) - fix: accept `@wolfstar/http-framework` v5 as a peer dependency (`^3.1.0 || ^5.0.0`), so v5 projects no longer install the plugin with an unmet peer ([#121](https://github.com/wolfstar-project/plugins/issues/121))

## 2.0.4

### Patch Changes

- [#83](https://github.com/wolfstar-project/plugins/pull/83) [`d584e09`](https://github.com/wolfstar-project/plugins/commit/d584e0976680d58118aa950ba8d4f1631c2b9ebd) - fix: defer subcommand builder callbacks until all command pieces have been constructed

- [#75](https://github.com/wolfstar-project/plugins/pull/75) [`80bf45b`](https://github.com/wolfstar-project/plugins/commit/80bf45bb21f4d474a6c9dc72049ddb704669357e) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

## 2.0.3

### Patch Changes

- [#70](https://github.com/wolfstar-project/plugins/pull/70) [`9fad109`](https://github.com/wolfstar-project/plugins/commit/9fad109a5a84f609e5c3f9cc7d87e2d86874fbf9) - Validate every published subpath export with `are-the-types-wrong`, not just the main entrypoint.

  `createTsdownOptions` hardcoded `attw.entrypoints` to `["."]`, so the `./register` export of each
  package shipped unchecked. It now accepts an `attwEntrypoints` option, and all packages list their
  real entrypoints.

## 2.0.2

### Patch Changes

- [#47](https://github.com/wolfstar-project/plugins/pull/47) [`e21b2a8`](https://github.com/wolfstar-project/plugins/commit/e21b2a8fcd9948b515b5928c994e4cf4a7722346) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

## 2.0.1

### Patch Changes

- [#26](https://github.com/wolfstar-project/plugins/pull/26) [`75ecd8f`](https://github.com/wolfstar-project/plugins/commit/75ecd8ff9ad0f91ccc01e28dce530091398d0e85) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

- [#30](https://github.com/wolfstar-project/plugins/pull/30) [`0b1c47f`](https://github.com/wolfstar-project/plugins/commit/0b1c47f67e08f9516c9e4b9e457296d2023e97b0) - Fix `RegisterAsSubcommand` and `RegisterAsSubcommandGroup` not registering the decorated subcommand piece in `applicationCommandRegistry`, which prevented modular subcommand classes from being recognized as application commands.

## 2.0.0

### Major Changes

- [#17](https://github.com/wolfstar-project/plugins/pull/17) [`e108528`](https://github.com/wolfstar-project/plugins/commit/e108528b431be1e1178fb774a99396609919b78a) - Add `@wolfstar/plugin-subcommands-advanced`: modular slash subcommands as separate command classes for `@wolfstar/http-framework`, adapted from `@kaname-png/plugin-subcommands-advanced`.

## 1.0.0

### Major Changes

- Initial release: modular slash subcommands as separate command classes for `@wolfstar/http-framework`.

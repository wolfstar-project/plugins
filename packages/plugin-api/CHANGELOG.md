# @wolfstar/plugin-api

## 1.1.5

### Patch Changes

- [#70](https://github.com/wolfstar-project/plugins/pull/70) [`9fad109`](https://github.com/wolfstar-project/plugins/commit/9fad109a5a84f609e5c3f9cc7d87e2d86874fbf9) - Validate every published subpath export with `are-the-types-wrong`, not just the main entrypoint.

  `createTsdownOptions` hardcoded `attw.entrypoints` to `["."]`, so the `./register` export of each
  package shipped unchecked. It now accepts an `attwEntrypoints` option, and all packages list their
  real entrypoints.

## 1.1.4

### Patch Changes

- [#47](https://github.com/wolfstar-project/plugins/pull/47) [`e21b2a8`](https://github.com/wolfstar-project/plugins/commit/e21b2a8fcd9948b515b5928c994e4cf4a7722346) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

## 1.1.3

### Patch Changes

- [#26](https://github.com/wolfstar-project/plugins/pull/26) [`75ecd8f`](https://github.com/wolfstar-project/plugins/commit/75ecd8ff9ad0f91ccc01e28dce530091398d0e85) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

## 1.1.2

### Patch Changes

- [#13](https://github.com/wolfstar-project/plugins/pull/13) [`9c303e0`](https://github.com/wolfstar-project/plugins/commit/9c303e0cb68d1c8d781db3fb9f053f766545ee6f) - Fix repository URL in package.json to point to the plugins repository

## 1.1.1

### Patch Changes

- Republish `@wolfstar/plugin-api` after fixing the npm trusted-publishing configuration that prevented earlier releases from reaching the registry.

## 1.1.0

### Minor Changes

- Add `@wolfstar/plugin-api`: standalone REST API server plugin for `@wolfstar/http-framework` with routes, middlewares, and router.

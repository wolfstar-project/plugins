# @wolfstar/plugin-api

## 2.0.1

### Patch Changes

- [#180](https://github.com/wolfstar-project/plugins/pull/180) [`040a747`](https://github.com/wolfstar-project/plugins/commit/040a747998949fb863bf21a6b417a279f8d1e84e) - fix(deps): update dependency cookie-es to v3 Thanks [@renovate](https://github.com/apps/renovate)!

- [#176](https://github.com/wolfstar-project/plugins/pull/176) [`c989f83`](https://github.com/wolfstar-project/plugins/commit/c989f8396af21be2038ffbb513e38eb1189ccbde) - Accept `@wolfstar/http-framework` v6 in the peer range (`|| ^6.0.0`).

## 2.0.0

### Major Changes

- [#161](https://github.com/wolfstar-project/plugins/pull/161) [`32fb7ea`](https://github.com/wolfstar-project/plugins/commit/32fb7ea598e58a2fc7e5096be1edeac714c0dc80) - Align with `@sapphire/plugin-api` 8.3.1 (everything except auth). Breaking changes:

  - Renames: `ApiServer` → `Server`, `ApiServerEvent` → `ServerEvent`, `ApiServerOptions` → `ServerOptions`, `ApiServerEvents` → `ServerEvents`, `ApiPlugin` → `Api`, `HttpMethod` → `MethodName`.
  - A route declared with no methods no longer defaults to `GET`; it matches nothing (its path answers `404`).
  - `ApiResponse#json(data)` no longer takes a status code (use `status(code).json(data)`); response helpers return `void`.
  - `ApiRequest#readBodyJson` is not generic and returns `unknown`, the `limit` parameter is gone (use `maximumBodyLength`), and `request.query` is a plain record.
  - `OPTIONS` answers `200` with an empty body, and `404`/`405` from the `headers` middleware have empty bodies.
  - Listener piece names are PascalCase, and `ServerEvent.Error` carries an optional request/response.
  - Requires Node.js `>=20.18.1` and `@wolfstar/http-framework` `^3.6.0 || ^5.0.0`.

  Added: `CookieStore` and the `cookies` middleware, body readers (`readBody*`, `readValidatedBody*`, `asWeb`), the full `ApiResponse` helper set, `ServerOptions.prefix`, per-route `maximumBodyLength`, the `MiddlewareSuccess`/`MiddlewareFailure` events, full router (`RouterBranch`/`RouterNode`) parity, `HttpCodes`, and a `version` export.

  Fixed relative to upstream: router path/removal/`supportedMethods` bugs, `Server#connect()` rejecting instead of throwing uncaught when the port is in use, and cookie parsing that crashed on malformed `Cookie` headers.

## 1.1.7

### Patch Changes

- [#125](https://github.com/wolfstar-project/plugins/pull/125) [`27f8d59`](https://github.com/wolfstar-project/plugins/commit/27f8d59bec0d0bd193be4ab27f86e893e19afa32) - fix: accept `@wolfstar/http-framework` v5 as a peer dependency (`^3.0.0 || ^5.0.0`), so v5 projects no longer install the plugin with an unmet peer ([#121](https://github.com/wolfstar-project/plugins/issues/121))

## 1.1.6

### Patch Changes

- [#75](https://github.com/wolfstar-project/plugins/pull/75) [`80bf45b`](https://github.com/wolfstar-project/plugins/commit/80bf45bb21f4d474a6c9dc72049ddb704669357e) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

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

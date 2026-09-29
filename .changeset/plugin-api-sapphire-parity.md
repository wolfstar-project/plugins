---
"@wolfstar/plugin-api": major
---

Align with `@sapphire/plugin-api` 8.3.1 (everything except auth). Breaking changes:

- Renames: `ApiServer` → `Server`, `ApiServerEvent` → `ServerEvent`, `ApiServerOptions` → `ServerOptions`, `ApiServerEvents` → `ServerEvents`, `ApiPlugin` → `Api`, `HttpMethod` → `MethodName`.
- A route declared with no methods no longer defaults to `GET`; it matches nothing (its path answers `404`).
- `ApiResponse#json(data)` no longer takes a status code (use `status(code).json(data)`); response helpers return `void`.
- `ApiRequest#readBodyJson` is not generic and returns `unknown`, the `limit` parameter is gone (use `maximumBodyLength`), and `request.query` is a plain record.
- `OPTIONS` answers `200` with an empty body, and `404`/`405` from the `headers` middleware have empty bodies.
- Listener piece names are PascalCase, and `ServerEvent.Error` carries an optional request/response.
- Requires Node.js `>=20.18.1` and `@wolfstar/http-framework` `^3.6.0 || ^5.0.0`.

Added: `CookieStore` and the `cookies` middleware, body readers (`readBody*`, `readValidatedBody*`, `asWeb`), the full `ApiResponse` helper set, `ServerOptions.prefix`, per-route `maximumBodyLength`, the `MiddlewareSuccess`/`MiddlewareFailure` events, full router (`RouterBranch`/`RouterNode`) parity, `HttpCodes`, and a `version` export.

Fixed relative to upstream: router path/removal/`supportedMethods` bugs, `Server#connect()` rejecting instead of throwing uncaught when the port is in use, and cookie parsing that crashed on malformed `Cookie` headers.

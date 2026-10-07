# plugin-api: full parity with `@sapphire/plugin-api` (minus auth)

## Goal

Make `@wolfstar/plugin-api` match `@sapphire/plugin-api` 8.3.1 in public API and observable behaviour, so a
Sapphire API plugin user can switch by changing the import path. **Auth is out of scope**: `Auth`,
`ServerOptions.auth`, `ApiRequest.auth`, the `auth` middleware, the oauth routes and `loadRoutes`.

Upstream reference: `sapphiredev/plugins`, `packages/api`. The package ships as a **major** release (breaking
renames and behaviour changes), with a changeset for `@wolfstar/plugin-api`.

## Approved decisions

Strict upstream parity by default. Deviations were approved item by item:

| #   | Decision                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Re-export `HttpCodes` from `@wolfstar/http-framework` in `index.ts` (no duplicated enum).                                                                                                                                                                                       |
| 2   | Error listeners log with `container.logger.fatal(error)`. Verify whether framework v3 has `container.logger`; if not, drop `^3` from the peer range and add a peer-range changeset.                                                                                             |
| 3   | **Keep local:** route and middleware error listeners send a generic `Internal Server Error` body, not `error.message`.                                                                                                                                                          |
| 4   | **Keep local:** `RouterNode#extractParameters` percent-decodes values, falling back to the raw value on a malformed URI.                                                                                                                                                        |
| 5   | Body reading uses the upstream undici `RequestProxy`; no `limit` parameter.                                                                                                                                                                                                     |
| 6   | `ApiResponse#json(data): void`, `status(code)` chained, helpers return `void`.                                                                                                                                                                                                  |
| 7   | `headers` middleware matches upstream: `Allow-Credentials`, per-node/`supportedMethods` `Allow-Methods`, `Authorization, User-Agent, Content-Type` in `Allow-Headers`, early exit for `OPTIONS` (200, empty body unless the route handles `OPTIONS`), 404 and 405 (empty body). |
| 8   | A route with no methods matches nothing (no implicit `GET`). Document it.                                                                                                                                                                                                       |
| 9   | `Route.Options.route?: string`.                                                                                                                                                                                                                                                 |
| 10  | Listener piece names are PascalCase (`PluginServerRequest`, ...).                                                                                                                                                                                                               |
| 11  | `ServerEvent.Error` payload is `[error, request?, response?]`; the server's own error forwarder only re-emits when an `error` listener exists.                                                                                                                                  |
| 12  | Export `version: string`, injected at build time with `@redstardev/unplugin-version-injector` (tag `[VI]{{inject}}[/VI]`, `rolldown` entry) through `createTsdownOptions({ plugins })` in `packages/plugin-api/tsdown.config.ts`.                                               |

Forced deviations: `postListen` instead of `preLogin`; no `Client.server` augmentation (it is the interactions
server); `ClientOptions.api` and `container.server` are kept; `@sapphire/utilities` is not used (two helpers
inlined); `RouterNode` uses `Map` instead of discord.js `Collection` (private upstream); the upstream
`RouterBranch._performRemove` bug (indexes `_staticChildren[index]` when no static child matches) is fixed, not
ported.

## Changes

### Renames and layout

Move to the upstream layout so paths and names match:

- `lib/http/ApiServer.ts` -> `lib/structures/http/Server.ts`: `Server`, `ServerEvent`, `ServerEvents`,
  `ServerOptions`, `AuthLessServerOptions`, plus the `ContentType*` / `Generic*MimeType` types.
  `ServerEvent` gains `MiddlewareFailure` and `MiddlewareSuccess`; `RouterBranchMethodNotAllowed` carries the branch.
  `connect()` also rejects on an unexpected `close`.
- `lib/http/ApiRequest.ts`, `ApiResponse.ts` -> `lib/structures/api/`.
- `lib/http/HttpMethod.ts` -> `lib/structures/http/HttpMethods.ts`: `MethodName`, `MethodNames` (full 35 methods).
- New `lib/structures/http/HttpCodes.ts` is only the re-export (decision 1).
- New `lib/utils/_body/{RequestProxy,RequestHeadersProxy,RequestURLProxy}.ts` and `lib/utils/constants.ts`
  (ported from upstream).
- The `declare module` augmentations stay in `index.ts` (no separate `Augmentations.d.ts`).

### Public API

- **`ApiRequest`**: `query: Record<string, string | string[]>`, `params`, `routerNode?: RouterNode | null`,
  `route?: Route | null`, `asWeb()`, `readBody`, `readBodyArrayBuffer`, `readBodyBlob`, `readBodyFormData`,
  `readBodyJson`, `readBodyText`, `readValidatedBody*`, `ValidatorFunction`. No `auth`.
- **`ApiResponse<Request>`**: `cookies`, `ok`, `created`, `noContent`, `badRequest`, `unauthorized`, `forbidden`,
  `notFound`, `methodNotAllowed`, `conflict`, `error(error: number | string, data?)`, `respond`, `status`, `json`,
  `text`, `image`, `html`, `setContentType`.
- **`CookieStore`** and `SecureCookieStoreSetOptions`, ported (needs `tldts`). `domainOverwrite` is `null` because
  auth is out of scope.
- **`Route`**: applies `ServerOptions.prefix`; per-route `maximumBodyLength`; `Route.Request` / `Route.Response` /
  `Route.Options` / `Route.LoaderContext` / `Route.JSON` / `Route.LocationJSON` namespace types; `RouteOptions`
  exported.
- **`Middleware`**: `Middleware.Request` / `Response` / `Options` / `JSON` / `LocationJSON`; `MiddlewareOptions`
  exported; positions documented as headers 10, body 20, cookies 30 (auth 40 is reserved upstream, not built here).
- **Router**: `RouterBranch` gains `supportedMethods`, `path`, `children`, `empty`, `find`, `nodes()`, `toString()`;
  `RouterNode` gains `get`, `set`, `delete(method, route)`, `methods()`, `path`; `RouterRoot` overrides `path` /
  `toString()` and follows upstream `normalize` / `extractMethod`. `RouteLoaderStrategy` matches upstream.
- **Middlewares** (`_load.ts` registers `body`, `cookies`, `headers`, no `auth`): `body` checks content-type,
  content-length and `route.maximumBodyLength`; `cookies` creates `response.cookies`.
- **Listeners** (`_load.ts` registers all seven, PascalCase names): adds `PluginServerMiddlewareSuccess`;
  `PluginServerRouterFound` emits `MiddlewareSuccess` / `MiddlewareFailure` and no longer runs the route itself.
- **`index.ts`** exports match upstream (minus auth and `loadRoutes`), including `export type * from
'@sapphire/iana-mime-types'`, `HttpCodes`, and `version`.
- **`register.ts`**: `Api` plugin class (rename of `ApiPlugin`) with `postInitialization` and `postListen`.

### Dependencies

Add `undici`, `tldts`, `cookie-es` (for `splitSetCookieString` in `RequestHeadersProxy#getSetCookie`) and
`@sapphire/iana-mime-types`. Keep `@sapphire/pieces` and `@vladfrangu/async_event_emitter`. Do not add
`@types/ws` or `@sapphire/utilities`. Add `@redstardev/unplugin-version-injector` as a devDependency.
`engines.node` becomes `>=20.18.1` (undici 7); the `@wolfstar/http-framework` peer range becomes
`^3.6.0 || ^5.0.0` (`container.logger.fatal` exists from 3.6.0).

### Docs and release

Update `packages/plugin-api/README.md` (new names, cookies, body readers, migration notes from `1.x`, and the
no-implicit-`GET` note), add a major changeset, and touch `AGENTS.md` only if a command or package fact changes.

### Additional deviations and fixes (approved with the plan)

- Router: `find` returns `null` for a branch without methods (so `/` answers 404, not 405); `Awaitable` moves to `lib/utils/common`; `Route.Options.route` is widened to `string`.
- Upstream bugs fixed locally: `RouterBranch#path` dropping ancestors, `_performRemove` using the wrong branch, removal dropping sibling methods, `supportedMethods` ignoring grandchildren, the `g` flag on `CookieStore.octetRegExp`, `parseHost` returning `NaN` for `":8080"`, the `CookieStore` set-cookie dedupe comparing the raw instead of the encoded name, an uncaught throw in the server error forwarder on a port in use, and an unclosed request stream on client disconnect.
- Cookies middleware: the IP-host check is lazy (in `prepare()`), so an ordinary request over an IP host is not a 500; malformed `Cookie` pairs are skipped.
- `Server#connect()` cleans up its handlers and also rejects on an unexpected `close`.
- The request listener no longer returns early on `writableEnded` after the middlewares, so `MiddlewareFailure` is reachable; the NotFound/MethodNotAllowed listeners keep the `!writableEnded` guard.

Known limitations (kept as upstream): chunked bodies are not length-limited; a request with `Content-Length` but no `Content-Type` bypasses the body limit; the IPv6 `Host` header edge case is not fixed; `cookies.add` on an IP host without an explicit domain throws (a route error, generic 500).

## Testing

- Port upstream `tests/lib/structures/Route.test.ts`, `RouterRoot.test.ts` and `index.test.ts`; adapt `shared.ts`.
- Update `ApiServer.test.ts`, `MiddlewareStore.test.ts` and `router.test.ts` for the new names and shapes.
- New tests: `CookieStore` parse and `Set-Cookie` output; each new `ApiResponse` helper; `ApiRequest` body readers
  (JSON, form, text, chunked); `headers` middleware (`OPTIONS`, 404, 405, allow headers); `body` middleware (413);
  `MiddlewareSuccess` / `MiddlewareFailure` chain; router removal (the fixed `_performRemove` path); prefix handling;
  percent-decoded params with a malformed fallback; error listeners return a generic body.
- Done means the repo's definition: `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and a changeset.

## Out of scope

Auth (see the top), oauth routes, `Client.server`, upstream's CJS build, and any changes to other packages.

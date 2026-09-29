<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-api

**A standalone REST API server for `@wolfstar/http-framework`.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-api)](https://npmx.dev/package/@wolfstar/plugin-api)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-api)](https://npmx.dev/package/@wolfstar/plugin-api)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

A plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework),
ported from [`@sapphire/plugin-api`](https://github.com/sapphiredev/plugins/tree/main/packages/api)
(8.3.1). It exposes a **standalone** REST API server — for health checks, dashboards, or webhooks from
other services — built on the same `@sapphire/pieces` `Route`/`Middleware` conventions.

It is intentionally independent from `Client#server` (the interactions webhook): that server already
claims every path on its port and 404s anything that doesn't match, so this plugin binds its own
`Server` on a separate port instead of trying to share the same listener.

## Installation

```bash
pnpm add @wolfstar/plugin-api
```

Requires Node.js `>=20.18.1`.

## Usage

Import the side-effecting `register` entrypoint **before** you create your `Client`:

```ts
import "@wolfstar/plugin-api/register";
import { Client } from "@wolfstar/http-framework";

const client = new Client({
  api: {
    prefix: "v1",
    listenOptions: { port: 4000 },
    origin: "*",
  },
});

await client.load();
await client.listen({ port: 8080 }); // interactions webhook; the API server starts right after
```

`container.server` is the running `Server`; it is an `AsyncEventEmitter` (see [Events](#events)).

## Writing a route

Routes are `Route` pieces loaded from a `routes` directory, exactly like `commands`/`listeners`:

```ts
// src/routes/health.get.ts
import { Route } from "@wolfstar/plugin-api";

export class HealthRoute extends Route {
  public run(_request: Route.Request, response: Route.Response) {
    response.json({ status: "ok" });
  }
}
```

The route's path and method are inferred from its location: `src/routes/health.get.ts` registers
`GET /health`, and a file named `index` maps to its directory. A folder named `[id]` becomes a dynamic
segment (`request.params.id`), and a `(group)`-style folder is skipped when building the path. Both can
be overridden explicitly:

```ts
export class HealthRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, {
      route: "/status",
      methods: ["GET", "HEAD"],
      maximumBodyLength: 1024, // overrides ServerOptions.maximumBodyLength for this route
    });
  }

  public run(request: Route.Request, response: Route.Response) {
    response.json({ status: "ok", method: request.method });
  }
}
```

`ServerOptions.prefix` is prepended to every route path. Params are percent-decoded; a malformed
sequence (for example `%E0%A4%A`) falls back to the raw value instead of failing the request.

> A route declared with **no methods** (`methods: []`) matches nothing and its path answers `404`.
> There is no implicit `GET`: a route whose file name carries no method suffix and that passes no
> `methods` option is never reachable, so name it `health.get.ts` or pass `methods`.

## Reading the request

`ApiRequest` extends `IncomingMessage`:

| Member                                                                                                             | Description                                                                |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `query`                                                                                                            | Parsed query string, `Record<string, string \| string[]>`.                 |
| `params`                                                                                                           | Dynamic segments of the matched route.                                     |
| `route`, `routerNode`                                                                                              | The matched `Route` / `RouterNode` (`null` when nothing matched).          |
| `readBody()`                                                                                                       | Parses the body according to its `Content-Type`.                           |
| `readBodyJson()`, `readBodyText()`, `readBodyFormData()`                                                           | Typed readers (JSON, text, `application/x-www-form-urlencoded`/multipart). |
| `readBodyArrayBuffer()`, `readBodyBlob()`                                                                          | Raw readers.                                                               |
| `readValidatedBody(fn)`, `readValidatedBodyJson(fn)`, `readValidatedBodyText(fn)`, `readValidatedBodyFormData(fn)` | Read, then run your validator; its return value is the result.             |
| `asWeb()`                                                                                                          | A web-standard `Request` view of the same message.                         |

Readers return `unknown`; narrow with your own validator (any function, so Zod, Valibot or a hand-written
guard all work). Malformed bodies reject; an uncaught rejection becomes a generic `500` (the parser
message is logged, never sent to the client).

## Writing the response

`ApiResponse` extends `ServerResponse`. Every helper returns `void` except `status` and `setContentType`,
which return `this` so they chain:

```ts
response.status(HttpCodes.Created).json({ id });
response.ok(); // 200, body "OK"
response.noContent(); // 204
response.badRequest({ error: "Missing name" });
response.text("hello");
response.html(200, "<h1>hi</h1>");
response.error(500); // generic JSON error for a status code
```

Available helpers: `ok`, `created`, `noContent`, `badRequest`, `unauthorized`, `forbidden`, `notFound`,
`methodNotAllowed`, `conflict`, `error`, `respond`, `status`, `json`, `text`, `image`, `html`,
`setContentType`. `HttpCodes` is re-exported from `@wolfstar/http-framework`.

### Cookies

The built-in `cookies` middleware creates `response.cookies`, a `CookieStore` (a `Map` of the parsed
`Cookie` header). Cookies you `add` or `remove` are written to `Set-Cookie` when the response is sent;
they are marked `Secure` when `NODE_ENV=production`.

```ts
const session = response.cookies.get("session");
response.cookies.add("session", "abc", { domain: "example.com", maxAge: 3600 });
response.cookies.remove("old");
```

A malformed `Cookie` pair (bad percent-encoding, missing `=`) is skipped. When the request `Host` is an IP
address there is no default cookie domain, so pass `domain` explicitly.

## Writing a middleware

Middlewares are `Middleware` pieces loaded from a `middlewares` directory, run in ascending
`position` order before route dispatch (default `1000`); a middleware stops the chain by ending the
response:

```ts
// src/middlewares/requestId.ts
import { Middleware } from "@wolfstar/plugin-api";
import { randomUUID } from "node:crypto";

export class RequestIdMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 15 });
  }

  public run(request: Middleware.Request, response: Middleware.Response) {
    response.setHeader("X-Request-Id", randomUUID());
  }
}
```

Built-in middlewares:

| Name      | Position | Behaviour                                                                                                                                                   |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `headers` | 10       | Sets `Date` and the CORS headers; ends the response early with an empty `200` for `OPTIONS` (unless the route handles `OPTIONS`), `404` or `405`.           |
| `body`    | 20       | Answers `413` when the declared `Content-Length` exceeds the route's `maximumBodyLength`. Chunked bodies without a `Content-Length` are not length-limited. |
| `cookies` | 30       | Creates `response.cookies`.                                                                                                                                 |

## `ServerOptions`

| Option                 | Default            | Description                                                           |
| ---------------------- | ------------------ | --------------------------------------------------------------------- |
| `prefix`               | `undefined`        | Path segment prefix applied to every route.                           |
| `origin`               | `'*'`              | `Access-Control-Allow-Origin` header value.                           |
| `maximumBodyLength`    | `1024 * 1024 * 50` | Default maximum `Content-Length`, in bytes (a route can override it). |
| `server`               | `undefined`        | Raw options forwarded to `node:http`'s `createServer`.                |
| `listenOptions`        | `{ port: 4000 }`   | Raw options forwarded to `server.listen()`.                           |
| `automaticallyConnect` | `true`             | Whether to start listening during the `postListen` hook.              |

`Server#connect()` rejects (for example with `EADDRINUSE`) instead of throwing uncaught.

## Events

`container.server` emits `ServerEvent` members. The built-in listeners implement the pipeline
`request` → middlewares → `routerFound` / `routerBranchNotFound` / `routerBranchMethodNotAllowed`;
`routerFound` then emits `middlewareSuccess` (the route runs) or `middlewareFailure` (a middleware
already ended the response). Errors surface as `middlewareError` / `routeError`; both built-in
listeners log with `container.logger.fatal(error)` and answer a generic `500`.

## Migrating from 1.x

- `ApiServer` → `Server`, `ApiServerEvent` → `ServerEvent`, `ApiServerOptions` → `ServerOptions`,
  `ApiServerEvents` → `ServerEvents`, `ApiPlugin` → `Api`, `HttpMethod` → `MethodName`.
- **No implicit `GET`**: a route without methods matches nothing (see [Writing a route](#writing-a-route)).
- `ApiResponse#json(data, code?)` is now `json(data)`; use `response.status(code).json(data)`. Helpers
  return `void`.
- `ApiRequest#readBodyJson<T>()` is no longer generic and returns `unknown`; use
  `readValidatedBodyJson(validator)` or narrow yourself. There is no `limit` argument any more; the
  limit is `maximumBodyLength`.
- `request.query` is a plain record, no longer a `URLSearchParams`.
- `OPTIONS` pre-flights answer `200` with an empty body (was `204`); `404`/`405` from the `headers`
  middleware have empty bodies.
- Listener piece names are PascalCase (`PluginServerRequest`, …), and `ServerEvent.Error` carries an
  optional request/response.
- `@wolfstar/http-framework` peer range is `^3.6.0 || ^5.0.0`; Node.js `>=20.18.1`.

## Scope

Matches `@sapphire/plugin-api` 8.3.1 except for authentication.

**Not ported:** `Auth`, `ServerOptions.auth`, `ApiRequest.auth`, the `auth` middleware and the built-in
oauth routes (`loadRoutes`), the `Client.server` augmentation (that is the interactions server here) and
the CJS build. `preLogin` is replaced by the framework's `postListen` hook.

**Fixed relative to upstream** (each with a regression test): `RouterBranch#path` dropping ancestors,
route removal deleting sibling methods or indexing the wrong branch, `supportedMethods` ignoring
grandchildren, a global-flag regexp in `CookieStore`, `NaN` ports from a `:8080` host header, an
uncaught throw when the port is in use, and an unclosed request stream when a client disconnects mid-body.

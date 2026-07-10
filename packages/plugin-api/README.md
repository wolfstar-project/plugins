# @wolfstar/plugin-api

A plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework),
ported from [`@sapphire/plugin-api`](https://github.com/sapphiredev/plugins/tree/main/packages/api).
It exposes a **standalone** REST API server — for health checks, dashboards, or webhooks from other
services — built on the same `@sapphire/pieces` `Route`/`Middleware` conventions.

It is intentionally independent from `Client#server` (the interactions webhook): that server already
claims every path on its port and 404s anything that doesn't match, so this plugin binds its own
`ApiServer` on a separate port instead of trying to share the same listener.

## Installation

```bash
pnpm add @wolfstar/plugin-api
```

## Usage

Import the side-effecting `register` entrypoint **before** you create your `Client`:

```ts
import "@wolfstar/plugin-api/register";
import { Client } from "@wolfstar/http-framework";

const client = new Client({
  api: {
    listenOptions: { port: 4000 },
    origin: "*",
  },
});

await client.load();
await client.listen({ port: 8080 }); // interactions webhook; the API server starts right after
```

## Writing a route

Routes are `Route` pieces loaded from a `routes` directory, exactly like `commands`/`listeners`:

```ts
// src/routes/health.get.ts
import { HttpCodes } from "@wolfstar/http-framework";
import { Route } from "@wolfstar/plugin-api";

export class HealthRoute extends Route {
  public run(_request: Route.Request, response: Route.Response) {
    response.json({ status: "ok" }, HttpCodes.OK);
  }
}
```

The route's path and method are inferred from its location: `src/routes/health.get.ts` registers
`GET /health`. A folder named `[id]` becomes a dynamic segment (`request.params.id`), and a
`(group)`-style folder is skipped when building the path. Both can be overridden explicitly:

```ts
export class HealthRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/status", methods: ["GET", "HEAD"] });
  }

  public run(request: Route.Request, response: Route.Response) {
    response.json({ status: "ok", method: request.method });
  }
}
```

## Writing a middleware

Middlewares are `Middleware` pieces loaded from a `middlewares` directory, run in ascending
`position` order before route dispatch; a middleware stops the chain by ending the response:

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

Built-in middlewares: `headers` (position 10, sets CORS headers and short-circuits `OPTIONS`
pre-flight requests) and `body` (position 20, rejects requests whose `Content-Length` exceeds
`maximumBodyLength`).

## `ApiServerOptions`

| Option                 | Default            | Description                                              |
| ---------------------- | ------------------ | -------------------------------------------------------- |
| `prefix`               | `undefined`        | Path segment prefix applied to every route.              |
| `origin`               | `'*'`              | `Access-Control-Allow-Origin` header value.              |
| `maximumBodyLength`    | `1024 * 1024 * 50` | Maximum accepted `Content-Length`, in bytes.             |
| `server`               | `undefined`        | Raw options forwarded to `node:http`'s `createServer`.   |
| `listenOptions`        | `{ port: 4000 }`   | Raw options forwarded to `server.listen()`.              |
| `automaticallyConnect` | `true`             | Whether to start listening during the `postListen` hook. |

## Scope

Ported faithfully: the `Route`/`RouteStore` piece conventions, the filesystem-routing/dynamic-segment
trie router (`RouterRoot`/`RouterBranch`/`RouterNode`), the position-ordered `Middleware`/`MiddlewareStore`
chain, and the listener-driven request dispatch pipeline (`request` → middlewares → `routerFound` /
`routerBranchNotFound` / `routerBranchMethodNotAllowed` → route `run`).

**Not ported** (out of scope for this webhook-only framework, kept for a future release): cookies,
OAuth2/session auth, and the built-in `oauth/callback`, `oauth/logout` routes from the original
`@sapphire/plugin-api`. Add your own auth middleware/routes as needed.

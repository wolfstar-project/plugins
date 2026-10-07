# plugin-api Sapphire Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@wolfstar/plugin-api` match `@sapphire/plugin-api` 8.3.1 in public API and observable behaviour (everything except auth), shipped as a major release.

**Architecture:** Move to the upstream file layout (`lib/structures/{api,http,router}`, `lib/utils/_body`), port the upstream router, request/response/cookie/body-proxy code and the middleware/listener chain, and fix the upstream bugs found while porting (each with a regression test). The server, listeners and middlewares keep the local piece-loading style (`loadListeners`/`loadMiddlewares`) and the `postInitialization`/`postListen` plugin hooks.

**Tech Stack:** TypeScript 7 (checked with `golar`), tsdown (ESM only), vitest (globals on), oxlint/oxfmt, pnpm + Turborepo, `@sapphire/pieces`, `@wolfstar/http-framework` 5.x, `undici` 7, `tldts`, `cookie-es`, `@redstardev/unplugin-version-injector`.

**Spec:** `docs/superpowers/specs/2026-09-29-plugin-api-sapphire-parity-design.md`

**Commits:** every "Commit" step runs only if the user has authorized commits when the plan is executed. Commit messages must be Conventional Commits (husky + commitlint). Never push or publish.

**Working directory:** commands run from the repo root `D:\codes\plugins` unless stated. `packages/plugin-api` is written `PKG` below. Source style: double quotes, 2-space indent, semicolons, ESM, inline `type` imports (`import { type X }` or `import type`). Tests use vitest globals (`describe`/`it`/`expect`/`vi` without imports).

## Global Constraints

- Auth is out of scope: `Auth`, `ServerOptions.auth`, `ApiRequest.auth`, the `auth` middleware, the oauth routes and `loadRoutes`. Also out of scope: `Client.server`, upstream's CJS build, and any change to other packages.
- Target: `@sapphire/plugin-api` 8.3.1 (`sapphiredev/plugins`, `packages/api`). Ships as a **major** release with a changeset for `@wolfstar/plugin-api`.
- Approved decisions 1-12 (spec table): `HttpCodes` re-exported from `@wolfstar/http-framework`; error listeners log with `container.logger.fatal(error)`; **keep local** the generic `Internal Server Error` body in the route/middleware error listeners; **keep local** percent-decoded params with raw fallback on a malformed URI; body reading via the upstream undici `RequestProxy` with no `limit` parameter; `ApiResponse#json(data): void`, chained `status(code)`, helpers return `void`; `headers` middleware matches upstream (Allow-Credentials, per-node/`supportedMethods` Allow-Methods, `Authorization, User-Agent, Content-Type`, early exit for OPTIONS/404/405 with empty body); a route with no methods matches nothing (no implicit `GET`); `Route.Options.route?: string`; PascalCase listener piece names; `ServerEvent.Error` payload carries the request/response; `version: string` injected with `@redstardev/unplugin-version-injector` (tag `[VI]{{inject}}[/VI]`, `rolldown` entry) through `createTsdownOptions({ plugins })`.
- Forced deviations: `postListen` instead of `preLogin`; no `Client.server` augmentation; `ClientOptions.api` and `container.server` are kept; `@sapphire/utilities` is not used (helpers inlined in `lib/utils/common.ts`); `RouterNode` uses `Map`.
- Dependencies: add `undici`, `tldts`, `@sapphire/iana-mime-types` and (spec amendment) `cookie-es`; keep `@sapphire/pieces` and `@vladfrangu/async_event_emitter`; do **not** add `@types/ws` or `@sapphire/utilities`; add `@redstardev/unplugin-version-injector` as a devDependency. `engines.node` becomes `>=20.18.1` (undici 7); the `@wolfstar/http-framework` peer range becomes `^3.6.0 || ^5.0.0` (`container.logger.fatal` exists from 3.6.0).
- Done means (repo rule): `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass, tests are added for behaviour changes, and a changeset exists. `tests/http-framework-peer-range.test.ts` must keep passing. Update `AGENTS.md` only if a command, package or CI fact changes (none expected). No new `tsconfig.consumption.json` is needed.
- `container.logger` is assigned only by the framework `Client` constructor: integration tests that do not build a `Client` must stub `container.logger`.
- `golar typecheck` checks only `packages/*/src/**/*.ts`; tests are not type-checked, but `oxlint`/`oxfmt` still cover them.

## Review Focus

Failure modes the spec implies but no upstream test covers. Each has a test in the owning task:

1. `Server#connect()` must reject (not throw uncaught) when the port is already in use: Task 4.
2. A request whose `Host` is an IP (`127.0.0.1`) must not 500 through the cookies middleware, and a cookie with an explicit `domain` must still work: Tasks 3 (unit) and 5 (integration).
3. A body that is not valid JSON must produce a generic 500 that does not leak the parser message (route error listener, logger stubbed): Task 5.
4. A malformed `Cookie` header (`%E0%A4%A`, pair without `=`) must be skipped, not crash the request: Tasks 3 and 5.
5. A chunked request body with no `Content-Length` must be readable: Task 3.

Other covered items: a route declared with no methods matches nothing and its path answers 404 (decision 8); a malformed percent-encoded param falls back to the raw value; OPTIONS/404/405 responses have empty bodies; a branch without methods (for example `/`) answers 404, not 405.

## File map

| Path (under `PKG/src/lib`)                                         | Action         | Responsibility                                                                 |
| ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------ |
| `utils/common.ts`                                                  | create         | `Awaitable`, `isNullish`, `isNullishOrEmpty`                                   |
| `utils/constants.ts`                                               | create         | `NodeUtilInspectSymbol`                                                        |
| `utils/_body/RequestHeadersProxy.ts`                               | create         | `Headers` view over `IncomingMessage`                                          |
| `utils/_body/RequestURLProxy.ts`                                   | create         | `URL` view over `IncomingMessage`, `parseHost`                                 |
| `utils/_body/RequestProxy.ts`                                      | create         | `Request` view (body stream, readers)                                          |
| `structures/http/HttpMethods.ts`                                   | create         | `MethodNames`, `MethodName` (35 methods)                                       |
| `structures/http/HttpCodes.ts`                                     | create         | re-export of framework `HttpCodes`                                             |
| `structures/http/Server.ts`                                        | create         | `Server`, `ServerEvent(s)`, `ServerOptions` (replaces `http/ApiServer.ts`)     |
| `structures/api/ApiRequest.ts`, `ApiResponse.ts`, `CookieStore.ts` | create         | request/response/cookies (replace `http/ApiRequest.ts`, `http/ApiResponse.ts`) |
| `structures/router/{RouterBranch,RouterNode,RouterRoot}.ts`        | rewrite        | trie with removal/`supportedMethods`/`path`                                    |
| `structures/{Route,Middleware}.ts`                                 | rewrite        | upstream options/namespace/prefix/body limit                                   |
| `http/` (whole directory)                                          | delete         | superseded                                                                     |
| `PKG/src/middlewares/{headers,body,cookies,_load}.ts`              | rewrite/create | upstream middlewares                                                           |
| `PKG/src/listeners/*`                                              | rewrite/create | upstream event chain, `PluginServerMiddlewareSuccess`                          |
| `PKG/src/{index,register}.ts`                                      | rewrite/edit   | exports, `Api` plugin, `version`                                               |

---

### Task 1: Dependencies, tooling and shared utils

**Files:**

- Modify: `PKG/package.json` (deps, `engines`, peer range), `PKG/tsdown.config.ts`, `pnpm-lock.yaml` (by pnpm)
- Create: `PKG/src/lib/utils/common.ts`, `PKG/src/lib/utils/constants.ts`, `PKG/src/lib/structures/http/HttpMethods.ts`
- Test: `PKG/tests/utils.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `Awaitable<T>`, `isNullish(value: unknown): value is null | undefined`, `isNullishOrEmpty(value: unknown): value is "" | null | undefined` (all from `lib/utils/common`); `NodeUtilInspectSymbol` (from `lib/utils/constants`); `MethodNames` (readonly tuple of 35 names) and `type MethodName` (from `lib/structures/http/HttpMethods`). Installed deps `undici`, `tldts`, `cookie-es`, `@sapphire/iana-mime-types`, `@redstardev/unplugin-version-injector`.

- [ ] **Step 1: Install dependencies**

Run:

```bash
pnpm --filter @wolfstar/plugin-api add undici@^7.30.0 tldts@^7 cookie-es@^1.2.2 @sapphire/iana-mime-types
pnpm --filter @wolfstar/plugin-api add -D @redstardev/unplugin-version-injector
```

Expected: `packages/plugin-api/package.json` lists the new entries and `pnpm-lock.yaml` changes. If `minimumReleaseAge` blocks `undici@^7.30.0`, install the highest 7.x that resolves (the floor is `^7.24.3`, which upstream uses).

- [ ] **Step 2: Bump `engines` and the peer range**

In `packages/plugin-api/package.json` change `engines.node` from `>=20.0.0` to `>=20.18.1`, and `peerDependencies["@wolfstar/http-framework"]` from `^3.0.0 || ^5.0.0` to `^3.6.0 || ^5.0.0`.

- [ ] **Step 3: Verify the `MimeType` export used later**

Run the Grep tool for `export type MimeType` in `node_modules/@sapphire/iana-mime-types` (search `packages/plugin-api/node_modules/@sapphire/iana-mime-types`). Expected: the type `MimeType` is exported from the package's declaration file. If it is exported under a different name, use that name everywhere this plan writes `MimeType` (Task 3 `ApiResponse`).

- [ ] **Step 4: Point tsdown at the version injector**

Replace `packages/plugin-api/tsdown.config.ts` with:

```ts
import VersionInjector from "@redstardev/unplugin-version-injector/rolldown";
import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./register"],
    entry: ["src/index.ts", "src/register.ts"],
    plugins: [VersionInjector()],
  }),
);
```

The plugin only has an effect once `src/index.ts` contains the `[VI]{{inject}}[/VI]` tag (Task 6).

- [ ] **Step 5: Write the failing test**

Create `packages/plugin-api/tests/utils.test.ts`:

```ts
import { MethodNames } from "../src/lib/structures/http/HttpMethods";
import { isNullish, isNullishOrEmpty } from "../src/lib/utils/common";
import { NodeUtilInspectSymbol } from "../src/lib/utils/constants";

describe("utils", () => {
  it("given null and undefined then isNullish is true", () => {
    expect(isNullish(null)).toBe(true);
    expect(isNullish(undefined)).toBe(true);
  });

  it("given other falsy values then isNullish is false", () => {
    expect(isNullish("")).toBe(false);
    expect(isNullish(0)).toBe(false);
    expect(isNullish(false)).toBe(false);
  });

  it("given nullish or empty values then isNullishOrEmpty is true", () => {
    expect(isNullishOrEmpty(null)).toBe(true);
    expect(isNullishOrEmpty(undefined)).toBe(true);
    expect(isNullishOrEmpty("")).toBe(true);
    expect(isNullishOrEmpty([])).toBe(true);
  });

  it("given non-empty values then isNullishOrEmpty is false", () => {
    expect(isNullishOrEmpty("a")).toBe(false);
    expect(isNullishOrEmpty([1])).toBe(false);
    expect(isNullishOrEmpty(0)).toBe(false);
    expect(isNullishOrEmpty(false)).toBe(false);
  });

  it("exposes the Node inspect symbol", () => {
    expect(NodeUtilInspectSymbol).toBe(Symbol.for("nodejs.util.inspect.custom"));
  });

  it("lists the 35 HTTP methods including QUERY and M-SEARCH without duplicates", () => {
    expect(MethodNames).toHaveLength(35);
    expect(new Set(MethodNames).size).toBe(35);
    expect(MethodNames).toContain("QUERY");
    expect(MethodNames).toContain("M-SEARCH");
    expect(MethodNames).toContain("GET");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/plugin-api/tests/utils.test.ts`
Expected: FAIL with a resolve error for `../src/lib/utils/common` (module not found).

- [ ] **Step 7: Write the implementation**

Create `packages/plugin-api/src/lib/utils/common.ts`:

```ts
export type Awaitable<T> = T | PromiseLike<T>;

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isNullishOrEmpty(value: unknown): value is "" | null | undefined {
  return isNullish(value) || (value as { length?: unknown }).length === 0;
}
```

Create `packages/plugin-api/src/lib/utils/constants.ts`:

```ts
export const NodeUtilInspectSymbol = Symbol.for("nodejs.util.inspect.custom");
```

Create `packages/plugin-api/src/lib/structures/http/HttpMethods.ts`:

```ts
export const MethodNames = [
  "ACL",
  "BIND",
  "CHECKOUT",
  "CONNECT",
  "COPY",
  "DELETE",
  "GET",
  "HEAD",
  "LINK",
  "LOCK",
  "M-SEARCH",
  "MERGE",
  "MKACTIVITY",
  "MKCALENDAR",
  "MKCOL",
  "MOVE",
  "NOTIFY",
  "OPTIONS",
  "PATCH",
  "POST",
  "PROPFIND",
  "PROPPATCH",
  "PURGE",
  "PUT",
  "QUERY",
  "REBIND",
  "REPORT",
  "SEARCH",
  "SOURCE",
  "SUBSCRIBE",
  "TRACE",
  "UNBIND",
  "UNLINK",
  "UNLOCK",
  "UNSUBSCRIBE",
] as const;

export type MethodName = (typeof MethodNames)[number];
```

- [ ] **Step 8: Run the test to verify it passes, then check the package**

Run: `pnpm exec vitest run packages/plugin-api/tests/utils.test.ts`
Expected: PASS (6 tests).

Run: `pnpm exec vitest run tests/http-framework-peer-range.test.ts`
Expected: PASS (the new peer range still accepts the workspace framework version).

Run: `pnpm --filter @wolfstar/plugin-api build`
Expected: build succeeds (the version injector loads but finds no tag yet).

- [ ] **Step 9: Commit (only if the user authorized commits)**

```bash
git add packages/plugin-api/package.json packages/plugin-api/tsdown.config.ts packages/plugin-api/src/lib/utils packages/plugin-api/src/lib/structures/http/HttpMethods.ts packages/plugin-api/tests/utils.test.ts pnpm-lock.yaml
git commit -m "feat(plugin-api)!: add undici, tldts and version injector; bump engines and peer range"
```

---

### Task 2: Router rewrite (trie, removal, supported methods)

**Files:**

- Rewrite: `PKG/src/lib/structures/router/RouterNode.ts`, `RouterBranch.ts`, `RouterRoot.ts`
- Modify: `PKG/src/lib/structures/Route.ts`, `Middleware.ts` (imports only), `PKG/src/listeners/PluginServerRequest.ts` (import only), `PKG/src/index.ts` (one export line)
- Delete: `PKG/src/lib/http/HttpMethod.ts`
- Create: `PKG/tests/shared.ts`, `PKG/tests/RouterRoot.test.ts`
- Rewrite: `PKG/tests/router.test.ts`

**Interfaces:**

- Consumes: `MethodName` (Task 1), `Awaitable` (Task 1), `Route` (`route.path: readonly string[]`, `route.methods: ReadonlySet<MethodName>`).
- Produces:
  - `RouterNode`: `parent: RouterBranch`, `path: string`, `extractParameters(parts: readonly string[]): Record<string, string>`, `get(method: MethodName): Route | null`, `set(method: MethodName, route: Route): this`, `delete(method: MethodName, route: Route): boolean`, `methods(): IterableIterator<MethodName>`.
  - `RouterBranch(name: string, dynamic: boolean, parent: RouterBranch | null)`: `name`, `dynamic`, `parent`, `node: RouterNode`, `supportedMethods: readonly MethodName[]`, `path: string`, `children: RouterBranch[]`, `empty: boolean`, `find(parts: readonly string[]): RouterBranch | null`, `matches(name: string): boolean`, `toString(): string`, `nodes(): IterableIterator<RouterNode>`.
  - `RouterRoot extends RouterBranch`: `add(route: Route): RouterNode`, `remove(route: Route): boolean`, statics `normalize(path?: string | null): string[]`, `makeRoutePathForPiece(directories: readonly string[], name: string): string`, `extractMethod(path: string | readonly string[]): MethodName | null`.
  - Test helper `makeRoute(route: string, methods?: readonly MethodName[]): Route` from `tests/shared.ts`.

- [ ] **Step 1: Write the shared test helper**

Create `packages/plugin-api/tests/shared.ts`:

```ts
import { container, VirtualPath } from "@sapphire/pieces";
import { Route } from "../src/lib/structures/Route";
import type { MethodName } from "../src/lib/structures/http/HttpMethods";

export function makeRoute(route: string, methods: readonly MethodName[] = ["GET"]): Route {
  (container as unknown as { server?: unknown }).server ??= { options: {} };

  class UserRoute extends Route {
    public constructor(context: Route.LoaderContext) {
      super(context, { route, methods });
    }

    public run(): void {}
  }

  return new UserRoute({
    name: "test",
    path: VirtualPath,
    root: VirtualPath,
    store: null as never,
  });
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/plugin-api/tests/RouterRoot.test.ts`:

```ts
import { RouterRoot } from "../src/lib/structures/router/RouterRoot";
import { makeRoute } from "./shared";

describe("RouterRoot statics", () => {
  it("given empty inputs then normalize returns no parts", () => {
    expect(RouterRoot.normalize()).toStrictEqual([]);
    expect(RouterRoot.normalize(null)).toStrictEqual([]);
    expect(RouterRoot.normalize("")).toStrictEqual([]);
    expect(RouterRoot.normalize("/")).toStrictEqual([]);
  });

  it("given repeated slashes then normalize drops empty parts", () => {
    expect(RouterRoot.normalize("/a//b/")).toStrictEqual(["a", "b"]);
  });

  it("given a name with a method suffix then extractMethod returns it uppercased", () => {
    expect(RouterRoot.extractMethod("hello.get")).toBe("GET");
    expect(RouterRoot.extractMethod("hello.post")).toBe("POST");
    expect(RouterRoot.extractMethod(["a", "b.put"])).toBe("PUT");
  });

  it("given a name without a usable suffix then extractMethod returns null", () => {
    expect(RouterRoot.extractMethod("hello")).toBeNull();
    expect(RouterRoot.extractMethod("hello.")).toBeNull();
    expect(RouterRoot.extractMethod("")).toBeNull();
    expect(RouterRoot.extractMethod([])).toBeNull();
  });

  it("given any suffix then extractMethod does not validate it (strict upstream behaviour)", () => {
    expect(RouterRoot.extractMethod("hello.notamethod")).toBe("NOTAMETHOD");
  });

  it("given directories and a name then makeRoutePathForPiece joins them", () => {
    expect(RouterRoot.makeRoutePathForPiece([], "index")).toBe("");
    expect(RouterRoot.makeRoutePathForPiece(["a"], "index")).toBe("a");
    expect(RouterRoot.makeRoutePathForPiece(["a", "b"], "c")).toBe("a/b/c");
    expect(RouterRoot.makeRoutePathForPiece([" a ", "", "(group)", "b"], "[id]")).toBe("a/b/[id]");
  });
});

describe("RouterRoot structure", () => {
  it("given a new root then it is empty with an empty path", () => {
    const root = new RouterRoot();
    expect(root.path).toBe("");
    expect(root.toString()).toBe("");
    expect(root.children).toStrictEqual([]);
    expect(root.empty).toBe(true);
    expect(root.supportedMethods).toStrictEqual([]);
  });

  it("given nested branches then path includes every ancestor", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/a/b/[id]"));
    const a = root.children[0];
    const b = a.children[0];
    const id = b.children[0];
    expect(a.path).toBe("/a");
    expect(b.path).toBe("/a/b");
    expect(id.path).toBe("/a/b/[id]");
    expect(id.name).toBe("id");
    expect(id.dynamic).toBe(true);
  });

  it("given static and dynamic children then children lists static first and matches behaves", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/a"));
    root.add(makeRoute("/[x]"));
    const [a, x] = root.children;
    expect(root.children.map(String)).toStrictEqual(["a", "[x]"]);
    expect(root.empty).toBe(false);
    expect(a.empty).toBe(true);
    expect(a.matches("a")).toBe(true);
    expect(a.matches("b")).toBe(false);
    expect(x.matches("anything")).toBe(true);
    expect([...root.nodes()]).toHaveLength(3);
  });
});
```

Replace `packages/plugin-api/tests/router.test.ts` with:

```ts
import { RouterRoot } from "../src/lib/structures/router/RouterRoot";
import { makeRoute } from "./shared";

describe("router trie", () => {
  it("given a route then find returns the branch holding it", () => {
    const root = new RouterRoot();
    const route = makeRoute("/hello");
    root.add(route);
    expect(root.find(["hello"])?.node.get("GET")).toBe(route);
  });

  it("given a dynamic segment then the params are extracted", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/greet/[name]"));
    const parts = ["greet", "Ana"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ name: "Ana" });
  });

  it("given several dynamic segments then all params are extracted", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/[a]/x/[b]"));
    const parts = ["1", "x", "2"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ a: "1", b: "2" });
  });

  it("given percent-encoded params then they are decoded", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/users/[name]"));
    const parts = ["users", "J%C3%BCrgen"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ name: "Jürgen" });
  });

  it("given a malformed percent-encoded param then the raw value is kept", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/users/[name]"));
    const parts = ["users", "100%"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ name: "100%" });
  });

  it("given a static and a dynamic sibling then the static one wins", () => {
    const root = new RouterRoot();
    const me = makeRoute("/users/me");
    const byId = makeRoute("/users/[id]");
    root.add(me);
    root.add(byId);
    expect(root.find(["users", "me"])?.node.get("GET")).toBe(me);
    expect(root.find(["users", "7"])?.node.get("GET")).toBe(byId);
  });

  it("given a method that is not registered then get returns null", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/hello"));
    expect(root.find(["hello"])?.node.get("POST")).toBeNull();
  });

  it("given an unknown path then find returns null", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/hello"));
    expect(root.find(["nope"])).toBeNull();
  });

  it("given a branch without methods then find returns null (404, not 405)", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/a/b"));
    expect(root.find(["a"])).toBeNull();
    expect(root.find([])).toBeNull();
  });

  it("given a removed route then it is no longer found and the root is empty", () => {
    const root = new RouterRoot();
    const route = makeRoute("/hello");
    root.add(route);
    expect(root.remove(route)).toBe(true);
    expect(root.find(["hello"])).toBeNull();
    expect(root.empty).toBe(true);
  });

  it("given a different route object for the same path then remove returns false", () => {
    const root = new RouterRoot();
    const route = makeRoute("/a");
    root.add(route);
    expect(root.remove(makeRoute("/a"))).toBe(false);
    expect(root.find(["a"])?.node.get("GET")).toBe(route);
  });

  it("given a dynamic route next to a static branch then removing the dynamic one works", () => {
    const root = new RouterRoot();
    const staticRoute = makeRoute("/a");
    const dynamicRoute = makeRoute("/[x]/c");
    root.add(staticRoute);
    root.add(dynamicRoute);
    expect(root.remove(dynamicRoute)).toBe(true);
    expect(root.find(["q", "c"])).toBeNull();
    expect(root.find(["a"])?.node.get("GET")).toBe(staticRoute);
  });

  it("given a static route next to a dynamic sibling then removing the static one falls through to the dynamic one", () => {
    const root = new RouterRoot();
    const staticRoute = makeRoute("/a");
    const dynamicRoute = makeRoute("/[x]");
    root.add(staticRoute);
    root.add(dynamicRoute);
    expect(root.remove(staticRoute)).toBe(true);
    expect(root.find(["a"])?.node.get("GET")).toBe(dynamicRoute);
  });

  it("given two routes sharing a path then removing one keeps the other's methods", () => {
    const root = new RouterRoot();
    const get = makeRoute("/r", ["GET"]);
    const post = makeRoute("/r", ["POST"]);
    root.add(get);
    root.add(post);
    expect(root.remove(get)).toBe(true);
    const node = root.find(["r"])?.node;
    expect(node?.get("GET")).toBeNull();
    expect(node?.get("POST")).toBe(post);
    expect(root.supportedMethods).toStrictEqual(["POST"]);
  });

  it("given a deep route then supportedMethods bubbles up and is cleared on removal", () => {
    const root = new RouterRoot();
    const route = makeRoute("/a/b/c", ["POST"]);
    root.add(route);
    expect(root.supportedMethods).toContain("POST");
    expect(root.children[0].supportedMethods).toStrictEqual(["POST"]);
    root.remove(route);
    expect(root.supportedMethods).toStrictEqual([]);
  });

  it("given a removal that empties a branch then the branch is pruned", () => {
    const root = new RouterRoot();
    const route = makeRoute("/a/b/c");
    root.add(route);
    root.remove(route);
    expect(root.empty).toBe(true);
  });

  it("given a parent branch that still has methods then it is not pruned", () => {
    const root = new RouterRoot();
    const parent = makeRoute("/a");
    const child = makeRoute("/a/b");
    root.add(parent);
    root.add(child);
    root.remove(child);
    expect(root.find(["a"])?.node.get("GET")).toBe(parent);
    expect(root.children[0].empty).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/plugin-api/tests/RouterRoot.test.ts packages/plugin-api/tests/router.test.ts`
Expected: FAIL (for example `root.children` is undefined, `extractMethod("hello.notamethod")` returns `null`, removal assertions fail).

- [ ] **Step 4: Write `RouterNode`**

Replace `packages/plugin-api/src/lib/structures/router/RouterNode.ts`:

```ts
import type { Route } from "../Route";
import type { MethodName } from "../http/HttpMethods";
import type { RouterBranch } from "./RouterBranch";

function decodeParameter(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class RouterNode {
  /**
   * The branch containing this node.
   */
  public readonly parent: RouterBranch;

  /**
   * The methods this node supports.
   */
  readonly #methods = new Map<MethodName, Route>();

  public constructor(parent: RouterBranch) {
    this.parent = parent;
  }

  public get path(): string {
    return this.parent.path;
  }

  public extractParameters(parts: readonly string[]): Record<string, string> {
    const parameters: Record<string, string> = {};

    let branch: RouterBranch | null = this.parent;
    let index = parts.length - 1;
    while (branch?.parent) {
      if (branch.dynamic) parameters[branch.name] = decodeParameter(parts[index]);

      branch = branch.parent;
      --index;
    }

    return parameters;
  }

  public get(method: MethodName): Route | null {
    return this.#methods.get(method) ?? null;
  }

  public set(method: MethodName, route: Route): this {
    this.#methods.set(method, route);
    return this;
  }

  public delete(method: MethodName, route: Route): boolean {
    const existing = this.#methods.get(method);
    if (existing === route) {
      this.#methods.delete(method);
      return true;
    }

    return false;
  }

  public methods(): IterableIterator<MethodName> {
    return this.#methods.keys();
  }
}
```

- [ ] **Step 5: Write `RouterBranch`**

Replace `packages/plugin-api/src/lib/structures/router/RouterBranch.ts`:

```ts
import type { Route } from "../Route";
import type { MethodName } from "../http/HttpMethods";
import { RouterNode } from "./RouterNode";

function isDynamicPart(part: string): boolean {
  return part.length > 2 && part.startsWith("[") && part.endsWith("]");
}

export class RouterBranch {
  /**
   * The name of the branch.
   */
  public readonly name: string;

  /**
   * Whether or not the branch is dynamic.
   */
  public readonly dynamic: boolean;

  /**
   * The parent branch, if any.
   */
  public readonly parent: RouterBranch | null;

  /**
   * The node this branch is associated with.
   */
  public readonly node = new RouterNode(this);

  /**
   * The methods supported by the branch's node or any of its descendants.
   */
  public supportedMethods: readonly MethodName[] = [];

  private staticChildren: RouterBranch[] = [];
  private dynamicChild: RouterBranch | null = null;

  public constructor(name: string, dynamic: boolean, parent: RouterBranch | null) {
    this.name = name;
    this.dynamic = dynamic;
    this.parent = parent;
  }

  /**
   * The path representing this branch, including every ancestor.
   */
  public get path(): string {
    return this.parent ? `${this.parent.path}/${this}` : `${this}`;
  }

  /**
   * The branches directly below this one, static ones first.
   */
  public get children(): RouterBranch[] {
    return this.staticChildren.concat(this.dynamicChild ?? []);
  }

  /**
   * Whether or not the branch has no children.
   */
  public get empty(): boolean {
    return this.staticChildren.length === 0 && this.dynamicChild === null;
  }

  /**
   * Tries to find the branch that answers a path. A branch whose node has no methods never answers.
   *
   * @param parts The normalized parts of a path
   * @returns The branch found, or null if not found
   */
  public find(parts: readonly string[]): RouterBranch | null {
    return this.findAt(parts, 0);
  }

  /**
   * Checks if the given name matches the branch.
   */
  public matches(name: string): boolean {
    return this.dynamic || this.name === name;
  }

  public toString(): string {
    return this.dynamic ? `[${this.name}]` : this.name;
  }

  public *nodes(): IterableIterator<RouterNode> {
    yield this.node;
    for (const child of this.staticChildren) {
      yield* child.nodes();
    }

    if (this.dynamicChild) {
      yield* this.dynamicChild.nodes();
    }
  }

  protected insertAt(parts: readonly string[], index: number, route: Route): RouterNode {
    if (index >= parts.length) {
      for (const method of route.methods) {
        this.node.set(method, route);
      }

      this.updateSupportedMethods();
      return this.node;
    }

    const part = parts[index];
    let child: RouterBranch;
    if (isDynamicPart(part)) {
      this.dynamicChild ??= new RouterBranch(part.slice(1, -1), true, this);
      child = this.dynamicChild;
    } else {
      let existing = this.staticChildren.find((branch) => branch.name === part);
      if (!existing) {
        existing = new RouterBranch(part, false, this);
        this.staticChildren.push(existing);
      }

      child = existing;
    }

    const node = child.insertAt(parts, index + 1, route);
    this.updateSupportedMethods();
    return node;
  }

  protected removeAt(parts: readonly string[], index: number, route: Route): boolean {
    if (index >= parts.length) {
      let removed = false;
      for (const method of route.methods) {
        if (this.node.delete(method, route)) removed = true;
      }

      if (removed) this.updateSupportedMethods();
      return removed;
    }

    const part = parts[index];
    const child = isDynamicPart(part)
      ? this.dynamicChild
      : (this.staticChildren.find((branch) => branch.name === part) ?? null);
    if (child === null) return false;
    if (!child.removeAt(parts, index + 1, route)) return false;

    if (child.empty && child.node.methods().next().done === true) this.detach(child);
    this.updateSupportedMethods();
    return true;
  }

  private findAt(parts: readonly string[], index: number): RouterBranch | null {
    if (index >= parts.length) {
      return this.node.methods().next().done === true ? null : this;
    }

    const part = parts[index];
    const child = this.staticChildren.find((branch) => branch.matches(part)) ?? this.dynamicChild;
    return child?.findAt(parts, index + 1) ?? null;
  }

  private detach(child: RouterBranch): void {
    if (child === this.dynamicChild) {
      this.dynamicChild = null;
    } else {
      this.staticChildren = this.staticChildren.filter((branch) => branch !== child);
    }
  }

  private updateSupportedMethods(): void {
    const methods = new Set<MethodName>(this.node.methods());
    for (const child of this.children) {
      for (const method of child.supportedMethods) methods.add(method);
    }

    this.supportedMethods = [...methods];
  }
}
```

- [ ] **Step 6: Write `RouterRoot`**

Replace `packages/plugin-api/src/lib/structures/router/RouterRoot.ts`:

```ts
import type { Route } from "../Route";
import type { MethodName } from "../http/HttpMethods";
import { RouterBranch } from "./RouterBranch";
import type { RouterNode } from "./RouterNode";

export class RouterRoot extends RouterBranch {
  public constructor() {
    super("::ROOT::", false, null);
  }

  public override get path(): string {
    return "";
  }

  public add(route: Route): RouterNode {
    return this.insertAt(route.path, 0, route);
  }

  public remove(route: Route): boolean {
    return this.removeAt(route.path, 0, route);
  }

  public override toString(): string {
    return "";
  }

  public static normalize(path?: string | null): string[] {
    if (!path) return [];
    return path.split("/").filter((part) => part.length > 0);
  }

  public static makeRoutePathForPiece(directories: readonly string[], name: string): string {
    const parts: string[] = [];
    for (const directory of directories) {
      const trimmed = directory.trim();
      if (trimmed === "" || (trimmed.startsWith("(") && trimmed.endsWith(")"))) continue;
      parts.push(trimmed);
    }

    const trimmedName = name.trim();
    if (trimmedName !== "index") parts.push(trimmedName);
    return parts.join("/");
  }

  public static extractMethod(path: string | readonly string[]): MethodName | null {
    if (path.length === 0) return null;
    if (typeof path !== "string") return RouterRoot.extractMethod(path[path.length - 1]);

    const lastDot = path.lastIndexOf(".");
    if (lastDot === -1 || lastDot === path.length - 1) return null;
    return path.slice(lastDot + 1).toUpperCase() as MethodName;
  }
}
```

- [ ] **Step 7: Move `Awaitable` and `MethodName` imports, delete the old method file**

1. Run the Grep tool for `HttpMethod|Awaitable` in `packages/plugin-api/src` and `packages/plugin-api/tests`.
2. `src/lib/structures/Route.ts`: import `type MethodName` from `./http/HttpMethods` and `type Awaitable` from `../utils/common`; delete Route's own `export type Awaitable<T> = ...`; replace every `HttpMethod` type usage with `MethodName`. (The `route?: \`/${string}\`` option type stays until Task 4.)
3. `src/lib/structures/Middleware.ts`: import `type Awaitable` from `../utils/common` (it currently imports it from `./Route`).
4. `src/listeners/PluginServerRequest.ts`: import `type MethodName` from `../lib/structures/http/HttpMethods` instead of `type HttpMethod` from `../lib/http/HttpMethod`, and use it in the cast.
5. `src/index.ts`: replace the line that exports `./lib/http/HttpMethod` with `export * from "./lib/structures/http/HttpMethods";`.
6. Delete `packages/plugin-api/src/lib/http/HttpMethod.ts`.
7. Fix any other file the Grep step found (a remaining `HttpMethod`/`HttpMethods` reference means the file was missed).

- [ ] **Step 8: Run the tests and static checks**

Run: `pnpm exec vitest run packages/plugin-api`
Expected: PASS (router, RouterRoot, utils, ApiServer and MiddlewareStore tests; the integration test still passes because the old behaviour is unchanged).

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. (Warnings about existing code are acceptable only if they also appear on `main`.)

- [ ] **Step 9: Commit (only if the user authorized commits)**

```bash
git add packages/plugin-api
git commit -m "feat(plugin-api)!: rewrite the router with removal, supportedMethods and strict extractMethod"
```

---

### Task 3: API layer (HttpCodes, body proxies, ApiRequest, ApiResponse, CookieStore)

**Files:**

- Create: `PKG/src/lib/structures/http/HttpCodes.ts`, `PKG/src/lib/utils/_body/RequestHeadersProxy.ts`, `RequestURLProxy.ts`, `RequestProxy.ts`, `PKG/src/lib/structures/api/ApiRequest.ts`, `ApiResponse.ts`, `CookieStore.ts`
- Modify (imports and call sites): `PKG/src/lib/structures/Route.ts`, `Middleware.ts`, `MiddlewareStore.ts`, `PKG/src/lib/http/ApiServer.ts`, `PKG/src/listeners/*.ts`, `PKG/src/middlewares/*.ts`, `PKG/src/index.ts`, `PKG/tests/ApiServer.test.ts`, `PKG/tests/MiddlewareStore.test.ts`
- Delete: `PKG/src/lib/http/ApiRequest.ts`, `PKG/src/lib/http/ApiResponse.ts`
- Test: `PKG/tests/http-harness.ts` (helper), `RequestProxy.test.ts`, `ApiResponse.test.ts`, `CookieStore.test.ts`

**Interfaces:**

- Consumes: `isNullishOrEmpty` (`utils/common`) and `NodeUtilInspectSymbol` (`utils/constants`) from Task 1; `RouterNode` type from Task 2; `HttpCodes` from `@wolfstar/http-framework`.
- Produces:
  - `HttpCodes` (from `lib/structures/http/HttpCodes`).
  - `RequestHeadersProxy(request: IncomingMessage) implements Headers`; `RequestURLProxy(request: IncomingMessage) implements URL` and `parseHost(host: string | undefined): [hostname: string, port: number]`; `RequestProxy(request: IncomingMessage) implements Request`.
  - `ApiRequest extends IncomingMessage`: `query: Record<string, string | string[]>`, `params: Record<string, string>`, `routerNode?: RouterNode | null`, `route?: Route | null`, `asWeb(): Request`, `readBody(): Promise<unknown>`, `readBodyArrayBuffer(): Promise<ArrayBuffer>`, `readBodyBlob(): Promise<Blob>`, `readBodyFormData(): Promise<FormData>`, `readBodyJson(): Promise<unknown>`, `readBodyText(): Promise<string>`, `readValidatedBody<T>(validator)`, `readValidatedBodyFormData`, `readValidatedBodyJson`, `readValidatedBodyText`, `type ValidatorFunction<Data, Type> = (data: Data) => Type`.
  - `ApiResponse<Request extends IncomingMessage = IncomingMessage> extends ServerResponse<Request>`: `cookies: CookieStore`, `ok/created/noContent(data?: unknown): void`, `badRequest/unauthorized/forbidden/notFound/methodNotAllowed/conflict(data?: unknown): void`, `error(error: number | string, data?: unknown): void`, `respond(data: unknown): void`, `status(code: number): this`, `json(data: unknown): void`, `text(data: string): void`, `image(type, data): void`, `html(code: number, data: string): void`, `setContentType(type: MimeType): this`.
  - `CookieStore extends Map<string, string>`: constructor `(request: IncomingMessage, response: ServerResponse, secure?: boolean, domainOverwrite?: string | null)`, `add(name, value, options?): this`, `remove(name): this`, `type SecureCookieStoreSetOptions`.

- [ ] **Step 1: Write the shared test harness**

Create `packages/plugin-api/tests/http-harness.ts`:

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ApiRequest } from "../src/lib/structures/api/ApiRequest";
import { ApiResponse } from "../src/lib/structures/api/ApiResponse";

export interface Harness {
  readonly baseUrl: string;
  close(): Promise<void>;
}

const running: Harness[] = [];

/**
 * Starts a bare `node:http` server that builds `ApiRequest`/`ApiResponse` objects and hands them to `handler`.
 * A rejected handler answers with an empty 500.
 */
export async function startHarness(
  handler: (request: ApiRequest, response: ApiResponse) => unknown,
): Promise<Harness> {
  const server = createServer(
    { IncomingMessage: ApiRequest, ServerResponse: ApiResponse },
    (request, response) => {
      Promise.resolve()
        .then(() => handler(request as ApiRequest, response as ApiResponse))
        .catch(() => {
          if (!response.writableEnded) {
            response.statusCode = 500;
            response.end();
          }
        });
    },
  );

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const harness: Harness = {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  running.push(harness);
  return harness;
}

export async function closeAllHarnesses(): Promise<void> {
  await Promise.all(running.splice(0).map((harness) => harness.close()));
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/plugin-api/tests/RequestProxy.test.ts`:

```ts
import { connect } from "node:net";
import { RequestHeadersProxy } from "../src/lib/utils/_body/RequestHeadersProxy";
import { parseHost } from "../src/lib/utils/_body/RequestURLProxy";
import { closeAllHarnesses, startHarness } from "./http-harness";

afterEach(closeAllHarnesses);

describe("ApiRequest body readers", () => {
  it("given a JSON body then readBodyJson parses it", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json(await request.readBodyJson()),
    );
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await result.json()).toStrictEqual({ a: 1 });
  });

  it("given a urlencoded body then readBody returns FormData", async () => {
    const harness = await startHarness(async (request, response) => {
      const form = (await request.readBody()) as FormData;
      response.json(Object.fromEntries(form));
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      body: new URLSearchParams({ a: "1", b: "two" }),
    });
    expect(await result.json()).toStrictEqual({ a: "1", b: "two" });
  });

  it("given a multipart body then readBodyFormData parses the fields", async () => {
    const harness = await startHarness(async (request, response) => {
      const form = await request.readBodyFormData();
      response.json({ a: form.get("a") });
    });
    const body = new FormData();
    body.set("a", "hello");
    const result = await fetch(harness.baseUrl, { method: "POST", body });
    expect(await result.json()).toStrictEqual({ a: "hello" });
  });

  it("given a text body then readBodyText returns it", async () => {
    const harness = await startHarness(async (request, response) =>
      response.text(await request.readBodyText()),
    );
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(await result.text()).toBe("hello");
  });

  it("given a chunked body without content-length then it is read completely (Review Focus 5)", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json({
        text: await request.readBodyText(),
        length: request.headers["content-length"] ?? null,
      }),
    );
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("he"));
        controller.enqueue(encoder.encode("llo"));
        controller.close();
      },
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(await result.json()).toStrictEqual({ text: "hello", length: null });
  });

  it("given a validator then readValidatedBodyJson returns the validated value", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json(await request.readValidatedBodyJson((data) => (data as { n: number }).n * 2)),
    );
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 2 }),
    });
    expect(await result.json()).toBe(4);
  });

  it("given a body then readBodyBlob and readBodyArrayBuffer report its size and type", async () => {
    const harness = await startHarness(async (request, response) => {
      const blob = await request.readBodyBlob();
      response.json({ size: blob.size, type: blob.type });
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "abc",
    });
    expect(await result.json()).toStrictEqual({ size: 3, type: "text/plain" });

    const second = await startHarness(async (request, response) =>
      response.json({ bytes: (await request.readBodyArrayBuffer()).byteLength }),
    );
    const other = await fetch(second.baseUrl, { method: "POST", body: "abcd" });
    expect(await other.json()).toStrictEqual({ bytes: 4 });
  });

  it("given a GET request without a body then the readers return empty values", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json({
        text: await request.readBodyText(),
        bytes: (await request.readBodyArrayBuffer()).byteLength,
      }),
    );
    const result = await fetch(harness.baseUrl);
    expect(await result.json()).toStrictEqual({ text: "", bytes: 0 });
  });

  it("given an invalid JSON body then readBodyJson rejects with a SyntaxError", async () => {
    const harness = await startHarness(async (request, response) => {
      try {
        await request.readBodyJson();
        response.json({});
      } catch (error) {
        response.json({ name: (error as Error).name });
      }
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(await result.json()).toStrictEqual({ name: "SyntaxError" });
  });

  it("given a client that disconnects mid-body then the reader rejects instead of hanging", async () => {
    let settle!: (value: string) => void;
    const settled = new Promise<string>((resolve) => (settle = resolve));
    const harness = await startHarness(async (request) => {
      try {
        await request.readBodyText();
        settle("resolved");
      } catch {
        settle("rejected");
      }
    });

    const socket = connect(Number(new URL(harness.baseUrl).port), "127.0.0.1");
    socket.write(
      "POST / HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: 10\r\n\r\nabc",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.destroy();

    expect(await settled).toBe("rejected");
  });
});

describe("parseHost", () => {
  it.each([
    [undefined, ["localhost", -1]],
    ["", ["localhost", -1]],
    ["example.com", ["example.com", -1]],
    ["localhost:4000", ["localhost", 4000]],
    [":8080", ["", 8080]],
    ["host:", ["host", -1]],
    ["host:abc", ["host", -1]],
  ] as const)("given %j then it returns %j", (input, expected) => {
    expect(parseHost(input)).toStrictEqual(expected);
  });
});

describe("RequestHeadersProxy", () => {
  const make = (headers: Record<string, string | string[] | undefined>) =>
    new RequestHeadersProxy({ headers } as never);

  it("given mixed-case lookups then get is case-insensitive and null for missing or empty", () => {
    const headers = make({ "content-type": "text/plain", empty: "" });
    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("missing")).toBeNull();
    expect(headers.get("empty")).toBeNull();
    expect(headers.has("content-type")).toBe(true);
    expect(headers.has("empty")).toBe(false);
  });

  it("given an array header then get joins the values", () => {
    expect(make({ accept: ["a", "b"] }).get("accept")).toBe("a, b");
  });

  it("given append, set and delete then the underlying headers change", () => {
    const headers = make({ "x-a": "a" });
    headers.append("X-A", "b");
    expect(headers.get("x-a")).toBe("a, b");
    headers.append("x-new", "1");
    expect(headers.get("x-new")).toBe("1");
    headers.set("x-a", "z");
    expect(headers.get("x-a")).toBe("z");
    headers.delete("x-a");
    expect(headers.has("x-a")).toBe(false);
  });

  it("given set-cookie values then getSetCookie splits them", () => {
    const headers = make({
      "set-cookie": ["a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT", "b=2"],
    });
    expect(headers.getSetCookie()).toStrictEqual([
      "a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT",
      "b=2",
    ]);
    expect(make({}).getSetCookie()).toStrictEqual([]);
  });

  it("given empty entries then iteration skips them", () => {
    const headers = make({ a: "1", b: "", c: undefined, d: "4" });
    expect([...headers.entries()]).toStrictEqual([
      ["a", "1"],
      ["d", "4"],
    ]);
    expect([...headers.keys()]).toStrictEqual(["a", "d"]);
    expect([...headers.values()]).toStrictEqual(["1", "4"]);
    expect([...headers]).toStrictEqual([...headers.entries()]);
  });
});
```

Create `packages/plugin-api/tests/ApiResponse.test.ts`:

```ts
import { Readable } from "node:stream";
import type { ApiResponse } from "../src/lib/structures/api/ApiResponse";
import { closeAllHarnesses, startHarness } from "./http-harness";

afterEach(closeAllHarnesses);

async function call(run: (response: ApiResponse) => void) {
  const harness = await startHarness((_request, response) => run(response));
  return fetch(harness.baseUrl);
}

describe("ApiResponse helpers", () => {
  it.each([
    ["ok", 200, "OK"],
    ["created", 201, "Created"],
    ["noContent", 204, ""],
  ] as const)(
    "given %s then it answers %i with the status text as text",
    async (method, status, body) => {
      const result = await call((response) => response[method]());
      expect(result.status).toBe(status);
      expect(await result.text()).toBe(body);
    },
  );

  it.each([
    ["badRequest", 400, "Bad Request"],
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["notFound", 404, "Not Found"],
    ["methodNotAllowed", 405, "Method Not Allowed"],
    ["conflict", 409, "Conflict"],
  ] as const)(
    "given %s then it answers %i with a JSON error body",
    async (method, status, message) => {
      const result = await call((response) => response[method]());
      expect(result.status).toBe(status);
      expect(await result.json()).toStrictEqual({ error: message });
    },
  );

  it("given custom data then the helper uses it", async () => {
    const result = await call((response) => response.badRequest("nope"));
    expect(await result.json()).toStrictEqual({ error: "nope" });
  });

  it("given a string then error answers 500 with that message", async () => {
    const result = await call((response) => response.error("boom"));
    expect(result.status).toBe(500);
    expect(await result.json()).toStrictEqual({ error: "boom" });
  });

  it("given a status number and data then error uses both", async () => {
    const result = await call((response) => response.error(418, "tea"));
    expect(result.status).toBe(418);
    expect(await result.json()).toStrictEqual({ error: "tea" });
  });

  it("given a string then respond sends text, otherwise JSON", async () => {
    const text = await call((response) => response.ok("hi"));
    expect(text.headers.get("content-type")).toBe("text/plain");
    const json = await call((response) => response.ok({ a: 1 }));
    expect(json.headers.get("content-type")).toBe("application/json");
    expect(await json.json()).toStrictEqual({ a: 1 });
  });

  it("given status then json the status code is applied", async () => {
    const result = await call((response) => response.status(202).json({ queued: true }));
    expect(result.status).toBe(202);
    expect(await result.json()).toStrictEqual({ queued: true });
  });

  it("given html then it sets the content type and status", async () => {
    const result = await call((response) => response.html(200, "<p>x</p>"));
    expect(result.headers.get("content-type")).toBe("text/html");
    expect(await result.text()).toBe("<p>x</p>");
  });

  it("given a buffer or a stream then image sends the bytes with the image type", async () => {
    const buffer = await call((response) => response.image("image/png", Buffer.from("abc")));
    expect(buffer.headers.get("content-type")).toBe("image/png");
    expect(await buffer.text()).toBe("abc");

    const stream = await call((response) =>
      response.image("image/png", Readable.from([Buffer.from("abc")])),
    );
    expect(stream.headers.get("content-type")).toBe("image/png");
    expect(await stream.text()).toBe("abc");
  });
});
```

Create `packages/plugin-api/tests/CookieStore.test.ts`:

```ts
import { CookieStore } from "../src/lib/structures/api/CookieStore";

function fakeResponse() {
  const headers = new Map<string, unknown>();
  return {
    headers,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    setHeader: (name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
    },
  };
}

function make(
  cookie: string | undefined,
  {
    host = "api.example.com",
    remoteAddress = "10.0.0.1",
    secure = false,
    overwrite = null,
  }: {
    host?: string;
    remoteAddress?: string;
    secure?: boolean;
    overwrite?: string | null;
  } = {},
) {
  const response = fakeResponse();
  const store = new CookieStore(
    { headers: { cookie, host }, socket: { remoteAddress } } as never,
    response as never,
    secure,
    overwrite,
  );
  return { store, response };
}

describe("CookieStore", () => {
  it("given a Cookie header then the pairs are parsed and decoded", () => {
    const { store } = make("a=1; b=hello%20world");
    expect(store.get("a")).toBe("1");
    expect(store.get("b")).toBe("hello world");
  });

  it("given no Cookie header then the store is empty", () => {
    expect(make(undefined).store.size).toBe(0);
  });

  it("given malformed pairs then they are skipped and the rest are kept (Review Focus 4)", () => {
    const { store } = make("a=1; bad=%E0%A4%A; noequals; c=3");
    expect([...store.keys()]).toStrictEqual(["a", "c"]);
  });

  it("given a subdomain host then Domain is the registrable domain", () => {
    const { store, response } = make(undefined);
    store.add("s", "v");
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "s=v; Domain=.example.com; Path=/; HttpOnly",
    ]);
    expect(store.get("s")).toBe("v");
  });

  it("given secure, maxAge, expires and httpOnly options then the attributes follow the expected order", () => {
    const { store, response } = make(undefined, { secure: true });
    store.add("a", "1", { maxAge: 60, httpOnly: false, path: "/x" });
    store.add("b", "2", { expires: new Date(0) });
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "a=1; Max-Age=60; Domain=.example.com; Path=/x; Secure",
      "b=2; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.example.com; Path=/; Secure; HttpOnly",
    ]);
  });

  it("given the same name twice then the Set-Cookie entry is replaced", () => {
    const { store, response } = make(undefined);
    store.add("s", "1");
    store.add("s", "2");
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "s=2; Domain=.example.com; Path=/; HttpOnly",
    ]);
  });

  it("given remove then the key is dropped and an expired cookie is emitted", () => {
    const { store, response } = make("s=1");
    store.remove("s");
    expect(store.has("s")).toBe(false);
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "s=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.example.com; Path=/; HttpOnly",
    ]);
  });

  it("given an invalid value then add throws every time and does not mutate the store", () => {
    const { store } = make(undefined);
    expect(() => store.add("a", "bad value")).toThrow("Invalid character in value");
    expect(() => store.add("a", "bad value")).toThrow("Invalid character in value");
    expect(store.has("a")).toBe(false);
  });

  it("given an IP host then reading works, add throws, and an explicit domain works (Review Focus 2)", () => {
    const { store, response } = make("a=1", {
      host: "127.0.0.1:4000",
      remoteAddress: "127.0.0.1",
    });
    expect(store.get("a")).toBe("1");
    expect(() => store.add("s", "v")).toThrow(/IP address/);
    store.add("s", "v", { domain: "example.com" });
    expect((response.headers.get("set-cookie") as string[])[0]).toContain("Domain=example.com");
  });

  it("given a domain override then it wins over the host", () => {
    const { store, response } = make(undefined, { overwrite: ".foo.com" });
    store.add("s", "v");
    expect((response.headers.get("set-cookie") as string[])[0]).toContain("Domain=.foo.com");
  });

  it("given an uppercase host then the domain is lowercased", () => {
    const { store, response } = make(undefined, { host: "API.Example.COM" });
    store.add("s", "v");
    expect((response.headers.get("set-cookie") as string[])[0]).toContain("Domain=.example.com");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/plugin-api/tests/RequestProxy.test.ts packages/plugin-api/tests/ApiResponse.test.ts packages/plugin-api/tests/CookieStore.test.ts`
Expected: FAIL with resolve errors for `../src/lib/structures/api/ApiRequest`, `CookieStore` and `utils/_body/*`.

- [ ] **Step 4: Write `HttpCodes` and the header proxy**

Create `packages/plugin-api/src/lib/structures/http/HttpCodes.ts`:

```ts
export { HttpCodes } from "@wolfstar/http-framework";
```

Create `packages/plugin-api/src/lib/utils/_body/RequestHeadersProxy.ts`:

```ts
import type { IncomingMessage } from "node:http";
import { splitSetCookieString } from "cookie-es";
import { isNullishOrEmpty } from "../common";
import { NodeUtilInspectSymbol } from "../constants";

function normalizeValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

/**
 * A `Headers` view over the headers of a Node.js `IncomingMessage`. Reads and writes go straight to the request.
 */
export class RequestHeadersProxy implements Headers {
  readonly #request: IncomingMessage;

  public constructor(request: IncomingMessage) {
    this.#request = request;
  }

  public append(name: string, value: string): void {
    const key = name.toLowerCase();
    const existing = this.#request.headers[key];
    if (isNullishOrEmpty(existing)) {
      this.#request.headers[key] = value;
    } else {
      this.#request.headers[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
    }
  }

  public delete(name: string): void {
    this.#request.headers[name.toLowerCase()] = undefined;
  }

  public get(name: string): string | null {
    const value = this.#request.headers[name.toLowerCase()];
    return isNullishOrEmpty(value) ? null : normalizeValue(value);
  }

  public getSetCookie(): string[] {
    const value = this.get("set-cookie");
    return value === null ? [] : splitSetCookieString(value);
  }

  public has(name: string): boolean {
    return !isNullishOrEmpty(this.#request.headers[name.toLowerCase()]);
  }

  public set(name: string, value: string): void {
    this.#request.headers[name.toLowerCase()] = value;
  }

  public forEach(
    callback: (value: string, key: string, parent: Headers) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.entries()) {
      callback.call(thisArg, value, key, this);
    }
  }

  public *keys(): Generator<string, undefined, undefined> {
    for (const [key] of this.entries()) yield key;
    return undefined;
  }

  public *values(): Generator<string, undefined, undefined> {
    for (const [, value] of this.entries()) yield value;
    return undefined;
  }

  public *entries(): Generator<[string, string], undefined, undefined> {
    for (const [key, value] of Object.entries(this.#request.headers)) {
      if (isNullishOrEmpty(value)) continue;
      yield [key, normalizeValue(value)];
    }

    return undefined;
  }

  public [Symbol.iterator](): Generator<[string, string], undefined, undefined> {
    return this.entries();
  }

  public get [Symbol.toStringTag](): string {
    return "Headers";
  }

  public [NodeUtilInspectSymbol](): Record<string, string> {
    return Object.fromEntries(this.entries());
  }
}
```

- [ ] **Step 5: Write the URL proxy**

Create `packages/plugin-api/src/lib/utils/_body/RequestURLProxy.ts`:

```ts
import type { IncomingMessage } from "node:http";
import { NodeUtilInspectSymbol } from "../constants";

/**
 * Splits a `host` header into its hostname and port. The port is `-1` when absent or not a number.
 */
export function parseHost(host: string | undefined): [hostname: string, port: number] {
  if (!host) return ["localhost", -1];

  const index = host.indexOf(":");
  if (index === -1) return [host, -1];

  const port = Number.parseInt(host.slice(index + 1), 10);
  return [host.slice(0, index), Number.isNaN(port) ? -1 : port];
}

function parsePath(input: string | undefined): [pathname: string, search: string] {
  const path = (input ?? "/").replaceAll("\\", "/");
  const index = path.indexOf("?");
  if (index === -1) return [path, ""];

  const search = path.slice(index);
  return [path.slice(0, index), search === "?" ? "" : search];
}

/**
 * A `URL` view over an `IncomingMessage`; `pathname`, `search` and `host` write back to the request.
 */
export class RequestURLProxy implements URL {
  public hash = "";
  public password = "";
  public username = "";

  #protocol: string | null = null;
  #pathname: string;
  #search: string;
  #searchParams: URLSearchParams | null = null;
  readonly #request: IncomingMessage;

  public constructor(request: IncomingMessage) {
    this.#request = request;
    [this.#pathname, this.#search] = parsePath(request.url);
  }

  public get host(): string {
    return this.#request.headers.host ?? "";
  }

  public set host(value: string) {
    this.#request.headers.host = value;
  }

  public get hostname(): string {
    return parseHost(this.#request.headers.host)[0];
  }

  public set hostname(value: string) {
    const [, port] = parseHost(this.#request.headers.host);
    this.host = port === -1 ? value : `${value}:${port}`;
  }

  public get port(): string {
    const [, port] = parseHost(this.#request.headers.host);
    return port === -1 ? String(this.#request.socket.localPort ?? "") : String(port);
  }

  public set port(value: string) {
    const [hostname] = parseHost(this.#request.headers.host);
    this.host = value === "" ? hostname : `${hostname}:${value}`;
  }

  public get protocol(): string {
    if (this.#protocol !== null) return this.#protocol;

    const encrypted = (this.#request.socket as unknown as { encrypted?: boolean }).encrypted;
    return encrypted || this.#request.headers["x-forwarded-proto"] === "https" ? "https:" : "http:";
  }

  public set protocol(value: string) {
    this.#protocol = value.endsWith(":") ? value : `${value}:`;
  }

  public get origin(): string {
    return `${this.protocol}//${this.host}`;
  }

  public get pathname(): string {
    return this.#pathname;
  }

  public set pathname(value: string) {
    this.#pathname = value;
    this.#request.url = this.#pathname + this.#search;
  }

  public get search(): string {
    return this.#search;
  }

  public set search(value: string) {
    this.#search = value === "" || value === "?" ? "" : value.startsWith("?") ? value : `?${value}`;
    this.#searchParams = null;
    this.#request.url = this.#pathname + this.#search;
  }

  public get searchParams(): URLSearchParams {
    this.#searchParams ??= new URLSearchParams(this.#search);
    return this.#searchParams;
  }

  public set searchParams(value: URLSearchParams) {
    this.#searchParams = value;
  }

  public get href(): string {
    return this.origin + this.pathname + this.search;
  }

  public set href(value: string) {
    const url = new URL(value);
    this.protocol = url.protocol;
    this.host = url.host;
    this.pathname = url.pathname;
    this.search = url.search;
    this.hash = url.hash;
  }

  public toString(): string {
    return this.href;
  }

  public toJSON(): string {
    return this.href;
  }

  public get [Symbol.toStringTag](): string {
    return "URL";
  }

  public [NodeUtilInspectSymbol](): string {
    return this.href;
  }
}
```

- [ ] **Step 6: Write the request proxy**

Create `packages/plugin-api/src/lib/utils/_body/RequestProxy.ts`:

```ts
import { Blob } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { arrayBuffer } from "node:stream/consumers";
import { ReadableStream } from "node:stream/web";
import { FormData, Response } from "undici";
import { RequestHeadersProxy } from "./RequestHeadersProxy";
import { RequestURLProxy } from "./RequestURLProxy";

/**
 * A WHATWG `Request` view over an `IncomingMessage`. The body stream is created lazily and wired to
 * the underlying Node stream, so readers settle when the client finishes or disconnects.
 */
export class RequestProxy implements Request {
  public readonly cache = "default" as const;
  public readonly credentials = "same-origin" as const;
  public readonly destination = "" as const;
  public readonly integrity = "";
  public readonly keepalive = false;
  public readonly mode = "cors" as const;
  public readonly redirect = "follow" as const;
  public readonly referrer = "about:client";
  public readonly referrerPolicy = "" as const;
  public readonly bodyUsed = false;
  public readonly duplex = "half" as const;

  public readonly headers: RequestHeadersProxy;
  public readonly method: string;
  public readonly signal: AbortSignal;

  readonly #request: IncomingMessage;
  readonly #url: RequestURLProxy;
  readonly #abortController = new AbortController();
  #body: ReadableStream<Uint8Array> | null = null;

  public constructor(request: IncomingMessage) {
    this.#request = request;
    this.headers = new RequestHeadersProxy(request);
    this.#url = new RequestURLProxy(request);
    this.method = (request.method ?? "GET").toUpperCase();
    this.signal = this.#abortController.signal;
  }

  public get url(): string {
    return this.#url.href;
  }

  public get body(): ReadableStream<Uint8Array> | null {
    if (!this.#hasBody) return null;

    this.#body ??= new ReadableStream<Uint8Array>({
      start: (controller) => {
        const request = this.#request;
        request.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        request.on("end", () => controller.close());
        request.on("error", (error) => {
          controller.error(error);
          this.#abortController.abort(error);
        });
        request.on("close", () => {
          if (request.complete) return;

          const error = new Error("Request closed before the body was fully received");
          controller.error(error);
          this.#abortController.abort(error);
        });
      },
    });

    return this.#body;
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    const body = this.body;
    return body === null ? new ArrayBuffer(0) : arrayBuffer(body);
  }

  public async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await this.arrayBuffer());
  }

  public async blob(): Promise<Blob> {
    return new Blob([await this.arrayBuffer()], { type: this.headers.get("content-type") ?? "" });
  }

  public async formData(): Promise<FormData> {
    return new Response(this.body as never, {
      headers: { "content-type": this.headers.get("content-type") ?? "" },
    }).formData();
  }

  public async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  public async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  public clone(): RequestProxy {
    return new RequestProxy(this.#request);
  }

  get #hasBody(): boolean {
    const length = Number(this.#request.headers["content-length"]);
    if (Number.isSafeInteger(length) && length > 0) return true;

    return String(this.#request.headers["transfer-encoding"] ?? "")
      .toLowerCase()
      .includes("chunked");
  }
}
```

Typecheck note: `implements Request` compares against the `Request` type from the ambient/undici typings. If `pnpm typecheck` reports a member whose signature differs (for example `bytes`, `blob`, `formData`, `body`), change only that member's declared type to the reported one. Do not drop `implements`. Apply the same rule to `RequestHeadersProxy implements Headers` and `RequestURLProxy implements URL`.

- [ ] **Step 7: Write `ApiRequest`**

Create `packages/plugin-api/src/lib/structures/api/ApiRequest.ts`:

```ts
import { IncomingMessage } from "node:http";
import { RequestProxy } from "../../utils/_body/RequestProxy";
import { isNullishOrEmpty } from "../../utils/common";
import type { Route } from "../Route";
import type { RouterNode } from "../router/RouterNode";

export type ValidatorFunction<Data, Type> = (data: Data) => Type;

export class ApiRequest extends IncomingMessage {
  /**
   * The query parameters, parsed from the request URL.
   */
  public query: Record<string, string | string[]> = {};

  /**
   * The values of the dynamic (`[param]`) path segments.
   */
  public params: Record<string, string> = {};

  /**
   * The router node that matched the request's pathname, if any.
   */
  public routerNode?: RouterNode | null;

  /**
   * The route that matched the request's pathname and method, if any.
   */
  public route?: Route | null;

  #cachedRequest: RequestProxy | null = null;

  /**
   * Returns a WHATWG `Request` view of this request.
   */
  public asWeb(): Request {
    this.#cachedRequest ??= new RequestProxy(this);
    return this.#cachedRequest;
  }

  /**
   * Reads the body as `FormData` for form content types, and as JSON otherwise.
   */
  public readBody(): Promise<unknown> {
    return this.#isFormContentType ? this.readBodyFormData() : this.readBodyJson();
  }

  public readBodyArrayBuffer(): Promise<ArrayBuffer> {
    return this.asWeb().arrayBuffer();
  }

  public readBodyBlob(): Promise<Blob> {
    return this.asWeb().blob();
  }

  public readBodyFormData(): Promise<FormData> {
    return this.asWeb().formData();
  }

  public readBodyJson(): Promise<unknown> {
    return this.asWeb().json();
  }

  public readBodyText(): Promise<string> {
    return this.asWeb().text();
  }

  public readValidatedBody<Type>(validator: ValidatorFunction<unknown, Type>): Promise<Type> {
    return this.readBody().then(validator);
  }

  public readValidatedBodyFormData<Type>(
    validator: ValidatorFunction<FormData, Type>,
  ): Promise<Type> {
    return this.readBodyFormData().then(validator);
  }

  public readValidatedBodyJson<Type>(validator: ValidatorFunction<unknown, Type>): Promise<Type> {
    return this.readBodyJson().then(validator);
  }

  public readValidatedBodyText<Type>(validator: ValidatorFunction<string, Type>): Promise<Type> {
    return this.readBodyText().then(validator);
  }

  get #isFormContentType(): boolean {
    const contentType = this.headers["content-type"];
    if (isNullishOrEmpty(contentType)) return false;

    return (
      contentType.startsWith("application/x-www-form-urlencoded") ||
      contentType.startsWith("multipart/form-data")
    );
  }
}
```

- [ ] **Step 8: Write `ApiResponse`**

Create `packages/plugin-api/src/lib/structures/api/ApiResponse.ts`:

```ts
import type { MimeType } from "@sapphire/iana-mime-types";
import { STATUS_CODES, ServerResponse, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { HttpCodes } from "../http/HttpCodes";
import type { CookieStore } from "./CookieStore";

export class ApiResponse<
  Request extends IncomingMessage = IncomingMessage,
> extends ServerResponse<Request> {
  /**
   * The cookies of the request, created by the `cookies` middleware.
   */
  public cookies!: CookieStore;

  public ok(data: unknown = STATUS_CODES[HttpCodes.OK]): void {
    this.status(HttpCodes.OK).respond(data);
  }

  public created(data: unknown = STATUS_CODES[HttpCodes.Created]): void {
    this.status(HttpCodes.Created).respond(data);
  }

  public noContent(data: unknown = STATUS_CODES[HttpCodes.NoContent]): void {
    this.status(HttpCodes.NoContent).respond(data);
  }

  public badRequest(data?: unknown): void {
    this.error(HttpCodes.BadRequest, data);
  }

  public unauthorized(data?: unknown): void {
    this.error(HttpCodes.Unauthorized, data);
  }

  public forbidden(data?: unknown): void {
    this.error(HttpCodes.Forbidden, data);
  }

  public notFound(data?: unknown): void {
    this.error(HttpCodes.NotFound, data);
  }

  public methodNotAllowed(data?: unknown): void {
    this.error(HttpCodes.MethodNotAllowed, data);
  }

  public conflict(data?: unknown): void {
    this.error(HttpCodes.Conflict, data);
  }

  /**
   * Sends an error. A string is the message of a 500; a number is the status code, with `data` (or the status text) as message.
   */
  public error(error: number | string, data?: unknown): void {
    if (typeof error === "string") {
      this.status(HttpCodes.InternalServerError).json({ error });
    } else {
      this.status(error).json({ error: data ?? STATUS_CODES[error] });
    }
  }

  public respond(data: unknown): void {
    if (typeof data === "string") this.text(data);
    else this.json(data);
  }

  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  public json(data: unknown): void {
    this.setContentType("application/json").end(JSON.stringify(data));
  }

  public text(data: string): void {
    this.setContentType("text/plain").end(data);
  }

  public image(
    type: Extract<MimeType, `image/${string}`>,
    data: string | Buffer | Uint8Array | Readable,
  ): void {
    if (data instanceof Readable) {
      this.setContentType(type);
      data.pipe(this);
    } else {
      this.setContentType(type).end(data);
    }
  }

  public html(code: number, data: string): void {
    this.setContentType("text/html").status(code).end(data);
  }

  public setContentType(type: MimeType): this {
    return this.setHeader("Content-Type", type);
  }
}
```

If Task 1's `MimeType` export-name verification found a different exported name, use that name here.

- [ ] **Step 9: Write `CookieStore`**

Create `packages/plugin-api/src/lib/structures/api/CookieStore.ts`:

```ts
// Portions of `prepare` and `encodeCookieOctet` are derived from cookie-httponly:
// Copyright (c) 2018 Stanislav Woodger. All rights reserved. MIT license.
// Source: https://github.com/woodger/cookie-httponly
import type { IncomingMessage, ServerResponse } from "node:http";
import { getDomain } from "tldts";

export interface SecureCookieStoreSetOptions {
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
}

const octetRegExp = /[^\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]/;

function encodeCookieOctet(value: string): string {
  if (octetRegExp.test(value)) throw new TypeError("Invalid character in value");
  return encodeURIComponent(value);
}

function getHostDomain(host: string): string {
  const lower = host.toLowerCase();
  const domain = getDomain(lower);
  return domain === null ? lower : `.${domain}`;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export class CookieStore extends Map<string, string> {
  readonly #request: IncomingMessage;
  readonly #response: ServerResponse;
  readonly #secure: boolean;
  readonly #domain: string;

  public constructor(
    request: IncomingMessage,
    response: ServerResponse,
    secure = false,
    domainOverwrite: string | null = null,
  ) {
    super();
    this.#request = request;
    this.#response = response;
    this.#secure = secure;

    const splitHost = request.headers.host?.split(":")[0] ?? "";
    this.#domain = domainOverwrite ?? getHostDomain(splitHost);

    const header = request.headers.cookie;
    if (typeof header !== "string") return;

    for (const pair of header.split(";")) {
      const index = pair.indexOf("=");
      if (index === -1) continue;

      const key = safeDecode(pair.slice(0, index).trim());
      const value = safeDecode(pair.slice(index + 1).trim());
      if (key === null || value === null) continue;

      this.set(key, value);
    }
  }

  /**
   * Adds a cookie and queues the matching `Set-Cookie` header. Nothing is stored if the cookie is invalid.
   */
  public add(name: string, value: string, options: SecureCookieStoreSetOptions = {}): this {
    const cookie = this.prepare(name, value, options);
    this.set(name, value);
    this.insert(name, cookie);
    return this;
  }

  /**
   * Removes a cookie and queues an already-expired `Set-Cookie` header for it.
   */
  public remove(name: string): this {
    this.delete(name);
    this.insert(name, this.prepare(name, "", { expires: new Date(0) }));
    return this;
  }

  private insert(name: string, cookie: string): void {
    const existing = this.#response.getHeader("Set-Cookie");
    const list =
      existing === undefined ? [] : Array.isArray(existing) ? existing : [String(existing)];
    const prefix = `${encodeURIComponent(name)}=`;
    this.#response.setHeader("Set-Cookie", [
      ...list.filter((entry) => !entry.startsWith(prefix)),
      cookie,
    ]);
  }

  private prepare(
    name: string,
    value: string,
    { expires, maxAge, domain, path, httpOnly }: SecureCookieStoreSetOptions,
  ): string {
    const effectiveDomain = (domain ?? this.#domain).toLowerCase();
    if (this.#request.socket.remoteAddress === effectiveDomain) {
      throw new Error(
        "The connection must be established from the domain name (i.e., not an IP address)",
      );
    }

    let cookie = `${encodeCookieOctet(name)}=${encodeCookieOctet(value)}`;
    if (expires !== undefined) cookie += `; Expires=${expires.toUTCString()}`;
    else if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;

    if (effectiveDomain !== "") cookie += `; Domain=${effectiveDomain}`;
    cookie += `; Path=${path ?? "/"}`;
    if (this.#secure) cookie += "; Secure";
    if (httpOnly ?? true) cookie += "; HttpOnly";

    return cookie;
  }
}
```

Two intentional deviations from upstream, both covered by tests above: the IP-address check runs lazily in `prepare` (upstream throws in the constructor, which would 500 every request made to an IP host), and `octetRegExp` has no `g` flag (upstream's `g` flag makes `.test` stateful, so validation alternates between passing and failing).

- [ ] **Step 10: Migrate the rest of the package to the new request/response**

1. Delete `packages/plugin-api/src/lib/http/ApiRequest.ts` and `packages/plugin-api/src/lib/http/ApiResponse.ts`.
2. Use the Grep tool for `http/ApiRequest|http/ApiResponse|\./ApiRequest|\./ApiResponse` in `packages/plugin-api/src` and `packages/plugin-api/tests`, and repoint every import to `lib/structures/api/ApiRequest` or `lib/structures/api/ApiResponse` with the correct relative path. Expect these files: `lib/structures/Route.ts`, `Middleware.ts`, `MiddlewareStore.ts`, `lib/http/ApiServer.ts` (becomes `../structures/api/ApiRequest`), every file in `src/listeners`, `src/middlewares/headers.ts` and `body.ts`, `src/index.ts`, and `tests/MiddlewareStore.test.ts`. In `src/index.ts`, replace the two `export * from "./lib/http/Api..."` lines for request and response with:

```ts
export * from "./lib/structures/api/ApiRequest";
export * from "./lib/structures/api/ApiResponse";
export * from "./lib/structures/api/CookieStore";
export * from "./lib/structures/http/HttpCodes";
```

3. `src/listeners/PluginServerRequest.ts`: replace `request.query = new URLSearchParams(querystring);` with `request.query = Object.fromEntries(new URLSearchParams(querystring).entries());`, and replace `request.routerNode = branch;` with `request.routerNode = node;`.
4. `src/listeners/PluginRouteError.ts` and `PluginServerMiddlewareError.ts`: replace `response.error()` with `response.error(HttpCodes.InternalServerError)`, importing `HttpCodes` from `../lib/structures/http/HttpCodes`. The generic `Internal Server Error` body is intentional (decision 3).
5. `src/middlewares/body.ts`: replace `response.json({ error: "Payload Too Large" }, HttpCodes.PayloadTooLarge);` with `response.status(HttpCodes.PayloadTooLarge).json({ error: "Payload Too Large" });`, importing `HttpCodes` from `../lib/structures/http/HttpCodes` and dropping it from the framework import.
6. Use the Grep tool for `\.json\(.*,|\.text\(.*,|readBodyText\(|readBodyJson<|noContent\(` in `packages/plugin-api/src` and `packages/plugin-api/tests`. Every two-argument `json(data, status)` becomes `status(code).json(data)`; `readBodyJson<T>()` generics become a cast on the result (for example `(await request.readBodyJson()) as { text: string }` in `tests/ApiServer.test.ts`); Content-Type assertions change from `application/json; charset=utf-8` to `application/json`, and from `text/plain; charset=utf-8` to `text/plain`.

- [ ] **Step 11: Run the tests and static checks**

Run: `pnpm exec vitest run packages/plugin-api`
Expected: PASS for the three new test files and the pre-existing files (`ApiServer.test.ts` keeps its old 404/405/OPTIONS expectations because the listeners and the `headers` middleware stay as they are until Task 5).

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. Fix `implements` signature mismatches as described in Step 6, and any leftover import the typecheck reports.

- [ ] **Step 12: Commit (only if the user authorized commits)**

```bash
git add packages/plugin-api
git commit -m "feat(plugin-api)!: port ApiRequest body readers, ApiResponse helpers and CookieStore"
```

---

### Task 4: `Server`, `Route` and `Middleware` rewrite

**Files:**

- Create: `PKG/src/lib/structures/http/Server.ts`
- Modify: `PKG/src/lib/structures/Route.ts`, `PKG/src/lib/structures/Middleware.ts`, `PKG/src/register.ts`, `PKG/src/index.ts`, `PKG/src/lib/structures/MiddlewareStore.ts`, `PKG/src/lib/structures/RouteStore.ts`, `PKG/src/listeners/*.ts`, `PKG/src/middlewares/*.ts`, `PKG/tests/ApiServer.test.ts`, `PKG/tests/MiddlewareStore.test.ts`
- Delete: `PKG/src/lib/http/ApiServer.ts` (and with it the empty `PKG/src/lib/http/` directory)
- Test: `PKG/tests/Route.test.ts`, `PKG/tests/Server.test.ts`

**Interfaces:**

- Consumes: `RouterRoot.normalize` / `makeRoutePathForPiece` / `extractMethod` (Task 2); `MethodName` (Task 1); `ApiRequest`, `ApiResponse` (Task 3); `RouterBranch` (Task 2).
- Produces:
  - `enum ServerEvent` (`Error = "error"`, `Request = "request"`, `MiddlewareFailure = "middlewareFailure"`, `MiddlewareError = "middlewareError"`, `MiddlewareSuccess = "middlewareSuccess"`, `RouterBranchNotFound = "routerBranchNotFound"`, `RouterBranchMethodNotAllowed = "routerBranchMethodNotAllowed"`, `RouterFound = "routerFound"`, `RouteError = "routeError"`).
  - `interface ServerEvents` with these payloads: `Error: [error: Error, request?: ApiRequest, response?: ApiResponse]`; `Request`, `MiddlewareFailure`, `MiddlewareSuccess`, `RouterBranchNotFound`, `RouterFound: [request, response]`; `RouterBranchMethodNotAllowed: [request, response, branch: RouterBranch]`; `RouteError`, `MiddlewareError: [error: unknown, request, response]`.
  - `interface ServerOptions` (`prefix?`, `origin?`, `maximumBodyLength?`, `server?`, `listenOptions?`, `automaticallyConnect?`), `type AuthLessServerOptions = ServerOptions`, the mime-type helper types, and `class Server extends AsyncEventEmitter<ServerEvents>` with public readonly `routes`, `middlewares`, `server`, `options`, plus `connect(): Promise<void>` and `disconnect(): Promise<void>`.
  - `Route<Options>` with `path: readonly string[]`, `methods: ReadonlySet<MethodName>`, `maximumBodyLength: number`, abstract `run(request: Route.Request, response: Route.Response): Awaitable<unknown>`; `interface RouteOptions`; namespace `Route` (`Context`, `LoaderContext`, `Options`, `JSON`, `LocationJSON`, `Request`, `Response`).
  - `Middleware<Options>` with `position: number`, abstract `run(request: Middleware.Request, response: Middleware.Response): Awaitable<unknown>`; `interface MiddlewareOptions`; namespace `Middleware` (`Request`, `Response`, `Options`, `JSON`, `LocationJSON`, `Context`, `LoaderContext`).

- [ ] **Step 1: Write the failing tests**

Create `packages/plugin-api/tests/Route.test.ts`:

```ts
import { container, VirtualPath } from "@sapphire/pieces";
import { Route } from "../src/lib/structures/Route";
import { makeRoute } from "./shared";

function setServerOptions(options: Record<string, unknown>) {
  (container as unknown as { server: unknown }).server = { options };
}

describe("Route", () => {
  beforeEach(() => setServerOptions({}));

  it("given no methods then the route has none and no GET is implied (decision 8)", () => {
    const route = makeRoute("/hello", []);
    expect(route.methods.size).toBe(0);
  });

  it("given a route option then the path is normalized", () => {
    expect(makeRoute("/a/b/", ["GET"]).path).toStrictEqual(["a", "b"]);
  });

  it("given a server prefix then it is prepended to the path", () => {
    setServerOptions({ prefix: "v1/" });
    expect(makeRoute("/users", ["GET"]).path).toStrictEqual(["v1", "users"]);
  });

  it("given no maximumBodyLength anywhere then the default is 50 MiB", () => {
    expect(makeRoute("/x").maximumBodyLength).toBe(1024 * 1024 * 50);
  });

  it("given a server-wide maximumBodyLength then the route inherits it", () => {
    setServerOptions({ maximumBodyLength: 100 });
    expect(makeRoute("/x").maximumBodyLength).toBe(100);
  });

  it("given a per-route maximumBodyLength then it wins over the server-wide one", () => {
    setServerOptions({ maximumBodyLength: 100 });

    class Limited extends Route {
      public constructor(context: Route.LoaderContext) {
        super(context, { route: "/x", methods: ["POST"], maximumBodyLength: 5 });
      }

      public run(): void {}
    }

    const route = new Limited({
      name: "limited",
      path: VirtualPath,
      root: VirtualPath,
      store: null as never,
    });
    expect(route.maximumBodyLength).toBe(5);
  });

  it("given a piece name with a method suffix then the method and path come from the name", () => {
    class Named extends Route {
      public run(): void {}
    }

    const post = new Named({
      name: "hello.post",
      path: VirtualPath,
      root: VirtualPath,
      store: null as never,
    });
    expect(post.path).toStrictEqual(["hello"]);
    expect([...post.methods]).toStrictEqual(["POST"]);

    const index = new Named({
      name: "index.get",
      path: VirtualPath,
      root: VirtualPath,
      store: null as never,
    });
    expect(index.path).toStrictEqual([]);
    expect([...index.methods]).toStrictEqual(["GET"]);
  });
});
```

Create `packages/plugin-api/tests/Server.test.ts`:

```ts
import { container } from "@sapphire/pieces";
import { createServer, type Server as NetServer } from "node:net";
import { Server, ServerEvent } from "../src/lib/structures/http/Server";

function listenOnFreePort(): Promise<{ blocker: NetServer; port: number }> {
  return new Promise((resolve) => {
    const blocker = createServer();
    blocker.listen(0, "127.0.0.1", () => {
      const address = blocker.address();
      resolve({ blocker, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
}

describe("Server", () => {
  const previous = (container as unknown as { server?: unknown }).server;

  afterEach(() => {
    (container as unknown as { server?: unknown }).server = previous;
  });

  it("given a port already in use then connect rejects with EADDRINUSE (Review Focus 1)", async () => {
    const { blocker, port } = await listenOnFreePort();
    try {
      const server = new Server({ listenOptions: { port, host: "127.0.0.1" } });
      await expect(server.connect()).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it("given an error listener then server errors are forwarded to it instead of throwing", async () => {
    const { blocker, port } = await listenOnFreePort();
    try {
      const server = new Server({ listenOptions: { port, host: "127.0.0.1" } });
      const received: Error[] = [];
      server.on(ServerEvent.Error, (error) => {
        received.push(error);
      });
      await expect(server.connect()).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(received[0]).toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it("given connect then disconnect the server starts and stops cleanly", async () => {
    const server = new Server({ listenOptions: { port: 0, host: "127.0.0.1" } });
    await server.connect();
    await server.disconnect();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/plugin-api/tests/Route.test.ts packages/plugin-api/tests/Server.test.ts`
Expected: FAIL. `Server.test.ts` cannot resolve `../src/lib/structures/http/Server`; `Route.test.ts` fails on the implicit `GET` and on the missing prefix/`maximumBodyLength`.

- [ ] **Step 3: Write `Server.ts`**

Create `packages/plugin-api/src/lib/structures/http/Server.ts`:

```ts
import { AsyncEventEmitter } from "@vladfrangu/async_event_emitter";
import { container } from "@wolfstar/http-framework";
import {
  createServer,
  type Server as NodeHttpServer,
  type ServerOptions as NodeHttpServerOptions,
} from "node:http";
import type { ListenOptions } from "node:net";
import { MiddlewareStore } from "../MiddlewareStore";
import { RouteStore } from "../RouteStore";
import { ApiRequest } from "../api/ApiRequest";
import { ApiResponse } from "../api/ApiResponse";
import type { RouterBranch } from "../router/RouterBranch";

export enum ServerEvent {
  Error = "error",
  Request = "request",
  MiddlewareFailure = "middlewareFailure",
  MiddlewareError = "middlewareError",
  MiddlewareSuccess = "middlewareSuccess",
  RouterBranchNotFound = "routerBranchNotFound",
  RouterBranchMethodNotAllowed = "routerBranchMethodNotAllowed",
  RouterFound = "routerFound",
  RouteError = "routeError",
}

export interface ServerEvents {
  [ServerEvent.Error]: [error: Error, request?: ApiRequest, response?: ApiResponse];
  [ServerEvent.Request]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.MiddlewareFailure]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.MiddlewareError]: [error: unknown, request: ApiRequest, response: ApiResponse];
  [ServerEvent.MiddlewareSuccess]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.RouterBranchNotFound]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.RouterBranchMethodNotAllowed]: [
    request: ApiRequest,
    response: ApiResponse,
    branch: RouterBranch,
  ];
  [ServerEvent.RouterFound]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.RouteError]: [error: unknown, request: ApiRequest, response: ApiResponse];
}

/**
 * The top-level type of a `Content-Type` value, as defined by RFC 1341 section 4.
 * @since 1.0.0
 */
export type ContentTypeType =
  | "application"
  | "audio"
  | "font"
  | "haptics"
  | "image"
  | "message"
  | "model"
  | "multipart"
  | "text"
  | "video";

/**
 * A `Content-Type` parameter, for example `charset=utf-8`.
 * @since 1.0.0
 */
export type ContentTypeParameter = `${string}=${string}`;

/**
 * A `type/subtype` mime type.
 * @since 1.0.0
 */
export type GenericMimeType = `${ContentTypeType}/${string}`;

/**
 * A `type/subtype; parameter` mime type.
 * @since 1.0.0
 */
export type GenericParametrizedMimeType = `${GenericMimeType}; ${ContentTypeParameter}`;

export interface ServerOptions {
  /**
   * A path segment prefix applied to every route, e.g. `/api`.
   */
  prefix?: string;

  /**
   * The value of the `Access-Control-Allow-Origin` header set by the built-in `headers` middleware.
   * @default '*'
   */
  origin?: string;

  /**
   * The maximum request body size in bytes, enforced by the built-in `body` middleware. A route can
   * lower or raise it with `RouteOptions.maximumBodyLength`.
   * @default 1024 * 1024 * 50
   */
  maximumBodyLength?: number;

  /**
   * Raw options forwarded to `node:http`'s `createServer`.
   */
  server?: NodeHttpServerOptions;

  /**
   * Raw options forwarded to `Server#listen`.
   * @default { port: 4000 }
   */
  listenOptions?: ListenOptions;

  /**
   * Whether to start listening automatically once the interaction webhook is up (during the
   * `postListen` plugin hook).
   * @default true
   */
  automaticallyConnect?: boolean;
}

/**
 * Upstream separates the auth-enabled options from the auth-less ones; auth is not implemented here,
 * so they are the same type.
 */
export type AuthLessServerOptions = ServerOptions;

/**
 * A standalone HTTP server for auxiliary REST routes (health checks, dashboards, webhooks from
 * other services, etc). It is deliberately independent from `Client.server`, which is
 * reserved for the Discord interactions webhook.
 */
export class Server extends AsyncEventEmitter<ServerEvents> {
  public readonly routes: RouteStore;
  public readonly middlewares: MiddlewareStore;
  public readonly server: NodeHttpServer<typeof ApiRequest, typeof ApiResponse>;
  public readonly options: ServerOptions;

  public constructor(options: ServerOptions = {}) {
    super();

    container.server = this;

    this.options = options;

    const serverOptions: NodeHttpServerOptions<typeof ApiRequest, typeof ApiResponse> = {
      ...options.server,
      IncomingMessage: ApiRequest,
      ServerResponse: ApiResponse,
    };
    this.server = createServer(serverOptions);

    this.routes = new RouteStore();
    this.middlewares = new MiddlewareStore();

    // `emit("error")` throws when nobody listens, and an unhandled throw inside a `node:http` event
    // handler would crash the process (for example on EADDRINUSE); `connect()` reports it instead.
    this.server.on("error", (error) => {
      if (this.listenerCount(ServerEvent.Error) > 0) this.emit(ServerEvent.Error, error);
    });
    this.server.on("request", (request, response) =>
      this.emit(ServerEvent.Request, request, response),
    );
  }

  /**
   * Starts listening for requests. Rejects if the server fails to bind or closes before it is listening.
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.server.off("listening", onListening);
        this.server.off("error", onError);
        this.server.off("close", onClose);
      };
      const onListening = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error("Closed unexpectedly."));
      };

      this.server.on("listening", onListening);
      this.server.on("error", onError);
      this.server.on("close", onClose);
      this.server.listen({ port: 4000, ...this.options.listenOptions });
    });
  }

  /**
   * Stops the server from accepting new connections.
   */
  public disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
```

- [ ] **Step 4: Rewrite `Route.ts`**

Replace `packages/plugin-api/src/lib/structures/Route.ts`:

```ts
import { Piece, type PieceOptions } from "@sapphire/pieces";
import type { Awaitable } from "../utils/common";
import type { ApiRequest } from "./api/ApiRequest";
import type { ApiResponse } from "./api/ApiResponse";
import type { MethodName } from "./http/HttpMethods";
import { RouterRoot } from "./router/RouterRoot";

/**
 * The base class for every route. A route answers the `methods` it declares on `path`; a route that
 * declares no methods (through `options.methods` or a `name.method` piece name) matches nothing.
 */
export abstract class Route<Options extends Route.Options = Route.Options> extends Piece<
  Options,
  "routes"
> {
  /**
   * The path segments of the route, prefix included.
   */
  public readonly path: readonly string[];

  /**
   * The methods this route answers.
   */
  public readonly methods: ReadonlySet<MethodName>;

  /**
   * The maximum request body size in bytes for this route.
   */
  public readonly maximumBodyLength: number;

  public constructor(context: Route.LoaderContext, options: Options = {} as Options) {
    super(context, options);

    const api = this.container.server.options;
    const methods = new Set<MethodName>(options.methods ?? []);
    const path = RouterRoot.normalize(api.prefix);

    if (options.route !== undefined) {
      path.push(...RouterRoot.normalize(options.route));
    } else {
      const name = this.name;
      const implied = RouterRoot.extractMethod(name);
      if (implied !== null) methods.add(implied);

      const routeName = implied === null ? name : name.slice(0, name.lastIndexOf("."));
      path.push(
        ...RouterRoot.normalize(
          RouterRoot.makeRoutePathForPiece(this.location.directories, routeName),
        ),
      );
    }

    this.path = path;
    this.methods = methods;
    this.maximumBodyLength = options.maximumBodyLength ?? api.maximumBodyLength ?? 1024 * 1024 * 50;
  }

  /**
   * Runs when a request matches this route. Errors thrown here are emitted as `ServerEvent.RouteError`.
   */
  public abstract run(request: Route.Request, response: Route.Response): Awaitable<unknown>;

  public override toJSON(): Route.JSON {
    return {
      ...super.toJSON(),
      options: {
        ...this.options,
        methods: [...this.methods],
        route: `/${this.path.join("/")}`,
        maximumBodyLength: this.maximumBodyLength,
      },
    };
  }
}

export interface RouteOptions extends PieceOptions {
  /**
   * The route the route answers, for example `/users/[id]`. If omitted, it is derived from the file
   * path and the piece name.
   */
  route?: string;

  /**
   * The maximum request body size in bytes for this route. Falls back to `ServerOptions.maximumBodyLength`.
   */
  maximumBodyLength?: number;

  /**
   * The methods the route answers. A `name.method` piece name adds its method to this list.
   */
  methods?: readonly MethodName[];
}

export namespace Route {
  /** @deprecated Use {@link Route.LoaderContext} instead. */
  export type Context = LoaderContext;
  export type LoaderContext = Piece.LoaderContext<"routes">;
  export type Options = RouteOptions;
  export type JSON = Piece.JSON;
  export type LocationJSON = Piece.LocationJSON;
  export type Request = ApiRequest;
  export type Response = ApiResponse;
}
```

Notes for the implementer: (1) `toJSON` must compile against the `Piece.JSON` type of the installed `@sapphire/pieces`; if its `options` field is typed differently, keep only `...super.toJSON()` and drop the `options` override rather than casting. (2) `this.container.server` is typed by the `Container` augmentation in `src/index.ts`, which this task updates in Step 8.

- [ ] **Step 5: Rewrite `Middleware.ts`**

Replace `packages/plugin-api/src/lib/structures/Middleware.ts`:

```ts
import { Piece, type PieceOptions } from "@sapphire/pieces";
import type { Awaitable } from "../utils/common";
import type { ApiRequest } from "./api/ApiRequest";
import type { ApiResponse } from "./api/ApiResponse";

/**
 * The base class for every middleware. Middlewares run in ascending `position` order before the
 * route is resolved. The built-in ones sit at `headers` 10, `body` 20 and `cookies` 30.
 */
export abstract class Middleware<
  Options extends Middleware.Options = Middleware.Options,
> extends Piece<Options, "middlewares"> {
  /**
   * The position of the middleware; lower runs first.
   */
  public readonly position: number;

  public constructor(context: Middleware.LoaderContext, options: Options = {} as Options) {
    super(context, options);
    this.position = options.position ?? 1000;
  }

  /**
   * Runs for every request. Ending the response stops the remaining middlewares and the route.
   */
  public abstract run(
    request: Middleware.Request,
    response: Middleware.Response,
  ): Awaitable<unknown>;

  public override toJSON(): Middleware.JSON {
    return {
      ...super.toJSON(),
      options: { ...this.options, position: this.position },
    };
  }
}

export interface MiddlewareOptions extends PieceOptions {
  /**
   * The position of the middleware; lower runs first.
   * @default 1000
   */
  position?: number;
}

export namespace Middleware {
  export type Request = ApiRequest;
  export type Response = ApiResponse;
  export type Options = MiddlewareOptions;
  export type JSON = Piece.JSON;
  export type LocationJSON = Piece.LocationJSON;
  /** @deprecated Use {@link Middleware.LoaderContext} instead. */
  export type Context = LoaderContext;
  export type LoaderContext = Piece.LoaderContext<"middlewares">;
}
```

The same `toJSON` note as for `Route` applies.

- [ ] **Step 6: Replace `ApiServer` with `Server` everywhere**

1. Delete `packages/plugin-api/src/lib/http/ApiServer.ts`.
2. Use the Grep tool for `ApiServer|ApiServerEvent|ApiServerOptions|ApiServerEvents|lib/http` in `packages/plugin-api/src` and `packages/plugin-api/tests`. Rename `ApiServer` to `Server`, `ApiServerEvent` to `ServerEvent`, `ApiServerOptions` to `ServerOptions`, `ApiServerEvents` to `ServerEvents`, and repoint imports to `lib/structures/http/Server` with the right relative path. Files to expect: `src/register.ts`, `src/index.ts`, every file in `src/listeners`, `src/lib/structures/MiddlewareStore.ts` / `RouteStore.ts` if they reference the server, `tests/ApiServer.test.ts`, `tests/MiddlewareStore.test.ts`. (Keep the test file name `ApiServer.test.ts`; Task 5 rewrites its contents.)
3. In `src/index.ts`, replace `export * from "./lib/http/ApiServer";` with `export * from "./lib/structures/http/Server";` and update the three type imports (`ApiServer, ApiServerOptions` become `Server, ServerOptions`) and the `declare module` blocks: `ClientOptions.api?: ServerOptions;` and `interface Container { server: Server }`.
4. In `src/register.ts`, import `Server` from `./lib/structures/http/Server` and use `new Server(options.api)`.
5. Delete the now-empty `packages/plugin-api/src/lib/http/` directory.
6. Existing listener classes that call `response.notFound()` / `response.methodNotAllowed()` keep working with the new `ApiResponse` helpers.

- [ ] **Step 7: Run the tests and static checks**

Run: `pnpm exec vitest run packages/plugin-api`
Expected: PASS, including `Route.test.ts` and `Server.test.ts`. If `ApiServer.test.ts` fails because a route in it relied on the implicit `GET`, give that route `methods: ["GET"]` (or a `.get` name suffix): this is the decision 8 change, and the fix belongs in the test.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 8: Commit (only if the user authorized commits)**

```bash
git add packages/plugin-api
git commit -m "feat(plugin-api)!: rename ApiServer to Server, add prefix and per-route body limits, drop implicit GET"
```

---

### Task 5: Middlewares (`headers`, `body`, `cookies`) and the listener chain

**Files:**

- Create: `PKG/src/middlewares/cookies.ts`, `PKG/src/listeners/PluginServerMiddlewareSuccess.ts`
- Modify: `PKG/src/middlewares/headers.ts`, `PKG/src/middlewares/body.ts`, `PKG/src/middlewares/_load.ts`, `PKG/src/listeners/PluginServerRequest.ts`, `PluginServerRouterFound.ts`, `PluginServerRouterBranchNotFound.ts`, `PluginServerRouterBranchMethodNotAllowed.ts`, `PluginServerMiddlewareError.ts`, `PluginRouteError.ts`, `PKG/src/listeners/_load.ts`
- Test: `PKG/tests/ApiServer.test.ts` (rewritten)

**Interfaces:**

- Consumes: `Server`, `ServerEvent` (Task 4); `CookieStore` (Task 3); `RouterNode`, `RouterBranch`, `RouterRoot.normalize` (Task 2); `Middleware`, `Route` (Task 4); `HttpCodes` (Task 3).
- Produces:
  - Built-in middlewares `HeadersMiddleware` (position 10), `BodyMiddleware` (20), `CookiesMiddleware` (30); `loadMiddlewares()` registers `body`, `cookies`, `headers`.
  - `loadListeners()` registers seven PascalCase pieces: `PluginRouteError`, `PluginServerMiddlewareError`, `PluginServerMiddlewareSuccess`, `PluginServerRequest`, `PluginServerRouterBranchMethodNotAllowed`, `PluginServerRouterBranchNotFound`, `PluginServerRouterFound`.
  - Event chain: `Request` -> middlewares (`MiddlewareError` on throw) -> `RouterBranchNotFound` / `RouterBranchMethodNotAllowed(request, response, branch)` / `RouterFound`; `RouterFound` emits `MiddlewareFailure` when the response has ended, otherwise `MiddlewareSuccess`; `MiddlewareSuccess` runs the route and emits `RouteError` on a throw.

- [ ] **Step 1: Rewrite the integration test (failing)**

Replace `packages/plugin-api/tests/ApiServer.test.ts`:

```ts
import { container } from "@wolfstar/http-framework";
import { request as httpRequest } from "node:http";
import { Route } from "../src/lib/structures/Route";
import { Server } from "../src/lib/structures/http/Server";
import { loadListeners } from "../src/listeners/_load";
import { loadMiddlewares } from "../src/middlewares/_load";

class GreetRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/greet/[name]", methods: ["GET"] });
  }

  public override run(request: Route.Request, response: Route.Response): void {
    response.json({ message: `Hello, ${request.params.name}!` });
  }
}

class EchoRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/echo", methods: ["POST"] });
  }

  public override async run(request: Route.Request, response: Route.Response): Promise<void> {
    const body = (await request.readBodyJson()) as { text: string };
    response.json({ echo: body.text });
  }
}

class LimitedRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/limited", methods: ["POST"], maximumBodyLength: 5 });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.ok();
  }
}

class CookiesRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/cookies", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.json(Object.fromEntries(response.cookies));
  }
}

class SetCookieRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/set-cookie", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.cookies.add("session", "abc", { domain: "example.com" });
    response.ok();
  }
}

class SetCookieWithoutDomainRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/set-cookie-default", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.cookies.add("session", "abc");
    response.ok();
  }
}

class JsonRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/json", methods: ["POST"] });
  }

  public override async run(request: Route.Request, response: Route.Response): Promise<void> {
    response.json(await request.readBodyJson());
  }
}

class BoomRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/boom", methods: ["GET"] });
  }

  public override run(): void {
    throw new Error("secret failure detail");
  }
}

class NoMethodsRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/no-methods", methods: [] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.ok();
  }
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function rawRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: options.method ?? "GET", headers: options.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

describe("Server (integration)", () => {
  let server: Server;
  let baseUrl: string;
  const fatal = vi.fn();

  beforeAll(async () => {
    // `container.logger` is only assigned by the framework's `Client` constructor.
    container.logger = {
      fatal,
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as never;

    server = new Server({ listenOptions: { port: 0, host: "127.0.0.1" } });

    container.stores //
      .register(server.routes)
      .register(server.middlewares);

    await loadMiddlewares();
    await loadListeners();

    for (const [name, piece] of [
      ["greet", GreetRoute],
      ["echo", EchoRoute],
      ["limited", LimitedRoute],
      ["cookies", CookiesRoute],
      ["setCookie", SetCookieRoute],
      ["setCookieDefault", SetCookieWithoutDomainRoute],
      ["json", JsonRoute],
      ["boom", BoomRoute],
      ["noMethods", NoMethodsRoute],
    ] as const) {
      await server.routes.loadPiece({ name, piece });
    }

    // `loadPiece` only queues pieces; flushing them is normally `client.load()`'s job.
    await container.stores.load();

    await server.connect();

    const address = server.server.address();
    if (address === null || typeof address === "string") throw new Error("Expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => fatal.mockClear());

  afterAll(async () => {
    await server.disconnect();
  });

  it("given a dynamic route then extracts the param and responds with json", async () => {
    const response = await fetch(`${baseUrl}/greet/world`);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Authorization, User-Agent, Content-Type",
    );
    await expect(response.json()).resolves.toStrictEqual({ message: "Hello, world!" });
  });

  it("given a POST route then reads the request body", async () => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ echo: "hi" });
  });

  it("given an unregistered path then responds with an empty 404", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(fatal).not.toHaveBeenCalled();
  });

  it("given the root path without a route then responds with 404", async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(404);
  });

  it("given a registered path with the wrong method then responds with an empty 405 listing the allowed methods", async () => {
    const response = await fetch(`${baseUrl}/greet/world`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET");
    expect(fatal).not.toHaveBeenCalled();
  });

  it("given an OPTIONS preflight then responds with an empty 200 and the route's methods", async () => {
    const response = await fetch(`${baseUrl}/greet/world`, { method: "OPTIONS" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET");
    expect(fatal).not.toHaveBeenCalled();
  });

  it("given a route declared with no methods then its path answers 404", async () => {
    const response = await fetch(`${baseUrl}/no-methods`);
    expect(response.status).toBe(404);
  });

  it("given a request declaring an oversized body then responds with 413", async () => {
    const response = await rawRequest(`${baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(1024 * 1024 * 100) },
    });
    expect(response.status).toBe(413);
  });

  it("given a route with its own maximumBodyLength then that limit is enforced", async () => {
    const response = await rawRequest(`${baseUrl}/limited`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "0123456789",
    });
    expect(response.status).toBe(413);
    expect(JSON.parse(response.body)).toStrictEqual({ error: "Exceeded maximum content length." });
  });

  it("given a malformed percent-encoded param then the raw value is used", async () => {
    const response = await rawRequest(`${baseUrl}/greet/%E0%A4%A`);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({ message: "Hello, %E0%A4%A!" });
  });

  it("given a Cookie header then response.cookies exposes it", async () => {
    const response = await rawRequest(`${baseUrl}/cookies`, {
      headers: { cookie: "a=1; b=hello%20world" },
    });
    expect(JSON.parse(response.body)).toStrictEqual({ a: "1", b: "hello world" });
  });

  it("given a malformed Cookie header then the bad pairs are skipped and the request succeeds (Review Focus 4)", async () => {
    const response = await rawRequest(`${baseUrl}/cookies`, {
      headers: { cookie: "a=1; bad=%E0%A4%A; noequals; c=3" },
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({ a: "1", c: "3" });
  });

  it("given a request to an IP host then the request itself does not fail through the cookies middleware (Review Focus 2)", async () => {
    const response = await fetch(`${baseUrl}/greet/ip`);
    expect(response.status).toBe(200);
  });

  it("given an IP host and an explicit cookie domain then Set-Cookie is written (Review Focus 2)", async () => {
    const response = await fetch(`${baseUrl}/set-cookie`);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toStrictEqual([
      "session=abc; Domain=example.com; Path=/; HttpOnly",
    ]);
  });

  it("given an IP host and no cookie domain then add fails as a route error with a generic 500", async () => {
    const response = await fetch(`${baseUrl}/set-cookie-default`);
    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({ error: "Internal Server Error" });
    expect(fatal).toHaveBeenCalledOnce();
  });

  it("given an invalid JSON body then the route error becomes a generic 500 that does not leak the message (Review Focus 3)", async () => {
    const response = await rawRequest(`${baseUrl}/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(response.status).toBe(500);
    expect(JSON.parse(response.body)).toStrictEqual({ error: "Internal Server Error" });
    expect(fatal).toHaveBeenCalledOnce();
  });

  it("given a route that throws then responds with a generic 500 and logs the error", async () => {
    const response = await fetch(`${baseUrl}/boom`);
    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({ error: "Internal Server Error" });
    expect(fatal).toHaveBeenCalledOnce();
    expect((fatal.mock.calls[0][0] as Error).message).toBe("secret failure detail");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/plugin-api/tests/ApiServer.test.ts`
Expected: FAIL. The old `headers` middleware answers `OPTIONS` with 204 and a JSON `notFound`/`methodNotAllowed` body, no `cookies` middleware exists (`response.cookies` is undefined), and the error listeners still call `console.error`.

- [ ] **Step 3: Write the middlewares**

Replace `packages/plugin-api/src/middlewares/headers.ts`:

```ts
import { container } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { Middleware } from "../lib/structures/Middleware";
import type { RouterNode } from "../lib/structures/router/RouterNode";
import { isNullish } from "../lib/utils/common";

/**
 * Sets the CORS and `Date` headers, and ends the response early for `OPTIONS` requests, unknown
 * paths (404) and unsupported methods (405).
 */
export class HeadersMiddleware extends Middleware {
  private readonly origin: string;

  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 10 });
    this.origin = container.server.options.origin ?? "*";
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    response.setHeader("Date", new Date().toUTCString());
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Origin", this.origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, User-Agent, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", this.getMethods(request.routerNode));

    this.ensurePotentialEarlyExit(request, response);
  }

  private getMethods(routerNode: RouterNode | null | undefined): string {
    if (isNullish(routerNode)) return container.server.routes.router.supportedMethods.join(", ");
    return [...routerNode.methods()].join(", ");
  }

  private ensurePotentialEarlyExit(request: ApiRequest, response: ApiResponse): void {
    if (request.method === "OPTIONS" && !request.route?.methods.has("OPTIONS")) {
      response.end();
    } else if (request.routerNode === null) {
      response.status(HttpCodes.NotFound).end();
    } else if (request.route === null) {
      response.status(HttpCodes.MethodNotAllowed).end();
    }
  }
}
```

Replace `packages/plugin-api/src/middlewares/body.ts`:

```ts
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { Middleware } from "../lib/structures/Middleware";

/**
 * Rejects requests whose declared `content-length` exceeds the matched route's `maximumBodyLength`.
 * Chunked bodies without a `content-length` are not length-limited.
 */
export class BodyMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 20 });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    if (!request.route) return;

    const contentLength = request.headers["content-length"];
    if (typeof request.headers["content-type"] !== "string" || typeof contentLength !== "string") {
      return;
    }

    if (Number(contentLength) > request.route.maximumBodyLength) {
      response
        .status(HttpCodes.PayloadTooLarge)
        .json({ error: "Exceeded maximum content length." });
    }
  }
}
```

Create `packages/plugin-api/src/middlewares/cookies.ts`:

```ts
import { CookieStore } from "../lib/structures/api/CookieStore";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { Middleware } from "../lib/structures/Middleware";

/**
 * Creates `response.cookies`. Cookies are marked `Secure` when `NODE_ENV` is `production`.
 */
export class CookiesMiddleware extends Middleware {
  private readonly production = process.env.NODE_ENV === "production";

  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 30 });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    response.cookies = new CookieStore(request, response, this.production);
  }
}
```

Replace `packages/plugin-api/src/middlewares/_load.ts`:

```ts
import { container } from "@wolfstar/http-framework";
import { BodyMiddleware } from "./body";
import { CookiesMiddleware } from "./cookies";
import { HeadersMiddleware } from "./headers";

/**
 * Registers the built-in middlewares (`body`, `cookies`, `headers`) into {@link Server.middlewares}.
 */
export async function loadMiddlewares(): Promise<void> {
  await Promise.all([
    container.stores.loadPiece({ store: "middlewares", name: "body", piece: BodyMiddleware }),
    container.stores.loadPiece({ store: "middlewares", name: "cookies", piece: CookiesMiddleware }),
    container.stores.loadPiece({ store: "middlewares", name: "headers", piece: HeadersMiddleware }),
  ]);
}
```

- [ ] **Step 4: Write the listeners**

Replace `packages/plugin-api/src/listeners/PluginServerRequest.ts`:

```ts
import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import type { MethodName } from "../lib/structures/http/HttpMethods";
import { ServerEvent } from "../lib/structures/http/Server";
import { RouterRoot } from "../lib/structures/router/RouterRoot";

function splitUrl(url = "/"): [pathname: string, querystring: string] {
  const index = url.indexOf("?");
  return index === -1 ? [url, ""] : [url.slice(0, index), url.slice(index + 1)];
}

/**
 * Resolves the route for a request, runs the middlewares, then dispatches the router event.
 */
export class PluginServerRequestListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.Request });
  }

  public override async run(request: ApiRequest, response: ApiResponse): Promise<void> {
    const [pathname, querystring] = splitUrl(request.url);
    request.query = Object.fromEntries(new URLSearchParams(querystring).entries());

    const parts = RouterRoot.normalize(pathname);
    const branch = container.server.routes.router.find(parts);
    const node = branch?.node ?? null;
    const route = node?.get((request.method ?? "GET") as MethodName) ?? null;

    if (node) request.params = node.extractParameters(parts);
    request.routerNode = node;
    request.route = route;

    try {
      await container.server.middlewares.run(request, response);
    } catch (error) {
      container.server.emit(ServerEvent.MiddlewareError, error, request, response);
      return;
    }

    if (branch === null) {
      container.server.emit(ServerEvent.RouterBranchNotFound, request, response);
    } else if (route === null) {
      container.server.emit(ServerEvent.RouterBranchMethodNotAllowed, request, response, branch);
    } else {
      container.server.emit(ServerEvent.RouterFound, request, response);
    }
  }
}
```

Replace `packages/plugin-api/src/listeners/PluginServerRouterFound.ts`:

```ts
import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Reports whether the middlewares let the request through (`MiddlewareSuccess`) or already ended
 * the response (`MiddlewareFailure`).
 */
export class PluginServerRouterFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouterFound });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    if (response.writableEnded) {
      container.server.emit(ServerEvent.MiddlewareFailure, request, response);
    } else {
      container.server.emit(ServerEvent.MiddlewareSuccess, request, response);
    }
  }
}
```

Create `packages/plugin-api/src/listeners/PluginServerMiddlewareSuccess.ts`:

```ts
import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Runs the matched route once every middleware passed; a throw is reported as `RouteError`.
 */
export class PluginServerMiddlewareSuccessListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.MiddlewareSuccess });
  }

  public override async run(request: ApiRequest, response: ApiResponse): Promise<void> {
    try {
      await request.route!.run(request, response);
    } catch (error) {
      container.server.emit(ServerEvent.RouteError, error, request, response);
    }
  }
}
```

Replace `packages/plugin-api/src/listeners/PluginServerRouterBranchNotFound.ts`:

```ts
import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Responds with a 404 when no route matched the path and no middleware ended the response.
 */
export class PluginServerRouterBranchNotFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouterBranchNotFound });
  }

  public override run(_request: ApiRequest, response: ApiResponse): void {
    if (!response.writableEnded) response.notFound();
  }
}
```

Replace `packages/plugin-api/src/listeners/PluginServerRouterBranchMethodNotAllowed.ts`:

```ts
import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";
import type { RouterBranch } from "../lib/structures/router/RouterBranch";

/**
 * Responds with a 405 when the path matched but the method did not, and no middleware ended the response.
 */
export class PluginServerRouterBranchMethodNotAllowedListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouterBranchMethodNotAllowed });
  }

  public override run(_request: ApiRequest, response: ApiResponse, _branch: RouterBranch): void {
    if (!response.writableEnded) response.methodNotAllowed();
  }
}
```

Replace `packages/plugin-api/src/listeners/PluginServerMiddlewareError.ts`:

```ts
import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Logs the error and responds with a generic 500 when a middleware throws.
 */
export class PluginServerMiddlewareErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.MiddlewareError });
  }

  public override run(error: unknown, _request: ApiRequest, response: ApiResponse): void {
    this.container.logger.fatal(error);
    if (!response.writableEnded) response.error(HttpCodes.InternalServerError);
  }
}
```

Replace `packages/plugin-api/src/listeners/PluginRouteError.ts`:

```ts
import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Logs the error and responds with a generic 500 when a route throws. The error message is never
 * sent to the client.
 */
export class PluginRouteErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouteError });
  }

  public override run(error: unknown, _request: ApiRequest, response: ApiResponse): void {
    this.container.logger.fatal(error);
    if (!response.writableEnded) response.error(HttpCodes.InternalServerError);
  }
}
```

Replace `packages/plugin-api/src/listeners/_load.ts`:

```ts
import { container } from "@wolfstar/http-framework";
import { PluginRouteErrorListener } from "./PluginRouteError";
import { PluginServerMiddlewareErrorListener } from "./PluginServerMiddlewareError";
import { PluginServerMiddlewareSuccessListener } from "./PluginServerMiddlewareSuccess";
import { PluginServerRequestListener } from "./PluginServerRequest";
import { PluginServerRouterBranchMethodNotAllowedListener } from "./PluginServerRouterBranchMethodNotAllowed";
import { PluginServerRouterBranchNotFoundListener } from "./PluginServerRouterBranchNotFound";
import { PluginServerRouterFoundListener } from "./PluginServerRouterFound";

/**
 * Registers the built-in dispatch-pipeline listeners into the framework's existing listener
 * store, targeting the `server` container entry (see {@link Server}).
 */
export async function loadListeners(): Promise<void> {
  await Promise.all([
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginRouteError",
      piece: PluginRouteErrorListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerMiddlewareError",
      piece: PluginServerMiddlewareErrorListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerMiddlewareSuccess",
      piece: PluginServerMiddlewareSuccessListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRequest",
      piece: PluginServerRequestListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRouterBranchMethodNotAllowed",
      piece: PluginServerRouterBranchMethodNotAllowedListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRouterBranchNotFound",
      piece: PluginServerRouterBranchNotFoundListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRouterFound",
      piece: PluginServerRouterFoundListener,
    }),
  ]);
}
```

- [ ] **Step 5: Run the tests and static checks**

Run: `pnpm exec vitest run packages/plugin-api`
Expected: PASS for every file. If a cookie or malformed-param test fails because the client normalized the request (for example `fetch` rewriting the URL), that test already uses the raw `node:http` helper; do not weaken the assertion.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. If `this.container.logger` is not typed on `Listener`, import `container` from `@wolfstar/http-framework` and use `container.logger.fatal(error)`.

- [ ] **Step 6: Commit (only if the user authorized commits)**

```bash
git add packages/plugin-api
git commit -m "feat(plugin-api)!: port the headers/body/cookies middlewares and the middleware success/failure chain"
```

---

### Task 6: Public entrypoints (`index.ts`, `register.ts`) and the injected `version`

**Files:**

- Modify: `PKG/src/index.ts`, `PKG/src/register.ts`
- Test: `PKG/tests/index.test.ts`

**Interfaces:**

- Consumes: everything produced by Tasks 1-5 (`ApiRequest`, `ApiResponse`, `CookieStore`, `HttpCodes`, `MethodNames`/`MethodName`, `Server`/`ServerOptions`, `Middleware`, `MiddlewareStore`, `Route`, `RouteStore`, `RouterBranch`, `RouterNode`, `RouterRoot`, `loadListeners`, `loadMiddlewares`).
- Produces: the package's public surface (`@wolfstar/plugin-api`): all of the above re-exported, `export type *` from `@sapphire/iana-mime-types`, `version: string`, `ClientOptions.api?: ServerOptions`, `Container.server: Server`, `StoreRegistryEntries.routes/middlewares`; and `Api` (the renamed `ApiPlugin`) from `@wolfstar/plugin-api/register`.

Deviation from the spec: `lib/structures/Augmentations.d.ts` is **not** created. The `declare module` blocks stay in `index.ts` (they already work, are emitted into the built `.d.ts`, and typedoc reads `index.ts`); a second copy would only duplicate them.

- [ ] **Step 1: Write the failing test**

Create `packages/plugin-api/tests/index.test.ts`:

```ts
import * as api from "../src/index";

function isClass(value: unknown): boolean {
  return typeof value === "function" && /^class\s/.test(Function.prototype.toString.call(value));
}

describe("index exports", () => {
  it.each([
    "ApiRequest",
    "ApiResponse",
    "CookieStore",
    "Middleware",
    "MiddlewareStore",
    "Route",
    "RouteStore",
    "RouterBranch",
    "RouterNode",
    "RouterRoot",
    "Server",
  ])("given the %s export then it is a class", (name) => {
    expect(isClass((api as Record<string, unknown>)[name])).toBe(true);
  });

  it("given the loaders then both are exported functions", () => {
    expect(typeof api.loadListeners).toBe("function");
    expect(typeof api.loadMiddlewares).toBe("function");
  });

  it("given the enums and constants then they are exported", () => {
    expect(api.ServerEvent.RouterFound).toBe("routerFound");
    expect(api.HttpCodes.OK).toBe(200);
    expect(api.MethodNames).toContain("GET");
  });

  it("given the removed 1.x names then they are no longer exported", () => {
    expect((api as Record<string, unknown>).ApiServer).toBeUndefined();
    expect((api as Record<string, unknown>).ApiServerEvent).toBeUndefined();
  });

  it("given the version export then it is a string", () => {
    expect(typeof api.version).toBe("string");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/plugin-api/tests/index.test.ts`
Expected: FAIL. `index.ts` still exports from the deleted `./lib/http/*` files (module resolution error), so the file cannot even load.

- [ ] **Step 3: Rewrite `index.ts` and `register.ts`**

Replace `packages/plugin-api/src/index.ts`:

```ts
import type { MiddlewareStore } from "./lib/structures/MiddlewareStore";
import type { RouteStore } from "./lib/structures/RouteStore";
import type { Server, ServerOptions } from "./lib/structures/http/Server";

export * from "./lib/structures/api/ApiRequest";
export * from "./lib/structures/api/ApiResponse";
export * from "./lib/structures/api/CookieStore";
export * from "./lib/structures/http/HttpCodes";
export * from "./lib/structures/http/HttpMethods";
export * from "./lib/structures/http/Server";
export * from "./lib/structures/Middleware";
export * from "./lib/structures/MiddlewareStore";
export * from "./lib/structures/Route";
export * from "./lib/structures/router/RouterBranch";
export * from "./lib/structures/router/RouterNode";
export * from "./lib/structures/router/RouterRoot";
export * from "./lib/structures/RouteStore";

export type * from "@sapphire/iana-mime-types";

export { loadListeners } from "./listeners/_load";
export { loadMiddlewares } from "./middlewares/_load";

/**
 * The `@wolfstar/plugin-api` version, replaced with the `package.json` version at build time by
 * `@redstardev/unplugin-version-injector`.
 */
export const version: string = "[VI]{{inject}}[/VI]";

declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    /**
     * Options for the auxiliary REST API server registered by `@wolfstar/plugin-api`.
     */
    api?: ServerOptions;
  }
}

declare module "@sapphire/pieces" {
  interface StoreRegistryEntries {
    routes: RouteStore;
    middlewares: MiddlewareStore;
  }

  interface Container {
    /**
     * The auxiliary REST API server registered by `@wolfstar/plugin-api`. Independent from the
     * Discord interactions webhook server (`Client#server`).
     */
    server: Server;
  }
}
```

Replace `packages/plugin-api/src/register.ts`:

````ts
import {
  Client,
  container,
  Plugin,
  postInitialization,
  postListen,
  type ClientOptions,
} from "@wolfstar/http-framework";
import "./index";
import { Server } from "./lib/structures/http/Server";
import { loadListeners } from "./listeners/_load";
import { loadMiddlewares } from "./middlewares/_load";

/**
 * Registers a standalone {@link Server} for auxiliary REST routes (health checks, dashboards,
 * webhooks from other services, etc), independent from the Discord interactions webhook server.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-api/register';
 * ```
 */
export class Api extends Plugin {
  public static [postInitialization](this: Client, options: ClientOptions): void {
    const server = new Server(options.api);

    container.stores //
      .register(server.routes)
      .register(server.middlewares);

    loadListeners().catch((error: unknown) =>
      console.error("[plugin-api] Failed to load listeners:", error),
    );
    loadMiddlewares().catch((error: unknown) =>
      console.error("[plugin-api] Failed to load middlewares:", error),
    );
  }

  public static async [postListen](this: Client, options: ClientOptions): Promise<void> {
    if ((options.api?.automaticallyConnect ?? true) === false) return;
    await container.server.connect();
  }
}

Client.plugins.registerPostInitializationHook(
  Api[postInitialization],
  "WolfStar-Api-PostInitialization",
);
Client.plugins.registerPostListenHook(Api[postListen], "WolfStar-Api-PostListen");
````

- [ ] **Step 4: Run the whole package's tests and static checks**

Run: `pnpm exec vitest run packages/plugin-api`
Expected: PASS for every file.

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. Any leftover import of `./lib/http/*` or of the old names (`ApiServer`, `ApiServerEvent`, `ApiServerOptions`, `ApiPlugin`) is a bug; find them with the Grep tool for `lib/http|ApiServer|ApiPlugin` over `packages/plugin-api/src` and `packages/plugin-api/tests` (expect zero matches outside comments that describe the migration).

- [ ] **Step 5: Build and verify the version injection**

Run: `pnpm --filter @wolfstar/plugin-api build`
Expected: build succeeds, including the `attw` and `publint` checks for `.` and `./register`.

Then use the Grep tool on `packages/plugin-api/dist/esm/index.js` for `\[VI\]` (expect no match) and for the value of `version` in `packages/plugin-api/package.json` (expect it inside a `const version = "<x.y.z>"` line). If `[VI]` is still present, the plugin did not run: check `plugins: [VersionInjector()]` in `packages/plugin-api/tsdown.config.ts` and that the tag in `index.ts` is exactly `[VI]{{inject}}[/VI]`.

- [ ] **Step 6: Commit (only if the user authorized commits)**

```bash
git add packages/plugin-api/src/index.ts packages/plugin-api/src/register.ts packages/plugin-api/tests/index.test.ts
git commit -m "feat(plugin-api)!: export the upstream public API, rename ApiPlugin to Api, inject version"
```

---

### Task 7: Documentation and changeset

**Files:**

- Modify: `PKG/README.md`
- Create: `.changeset/plugin-api-sapphire-parity.md`

**Interfaces:**

- Consumes: the final public API from Tasks 3-6 (names in the README must match the code exactly).
- Produces: nothing code-facing. CI's `🦋 Verify changesets` needs the changeset.

- [ ] **Step 1: Rewrite the README body**

In `packages/plugin-api/README.md` keep the centered header block (lines 1-13) and replace everything from `## Description` to the end with:

````md
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
`GET /health`. A folder named `[id]` becomes a dynamic segment (`request.params.id`), and a
`(group)`-style folder is skipped when building the path. Both can be overridden explicitly:

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
````

- [ ] **Step 2: Add the changeset**

Create `.changeset/plugin-api-sapphire-parity.md`:

```md
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
```

- [ ] **Step 3: Format check and commit (commit only if authorized)**

Run: `pnpm lint`
Expected: no errors (oxfmt may reformat the README tables; accept its output).

```bash
git add packages/plugin-api/README.md .changeset/plugin-api-sapphire-parity.md
git commit -m "docs(plugin-api): document the Sapphire-parity API and add the major changeset"
```

---

### Task 8: Final verification

**Files:** none (verification only; fix in the owning task's files if something fails).

**Interfaces:**

- Consumes: the whole package.
- Produces: a green tree that satisfies the repo's definition of done.

- [ ] **Step 1: Repo-wide checks**

Run each, from `D:\codes\plugins`, and expect all to pass:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
```

`pnpm test` includes `tests/http-framework-peer-range.test.ts`: the new range `^3.6.0 || ^5.0.0` must still accept the workspace's framework version and stay on the same majors as the other packages' peers (`^3` and `^5`).

- [ ] **Step 2: Changeset and leftovers**

Run: `pnpm exec changeset status --since=origin/main`
Expected: `@wolfstar/plugin-api` listed as a `major` bump. Then use the Grep tool for `ApiServer|ApiPlugin|lib/http` in `packages/plugin-api` (exclude `node_modules` and `dist`); expected: only migration prose in `README.md`.

- [ ] **Step 3: Unused-export and docs checks**

If the repo runs `knip`, run `pnpm exec knip` and remove any export or dependency it reports as unused for `plugin-api` (for example `@types/*` or a helper from Task 1 that no code ended up importing). Run `pnpm run docs` and confirm typedoc completes for `plugin-api` (members marked `@internal` stay hidden).

- [ ] **Step 4: AGENTS.md**

No command, package, CI or release-flow fact changed, so `AGENTS.md` needs no edit. If Step 1-3 forced a change to a command or workflow, update `AGENTS.md` in the same change.

- [ ] **Step 5: Report**

Report which commands passed. Do not push, publish or run `publish:snapshot`; ask before any of those.

---

## Self-Review

**Spec coverage.**

| Spec item                                  | Task                                                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decisions 1-12                             | 1 (deps, version tooling, engines/peer), 3 (`HttpCodes`, body proxies, response), 4 (events, prefix, no implicit GET), 5 (listeners, headers middleware, generic error body), 6 (`version`, exports), 2 (percent-decoded params) |
| Renames and layout                         | 1 (`HttpMethods`), 3 (`structures/api`, `_body`), 4 (`Server`), 6 (index); `Augmentations.d.ts` dropped (spec amended)                                                                                                           |
| `ApiRequest`, `ApiResponse`, `CookieStore` | 3                                                                                                                                                                                                                                |
| `Route`, `Middleware`                      | 4                                                                                                                                                                                                                                |
| Router                                     | 2                                                                                                                                                                                                                                |
| Middlewares and listeners                  | 5                                                                                                                                                                                                                                |
| `index.ts`, `register.ts`                  | 6                                                                                                                                                                                                                                |
| Dependencies, README, changeset            | 1, 7 (spec amended when the plan was written)                                                                                                                                                                                    |
| Testing list                               | Router removal (2), prefix (4), body readers/cookies/response helpers (3), headers/body/chain/error listeners (5)                                                                                                                |

**Placeholder scan.** No TBD/TODO markers. Two steps are conditional by design and say what to do in each branch: the `MimeType` export name check (Task 1, Step 3) and the `toJSON` typing note (Task 4, Step 5).

**Type consistency.** Names used across tasks: `Server`/`ServerEvent`/`ServerOptions` (Task 4 produces, 5 and 6 consume), `ApiRequest`/`ApiResponse`/`CookieStore` under `structures/api` (Task 3 produces, 4-6 consume), `MethodName`/`MethodNames` under `structures/http/HttpMethods` (Task 1 produces, 2, 4, 5 consume), `RouterRoot.normalize` and `RouterBranch#find`/`node`/`supportedMethods` (Task 2 produces, 5 consumes), `Api` (Task 6). `ServerEvent.Error` is `[error, request?, response?]` in Task 4 and in the spec after amendment.

**Review Focus mapping.** 1 (port in use) -> Task 4 `Server.test.ts`; 2 (IP host cookies) -> Task 3 `CookieStore.test.ts` and Task 5; 3 (invalid JSON gives generic 500) -> Task 5; 4 (malformed `Cookie` header) -> Tasks 3 and 5; 5 (chunked body) -> Task 3 `RequestProxy.test.ts`.

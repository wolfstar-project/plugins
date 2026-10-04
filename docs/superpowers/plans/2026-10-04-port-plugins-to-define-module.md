# Port the existing plugins to `defineModule` / `definePlugin` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every pre-existing `@wolfstar/plugin-*` package gains a `./module` entry (and a `./plugin` entry where it has runtime hooks) so it can be listed in `modules` in `stars.config`, without changing `./register`.

**Architecture:** Additive. For packages with runtime hooks, the hook bodies move into `src/hooks.ts` as plain functions; the legacy `register.ts` class and a new `definePlugin` factory in `src/plugin.ts` both call them, so the two activation paths cannot drift. `src/module.ts` is a `defineModule` whose `setup` calls `ctx.addPlugin({ from: "<pkg>/plugin", options })`. Library packages (cache, sharder, gateway) get only a module that calls `ctx.addImports`.

**Tech Stack:** pnpm + Turborepo, tsdown, vitest, oxlint/oxfmt, golar, changesets, `@wolfstar/http-framework` 6.1 (`definePlugin`), `@wolfstar/kit` 0.1 (`defineModule`).

**Spec:** `docs/superpowers/specs/2026-10-04-port-plugins-to-define-module-design.md`. Reference implementation: `packages/plugin-scheduled-tasks/src/{module,plugin}.ts` and its `tests/{module,plugin}.test.ts`.

## Global Constraints

- Additive only: `./register` behaviour, the framework peer ranges and every existing test stay unchanged. No breaking change.
- `meta.compatibility.framework` is `">=6.1.0"` (omitted for `plugin-sharder`, which has no framework peer).
- `@wolfstar/kit`: devDependency copied verbatim from `packages/plugin-scheduled-tasks/package.json` (`^0.1.0`) and an optional peer `^0.1.0` (`peerDependenciesMeta["@wolfstar/kit"].optional = true`).
- New subpaths use the same `exports` shape as the existing ones: `{ "import": { "types": "./dist/esm/X.d.ts", "default": "./dist/esm/X.js" } }`. `sideEffects` is unchanged.
- Each new entry is added to the package's `tsdown.config.ts` `entry` and `attwEntrypoints`.
- `module.ts` and `plugin.ts` use a default export. Users list `"@wolfstar/plugin-<name>/module"` in `modules`.
- Module `options` must be JSON-serialisable (kit writes them into the built entry). Instances, transports and functions stay on `ClientOptions`.
- Plugin options: factory options are the base, `ClientOptions.<key>` is shallow-merged over them.
- `plugin-logger`'s plugin sets `enforce: "pre"`.
- One `minor` changeset per package. Commits follow Conventional Commits (husky + commitlint stay on; never `--no-verify`).
- Never `cd`; use absolute paths. Never commit secrets.
- Done per PR: `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass; changeset present; box ticked in #173.
- Ask the user before closing or commenting on any issue, and before any npm publish.

## Review Focus

- Logger: an explicit `ClientOptions.logger.instance` must still win over the plugin's factory options (test in Task 1).
- Logger: the `pre` ordering must put the logger before another plugin's `preGenericsInitialization` that logs (test in Task 1).
- i18next: factory options without `ClientOptions.i18n` must still reach `InternationalizationHandler`, and HMR must start only when enabled (Task 2).
- Broker: factory options without `redis` must throw the same `TypeError` as `ClientOptions.broker`, and no broker is created when neither is given (Task 6).
- API: `automaticallyConnect: false` from the factory options must be honoured in `postListen` (Task 8).
- Module `setup` must pass the user's options through unchanged, including when none are given (every task).

---

## File Structure

| Package                 | New                                                                                              | Modified                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| logger                  | `src/hooks.ts`, `src/plugin.ts`, `src/module.ts`, `tests/plugin.test.ts`, `tests/module.test.ts` | `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md` |
| i18next                 | same five                                                                                        | `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md` |
| cache, sharder, gateway | `src/module.ts`, `tests/module.test.ts`                                                          | `package.json`, `tsdown.config.ts`, `README.md`                    |
| broker                  | same five as logger                                                                              | `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md` |
| subcommands-advanced    | same five                                                                                        | `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md` |
| api                     | same five                                                                                        | `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md` |
| root                    | `tests/module-entries.test.ts`, `.changeset/plugin-<name>-module.md` per package                 | `AGENTS.md`, `knip.json` if flagged, `pnpm-lock.yaml`              |

Branches: `t3code/migrate-plugins-define-module` (logger, current), then one branch per task, each based on the previous one, PR `--base` the previous branch. After a merge, rebase the next with `git rebase --onto origin/main <old-base>`.

---

### Task 1: plugin-logger (also lands the shared scaffolding)

**Files:**

- Create: `packages/plugin-logger/src/hooks.ts`, `src/plugin.ts`, `src/module.ts`, `tests/plugin.test.ts`, `tests/module.test.ts`, `tests/module-entries.test.ts` (root `tests/`), `.changeset/plugin-logger-module.md`
- Modify: `packages/plugin-logger/src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md`; `AGENTS.md`

**Interfaces:**

- Produces: `installLogger(options: ClientOptions): void` in `hooks.ts`; `default` of `plugin.ts` is `(pluginOptions?: ClientLoggerOptions) => StarsPlugin`; `default` of `module.ts` is a `defineModule<ClientLoggerOptions>`.
- Root test `tests/module-entries.test.ts` (generic, reused by every later task).

- [ ] **Step 1: Install kit** (needed for types and tests)

```bash
pnpm --filter @wolfstar/plugin-logger add -D @wolfstar/kit@^0.1.0
```

Then in `packages/plugin-logger/package.json` add:

```json
"peerDependencies": { "@wolfstar/kit": "^0.1.0" },
"peerDependenciesMeta": { "@wolfstar/kit": { "optional": true } }
```

(merge into the existing `peerDependencies` object; keep the framework peer unchanged), and add to `exports`:

```json
"./plugin": { "import": { "types": "./dist/esm/plugin.d.ts", "default": "./dist/esm/plugin.js" } },
"./module": { "import": { "types": "./dist/esm/module.d.ts", "default": "./dist/esm/module.js" } }
```

`tsdown.config.ts`: add `"./plugin", "./module"` to `attwEntrypoints` and `"src/plugin.ts", "src/module.ts"` to `entry`.

- [ ] **Step 2: Write the root manifest test**

`tests/module-entries.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packagesDirectory = fileURLToPath(new URL("../packages/", import.meta.url));

interface Manifest {
  name: string;
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
}

const entries = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const directory = `${packagesDirectory}${entry.name}`;
    if (!existsSync(`${directory}/src/module.ts`)) return [];
    return [
      {
        directory,
        manifest: JSON.parse(readFileSync(`${directory}/package.json`, "utf8")) as Manifest,
        tsdown: readFileSync(`${directory}/tsdown.config.ts`, "utf8"),
        hasPlugin: existsSync(`${directory}/src/plugin.ts`),
      },
    ];
  });

describe.each(entries)("$manifest.name module entries", ({ manifest, tsdown, hasPlugin }) => {
  const subpaths = hasPlugin ? ["module", "plugin"] : ["module"];

  test.each(subpaths)("exports ./%s and builds it", (name) => {
    expect(manifest.exports).toHaveProperty(
      [`./${name}`, "import", "default"],
      `./dist/esm/${name}.js`,
    );
    expect(manifest.exports).toHaveProperty(
      [`./${name}`, "import", "types"],
      `./dist/esm/${name}.d.ts`,
    );
    expect(tsdown).toContain(`"src/${name}.ts"`);
    expect(tsdown).toContain(`"./${name}"`);
  });

  test("declares @wolfstar/kit as an optional peer and a devDependency", () => {
    expect(manifest.peerDependencies?.["@wolfstar/kit"]).toBe("^0.1.0");
    expect(manifest.peerDependenciesMeta?.["@wolfstar/kit"]?.optional).toBe(true);
    expect(manifest.devDependencies?.["@wolfstar/kit"]).toBeDefined();
  });
});
```

Note: `plugin-scheduled-tasks` has `src/module.ts` but its module is exported from the root and it has no `./module` subpath, so the test must skip it: add `&& manifest.name !== "@wolfstar/plugin-scheduled-tasks"` to the `existsSync` filter by reading the manifest first (restructure the `flatMap` to read the manifest, then `if (manifest.name === "@wolfstar/plugin-scheduled-tasks") return [];`).

- [ ] **Step 3: Run it to see the red state**

Run: `pnpm vitest run tests/module-entries.test.ts`
Expected: no entries yet (no `src/module.ts`), so the suite reports "no tests"; this step is re-run in Step 9 to see it pass.

- [ ] **Step 4: Write the failing plugin and module tests**

`packages/plugin-logger/tests/module.test.ts`:

```ts
import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import loggerModule from "../src/module";

describe("loggerModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(loggerModule.meta).toMatchObject({
      name: "@wolfstar/plugin-logger",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN options THEN setup registers the plugin with them and imports nothing", () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { level: 20 };

    loggerModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-logger/plugin",
      options,
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });
});
```

> Before relying on `loggerModule.setup!(options, ctx)`, open `packages/plugin-scheduled-tasks/tests/module.test.ts` and copy its exact way of invoking `setup` and typing the context; keep the same call shape.

`packages/plugin-logger/tests/plugin.test.ts`:

```ts
import { Client, LogLevel, container, definePlugin, type ILogger } from "@wolfstar/http-framework";
import { describe, expect, test } from "vitest";
import { Logger } from "../src/lib/Logger";
import loggerPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

describe("loggerPlugin", () => {
  test("GIVEN the factory THEN the plugin is named and runs before the others", () => {
    const plugin = loggerPlugin() as { name: string; enforce?: string };

    expect(plugin.name).toBe("@wolfstar/plugin-logger");
    expect(plugin.enforce).toBe("pre");
  });

  test("GIVEN no options THEN a Logger is installed on the container", () => {
    new Client({ ...base, plugins: [loggerPlugin()] });

    expect(container.logger).toBeInstanceOf(Logger);
  });

  test("GIVEN factory options THEN the logger honours them", () => {
    new Client({ ...base, plugins: [loggerPlugin({ level: LogLevel.Debug })] });

    expect((container.logger as Logger).level).toBe(LogLevel.Debug);
  });

  test("GIVEN ClientOptions.logger THEN it is merged over the factory options", () => {
    new Client({
      ...base,
      logger: { level: LogLevel.Error },
      plugins: [loggerPlugin({ level: LogLevel.Debug })],
    });

    expect((container.logger as Logger).level).toBe(LogLevel.Error);
  });

  test("GIVEN an explicit instance THEN it is left untouched", () => {
    const instance = { has: () => true, error: () => {} } as unknown as ILogger;

    new Client({ ...base, logger: { instance }, plugins: [loggerPlugin()] });

    expect(container.logger).toBe(instance);
  });

  test("GIVEN another plugin that logs in preGenericsInitialization THEN the logger is already installed", () => {
    let seen: unknown;
    const spy = definePlugin({
      name: "spy",
      preGenericsInitialization: (_client, options) => {
        seen = options.logger?.instance;
      },
    });

    new Client({ ...base, plugins: [spy, loggerPlugin()] });

    expect(seen).toBeInstanceOf(Logger);
  });
});
```

> If `container.logger` is not reset between tests and the framework only assigns after `preGenericsInitialization`, each `new Client` reassigns it, so the assertions hold. If a test fails because the `Client` constructor needs more options, mirror the construction in `packages/plugin-scheduled-tasks/tests/plugin.test.ts`.

- [ ] **Step 5: Run to confirm failure**

Run: `pnpm vitest run packages/plugin-logger/tests/plugin.test.ts packages/plugin-logger/tests/module.test.ts`
Expected: FAIL, `Cannot find module '../src/plugin'` / `'../src/module'`.

- [ ] **Step 6: Implement**

`src/hooks.ts`:

```ts
import type { ClientOptions } from "@wolfstar/http-framework";
import { Logger } from "./lib/Logger";

export function installLogger(options: ClientOptions): void {
  options.logger ??= {};
  options.logger.instance ??= new Logger(options.logger);
}
```

`src/register.ts`: replace the two body lines of `LoggerPlugin[preGenericsInitialization]` with `installLogger(options);` and add `import { installLogger } from "./hooks";`. Keep everything else.

`src/plugin.ts`:

````ts
import { definePlugin, type ClientLoggerOptions } from "@wolfstar/http-framework";
import "./index";
import { installLogger } from "./hooks";

/**
 * The logger plugin: replaces the framework's console logger with a {@link Logger} fanning out to the configured
 * transports.
 *
 * @param pluginOptions The logger options. `ClientOptions.logger` is merged over them.
 *
 * @example
 * ```ts
 * import loggerPlugin from '@wolfstar/plugin-logger/plugin';
 *
 * const client = new Client({ plugins: [loggerPlugin({ level: LogLevel.Debug })] });
 * ```
 */
export default definePlugin((pluginOptions: ClientLoggerOptions = {}) => ({
  name: "@wolfstar/plugin-logger",
  enforce: "pre",
  preGenericsInitialization(_client, options) {
    options.logger = { ...pluginOptions, ...options.logger };
    installLogger(options);
  },
}));
````

`src/module.ts`:

````ts
import { defineModule } from "@wolfstar/kit";
import type { ClientLoggerOptions } from "@wolfstar/http-framework";

/**
 * The Stars module: listing `@wolfstar/plugin-logger/module` in `modules` in `stars.config` registers the logger
 * plugin with the options written there.
 *
 * @remarks
 * The options are written into the built entry, so they have to be JSON-serialisable (`level`, ...). Transports are
 * objects: set them through `ClientOptions.logger.transports`.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({ modules: [['@wolfstar/plugin-logger/module', { level: 20 }]] });
 * ```
 */
export default defineModule<ClientLoggerOptions>({
  meta: {
    name: "@wolfstar/plugin-logger",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-logger/plugin", options });
  },
});
````

- [ ] **Step 7: Run all logger tests, including the untouched `register.test.ts`**

Run: `pnpm vitest run packages/plugin-logger tests/module-entries.test.ts`
Expected: PASS (register tests unchanged and green).

- [ ] **Step 8: Docs and changeset**

`packages/plugin-logger/README.md`: add a "Stars module" section (list `'@wolfstar/plugin-logger/module'` in `modules`; JSON-serialisable options only; transports via `ClientOptions.logger.transports`; do not also import `/register`) and keep the existing `/register` section, marked "framework v3/v5/v6".

`AGENTS.md`: add to Gotchas:
"Activation has two paths. `plugin-scheduled-tasks` is module-only (its `./register` is a no-op). The older plugins ship `./module` (default export: `defineModule` from `@wolfstar/kit`, optional peer) and, for those with runtime hooks, `./plugin` (default export: a `definePlugin` factory); `./register` stays the legacy class + `Client.plugins.register*Hook` path for framework v3/v5/v6. Both call the same functions in `src/hooks.ts`, so change behaviour there. The `stars` CLI does not import `<pkg>/register` for a package listed in `modules`. `tests/module-entries.test.ts` checks that every `src/module.ts` is exported, built and has kit as an optional peer."

`.changeset/plugin-logger-module.md`:

```md
---
"@wolfstar/plugin-logger": minor
---

Add `@wolfstar/plugin-logger/module` and `@wolfstar/plugin-logger/plugin`: list the module in `modules` in `stars.config`, or pass the `definePlugin` factory to `plugins`. Both need framework 6.1 (and `@wolfstar/kit` for the module); `./register` is unchanged and still supports framework v3, v5 and v6.
```

- [ ] **Step 9: Full gate**

Run: `pnpm lint && pnpm build && pnpm typecheck && pnpm test`
Expected: all pass. If `knip` flags the new entries, add them to `knip.json` (`packages/plugin-logger` workspace `entry`).

- [ ] **Step 10: Commit, push, PR**

Commit spec, plan and code (stage files by name). Message: `feat(plugin-logger): add module and plugin entries for defineModule`. Push, open a PR (base `main`), link it with `link_pull_request`, tick the logger box in #173.

---

### Task 2: plugin-i18next

**Files:** as Task 1 for the five new files plus `.changeset/plugin-i18next-module.md`; modify `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md`. Branch off Task 1's branch.

**Interfaces:**

- Produces in `hooks.ts`: `installI18n(options: ClientOptions): void`, `initI18n(): Promise<void>`, `watchLanguages(options: ClientOptions): FSWatcher | null`.
- `plugin.ts` default: `(pluginOptions?: InternationalizationOptions) => StarsPlugin`; `module.ts` default: `defineModule<InternationalizationOptions>`.

- [ ] **Step 1: Kit dependency, exports, tsdown** exactly as Task 1 Step 1, for `@wolfstar/plugin-i18next`. Peer range of the framework stays `^3.1.0 || ^5 || ^6`.

- [ ] **Step 2: Failing tests**

`tests/module.test.ts`: same shape as Task 1 with `name: "@wolfstar/plugin-i18next"`, `from: "@wolfstar/plugin-i18next/plugin"`, options `{ defaultLanguageDirectory: "/langs" }`.

`tests/plugin.test.ts` (reuse the fixtures dir `tests/fixtures` that `hmr.test.ts` / `InternationalizationHandler.test.ts` already use; open them first and copy the fixture path and the way they stub `chokidar`):

```ts
import { Client, container } from "@wolfstar/http-framework";
import { describe, expect, test, vi } from "vitest";
import { InternationalizationHandler } from "../src/lib/InternationalizationHandler";
import i18nPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

describe("i18nextPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((i18nPlugin() as { name: string }).name).toBe("@wolfstar/plugin-i18next");
  });

  test("GIVEN factory options only THEN the handler uses them", () => {
    new Client({ ...base, plugins: [i18nPlugin({ defaultLanguageDirectory: "/from-factory" })] });

    expect(container.i18n).toBeInstanceOf(InternationalizationHandler);
    expect(container.i18n.languagesDirectory).toBe("/from-factory");
  });

  test("GIVEN ClientOptions.i18n THEN it is merged over the factory options", () => {
    new Client({
      ...base,
      i18n: { defaultLanguageDirectory: "/from-client" },
      plugins: [i18nPlugin({ defaultLanguageDirectory: "/from-factory" })],
    });

    expect(container.i18n.languagesDirectory).toBe("/from-client");
  });

  test("GIVEN preLoad THEN the handler is initialised", async () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES });
    const client = new Client({ ...base, plugins: [plugin] });
    const init = vi.spyOn(container.i18n, "init").mockResolvedValue();

    await plugin.preLoad?.(client, {} as ClientOptions);

    expect(init).toHaveBeenCalledOnce();
  });

  test("GIVEN HMR enabled in the factory options THEN postListen watches the languages directory", () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES, hmr: { enabled: true } });
    const client = new Client({ ...base, plugins: [plugin] });

    plugin.postListen?.(client, {} as ClientOptions);

    expect(watch).toHaveBeenCalledWith(FIXTURES, expect.objectContaining({ ignoreInitial: true }));
  });

  test("GIVEN HMR not enabled THEN postListen watches nothing", () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES });
    const client = new Client({ ...base, plugins: [plugin] });

    plugin.postListen?.(client, {} as ClientOptions);

    expect(watch).not.toHaveBeenCalled();
  });
});
```

> `FIXTURES` and the `vi.mock("chokidar")` stub (`watch` returning an object with `on`/`close` spies, cleared in `beforeEach`) are copied from `tests/hmr.test.ts`. Import `type ClientOptions` and `watch` from `@wolfstar/http-framework` / `chokidar` accordingly. Calling the hooks on the factory result with an empty options object is how `plugin-scheduled-tasks/tests/plugin.test.ts` drives them; copy its exact call shape if it differs.

- [ ] **Step 3: Run, expect FAIL** (`Cannot find module '../src/plugin'`).

- [ ] **Step 4: Implement `src/hooks.ts`**

```ts
import { container, type ClientOptions } from "@wolfstar/http-framework";
import { watch, type FSWatcher } from "chokidar";
import { InternationalizationHandler } from "./lib/InternationalizationHandler";

const HmrEvents = ["add", "addDir", "change", "unlink", "unlinkDir"] as const;

export function installI18n(options: ClientOptions): void {
  container.i18n = new InternationalizationHandler(options.i18n);
}

export async function initI18n(): Promise<void> {
  await container.i18n.init();
}

export function watchLanguages(options: ClientOptions): FSWatcher | null {
  if (!options.i18n?.hmr?.enabled) return null;

  console.info("[plugin-i18next] HMR enabled. Watching for language changes.");

  // `ignoreInitial` defaults to `true` here: chokidar otherwise replays an `add` for every file
  // already on disk, which would trigger a reload per translation file on startup.
  const watcher = watch(container.i18n.languagesDirectory, {
    ignoreInitial: true,
    ...options.i18n.hmr.options,
  });

  // Adding a locale directory or a namespace file emits `addDir` / `add`, not `change`, so all of
  // them have to be watched for new languages and namespaces to be picked up.
  for (const event of HmrEvents) {
    watcher.on(event, () => void container.i18n.reloadResources());
  }

  return watcher;
}
```

`src/register.ts`: remove the `HmrEvents` constant and the chokidar import; the three static methods become

```ts
public static [preGenericsInitialization](this: Client, options: ClientOptions): void {
  installI18n(options);
}
public static async [preLoad](this: Client): Promise<void> {
  await initI18n();
}
public static [postListen](this: Client, options: ClientOptions): void {
  I18nextPlugin.watcher = watchLanguages(options) ?? I18nextPlugin.watcher;
}
```

(`FSWatcher` type import stays for the `watcher` static; `hmr.test.ts` keeps passing because a disabled HMR leaves `watcher` untouched, as before.)

`src/plugin.ts`:

```ts
import { definePlugin } from "@wolfstar/http-framework";
import "./index";
import { initI18n, installI18n, watchLanguages } from "./hooks";
import type { InternationalizationOptions } from "./lib/types";

/**
 * The i18next plugin: installs the {@link InternationalizationHandler} on `container.i18n`, loads the languages
 * before the stores, and watches the languages directory when HMR is enabled.
 *
 * @param pluginOptions The handler options. `ClientOptions.i18n` is merged over them.
 */
export default definePlugin((pluginOptions: InternationalizationOptions = {}) => {
  const merged = (options: ClientOptions): ClientOptions => ({
    ...options,
    i18n: { ...pluginOptions, ...options.i18n },
  });

  return {
    name: "@wolfstar/plugin-i18next",
    preGenericsInitialization(_client, options) {
      options.i18n = merged(options).i18n;
      installI18n(options);
    },
    preLoad: () => initI18n(),
    postListen(_client, options) {
      watchLanguages(merged(options));
    },
  };
});
```

(Import `type ClientOptions` from `@wolfstar/http-framework`. Confirm `InternationalizationOptions` is exported from `./lib/types`; use the real path found by `grep -rn "interface InternationalizationOptions" packages/plugin-i18next/src`.)

`src/module.ts`: as Task 1 with `defineModule<InternationalizationOptions>`, name `@wolfstar/plugin-i18next`, `from: "@wolfstar/plugin-i18next/plugin"`, no `addImports`. JSDoc remark: `fetchLanguage` and `hmr.options` functions are not serialisable; set `fetchLanguage` through `ClientOptions.i18n`.

- [ ] **Step 5: Run** `pnpm vitest run packages/plugin-i18next tests/module-entries.test.ts` — PASS, including untouched `hmr.test.ts`.
- [ ] **Step 6: README section, changeset `.changeset/plugin-i18next-module.md`** (`"@wolfstar/plugin-i18next": minor`, same wording as Task 1 with the package name), full gate, commit `feat(plugin-i18next): add module and plugin entries for defineModule`, push, PR with `--base` the previous branch, link it, tick #173.

---

### Task 3: plugin-cache (library module)

**Files:** Create `packages/plugin-cache/src/module.ts`, `tests/module.test.ts`, `.changeset/plugin-cache-module.md`; modify `package.json`, `tsdown.config.ts`, `README.md`.

**Interfaces:** Produces default `defineModule` from `module.ts`.

- [ ] **Step 1:** kit devDependency, optional peer, `./module` export, tsdown `entry`/`attwEntrypoints` (`attwEntrypoints` becomes `[".", "./register", "./msgpack", "./module"]`). `plugin-cache` has no framework peer and no `./plugin`.
- [ ] **Step 2: Failing test** `tests/module.test.ts`:

```ts
import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import cacheModule from "../src/module";

describe("cacheModule", () => {
  test("GIVEN the module THEN it names the package", () => {
    expect(cacheModule.meta).toMatchObject({ name: "@wolfstar/plugin-cache" });
  });

  test("GIVEN setup THEN the package is auto-imported and no plugin is registered", () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    cacheModule.setup!({}, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-cache");
    expect(ctx.addPlugin).not.toHaveBeenCalled();
  });
});
```

(Use the same `setup` call shape as `plugin-scheduled-tasks/tests/module.test.ts`.)

- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement** `src/module.ts`:

```ts
import { defineModule } from "@wolfstar/kit";

/**
 * The Stars module: listing `@wolfstar/plugin-cache/module` in `modules` in `stars.config` adds the package to the
 * auto imports. The cache itself is constructed by `@wolfstar/plugin-gateway`.
 */
export default defineModule({
  meta: { name: "@wolfstar/plugin-cache", compatibility: { framework: ">=6.1.0" } },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-cache");
  },
});
```

`compatibility.framework` is kept here because the Stars CLI that loads modules requires framework 6.1 anyway; `plugin-cache` has no framework peer, so this only gates when it is used as a module.

- [ ] **Step 5:** `pnpm vitest run packages/plugin-cache tests/module-entries.test.ts` PASS. README "Stars module" section, changeset, full gate, commit `feat(plugin-cache): add module entry for defineModule`, PR (base previous), link, tick #173.

---

### Task 4: plugin-sharder (library module)

Same as Task 3 with: name `@wolfstar/plugin-sharder`, `meta` **without** `compatibility`, `addImports("@wolfstar/plugin-sharder")`, `attwEntrypoints` `[".", "./register", "./module"]`, `entry` adds `src/module.ts`, changeset `.changeset/plugin-sharder-module.md`. The test asserts `cacheModule.meta` equals `{ name: "@wolfstar/plugin-sharder" }` via `toMatchObject` and that `meta.compatibility` is `undefined`. Commit `feat(plugin-sharder): add module entry for defineModule`.

- [ ] Steps 1-5 as Task 3 (files: `src/module.ts`, `tests/module.test.ts`, `package.json`, `tsdown.config.ts`, `README.md`, changeset). Code:

```ts
import { defineModule } from "@wolfstar/kit";

export default defineModule({
  meta: { name: "@wolfstar/plugin-sharder" },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-sharder");
  },
});
```

---

### Task 5: plugin-gateway (library module)

Same as Task 3 with: name `@wolfstar/plugin-gateway`, `compatibility: { framework: ">=6.1.0" }`, `addImports("@wolfstar/plugin-gateway")`, changeset `.changeset/plugin-gateway-module.md`, commit `feat(plugin-gateway): add module entry for defineModule`. `attwEntrypoints` `[".", "./register", "./module"]`. Keep `knip.json`'s gateway workspace unchanged unless knip flags the entry.

- [ ] Steps 1-5 as Task 3. Code is Task 3's with the package name swapped.

---

### Task 6: plugin-broker

**Files:** the five new files + changeset `.changeset/plugin-broker-module.md`; modify `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md`.

**Interfaces:**

- Produces in `hooks.ts`: `installBroker(options: ClientOptions): void`, `startBroker(): Awaitable<void>`.
- `plugin.ts` default: `(pluginOptions?: Partial<BrokerConsumerOptions>) => StarsPlugin`; `module.ts` default: `defineModule<Partial<BrokerConsumerOptions>>`.

- [ ] **Step 1:** kit dependency, exports, tsdown as Task 1.
- [ ] **Step 2: Failing tests.** `tests/module.test.ts` as Task 1 with broker names. `tests/plugin.test.ts`; first open `tests/register.test.ts` and copy how it builds a valid `BrokerConsumerOptions` (an `ioredis` mock/instance) and stubs `BrokerConsumer.prototype.start`:

```ts
import { Client, container } from "@wolfstar/http-framework";
import { describe, expect, test, vi } from "vitest";
import { BrokerConsumer } from "../src/BrokerConsumer";
import brokerPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

describe("brokerPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((brokerPlugin() as { name: string }).name).toBe("@wolfstar/plugin-broker");
  });

  test("GIVEN neither factory nor client options THEN no consumer is created", () => {
    // @ts-expect-error container.broker is only set when configured
    container.broker = undefined;
    new Client({ ...base, plugins: [brokerPlugin()] });

    expect(container.broker).toBeUndefined();
  });

  test("GIVEN factory options THEN a consumer is created from them", () => {
    new Client({ ...base, plugins: [brokerPlugin(VALID_OPTIONS)] });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
  });

  test("GIVEN options without redis THEN the consumer's TypeError surfaces", () => {
    expect(() => new Client({ ...base, plugins: [brokerPlugin({ stream: "s" })] })).toThrow(
      TypeError,
    );
  });

  test("GIVEN ClientOptions.broker THEN it is merged over the factory options", () => {
    new Client({
      ...base,
      broker: VALID_OPTIONS,
      plugins: [brokerPlugin({ stream: "from-factory" })],
    });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
  });
});
```

`VALID_OPTIONS` is copied from `register.test.ts`. Add a `postListen` test that spies `container.broker.start` and asserts it ran once (copy the technique used in `plugin-scheduled-tasks/tests/plugin.test.ts` for driving `postListen`).

- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement.**

`src/hooks.ts`:

```ts
import { container, type ClientOptions } from "@wolfstar/http-framework";
import type { Awaitable } from "@wolfstar/plugin-cache";
import { BrokerConsumer } from "./BrokerConsumer.js";

export function installBroker(options: ClientOptions): void {
  if (options.broker) container.broker = new BrokerConsumer(options.broker);
}

export function startBroker(): Awaitable<void> {
  return container.broker?.start();
}
```

`src/register.ts`: the two statics call `installBroker(options)` and `return startBroker()`. Both `register.ts` and `plugin.ts` need the `Container.broker` / `ClientOptions.broker` augmentations, and declaring them twice would conflict, so move the two `declare module` blocks verbatim into a new `src/augmentations.ts` (type-only: `import type { BrokerConsumer, BrokerConsumerOptions } from "./BrokerConsumer.js"` plus the two blocks, ending with `export {};`) and `import "./augmentations.js";` from both `register.ts` and `plugin.ts`.

`src/plugin.ts`:

```ts
import { definePlugin } from "@wolfstar/http-framework";
import "./augmentations.js";
import type { BrokerConsumerOptions } from "./BrokerConsumer.js";
import { installBroker, startBroker } from "./hooks.js";

/**
 * The broker plugin: installs a {@link BrokerConsumer} from the plugin's options merged under
 * `ClientOptions.broker`, and starts it once the client is listening.
 *
 * @param pluginOptions The consumer options. Without a `redis` client the consumer throws, so pass it here or in
 * `ClientOptions.broker`.
 */
export default definePlugin((pluginOptions: Partial<BrokerConsumerOptions> = {}) => ({
  name: "@wolfstar/plugin-broker",
  preGenericsInitialization(_client, options) {
    const merged = { ...pluginOptions, ...options.broker };
    if (Object.keys(merged).length > 0) options.broker = merged as BrokerConsumerOptions;
    installBroker(options);
  },
  postListen: () => startBroker(),
}));
```

`src/module.ts`: as Task 1 with `defineModule<Partial<BrokerConsumerOptions>>`; JSDoc remark: the `redis` client is an instance, so it cannot be written in `stars.config`; pass it through `ClientOptions.broker`, and the module options carry only the serialisable remainder.

- [ ] **Step 5:** `pnpm vitest run packages/plugin-broker tests/module-entries.test.ts` PASS, including untouched `register.test.ts`. If `knip` flags `augmentations.ts`, it is imported, so it should not.
- [ ] **Step 6:** README, changeset, full gate (including the broker type tests in `tests/types`, covered by `pnpm typecheck`), commit `feat(plugin-broker): add module and plugin entries for defineModule`, PR, link, tick #173.

---

### Task 7: plugin-subcommands-advanced

**Files:** the five new files + changeset `.changeset/plugin-subcommands-advanced-module.md`; modify `src/register.ts`, `package.json`, `tsdown.config.ts`, `README.md`.

**Interfaces:** Produces `installSubcommandsStrategy(): void` in `hooks.ts`; `plugin.ts` default `() => StarsPlugin` (no options); `module.ts` default `defineModule` (no options).

- [ ] **Step 1:** kit dependency, exports, tsdown as Task 1.
- [ ] **Step 2: Failing tests.** `tests/module.test.ts`: `name: "@wolfstar/plugin-subcommands-advanced"`, `setup({}, ctx)` calls `addPlugin` with `{ from: "@wolfstar/plugin-subcommands-advanced/plugin", options: {} }`. `tests/plugin.test.ts` (first read `tests/subcommands-advanced.test.ts` for the decorator/fixture setup it uses with `@wolfstar/http-framework-test-utils`; its vitest config already enables decorators):

```ts
import { Client, container, type CommandStore } from "@wolfstar/http-framework";
import { describe, expect, test } from "vitest";
import subcommandsPlugin from "../src/plugin";
import { SubcommandsAdvancedLoaderStrategy } from "../src/lib/utils/strategy";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

describe("subcommandsAdvancedPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((subcommandsPlugin() as { name: string }).name).toBe(
      "@wolfstar/plugin-subcommands-advanced",
    );
  });

  test("GIVEN a client THEN the commands store uses the advanced loader strategy", () => {
    new Client({ ...base, plugins: [subcommandsPlugin()] });

    const store = container.stores.get("commands") as CommandStore;
    expect(store.strategy).toBeInstanceOf(SubcommandsAdvancedLoaderStrategy);
  });
});
```

- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement.** `src/hooks.ts`:

```ts
import { container, type CommandStore } from "@wolfstar/http-framework";
import { SubcommandsAdvancedLoaderStrategy } from "./lib/utils/strategy.js";

export function installSubcommandsStrategy(): void {
  const store = container.stores.get("commands") as CommandStore;
  Object.defineProperty(store, "strategy", {
    value: new SubcommandsAdvancedLoaderStrategy(),
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
```

`src/register.ts`: the static becomes `installSubcommandsStrategy();` (drop the now unused `container`/`CommandStore`/strategy imports). `src/plugin.ts`:

```ts
import { definePlugin } from "@wolfstar/http-framework";
import "./index.js";
import { installSubcommandsStrategy } from "./hooks.js";

/**
 * The advanced subcommands plugin: installs the loader strategy that wires modular child command classes onto their
 * parent chat-input commands after load.
 */
export default definePlugin(() => ({
  name: "@wolfstar/plugin-subcommands-advanced",
  postInitialization: () => installSubcommandsStrategy(),
}));
```

`src/module.ts`: `defineModule({ meta: { name: "@wolfstar/plugin-subcommands-advanced", compatibility: { framework: ">=6.1.0" } }, setup(options, ctx) { ctx.addPlugin({ from: "@wolfstar/plugin-subcommands-advanced/plugin", options }); } })`.

- [ ] **Step 5:** run `pnpm vitest run packages/plugin-subcommands-advanced tests/module-entries.test.ts` PASS. README, changeset, gate, commit `feat(plugin-subcommands-advanced): add module and plugin entries for defineModule`, PR, link, tick #173.

---

### Task 8: plugin-api

**Files:** the five new files + changeset `.changeset/plugin-api-module.md`; modify `src/register.ts`, `package.json`, `tsdown.config.ts` (it also has `plugins: [VersionInjector()]`, keep it), `README.md`.

**Interfaces:** Produces in `hooks.ts`: `installApi(options: ClientOptions): void`, `connectApi(options: ClientOptions): Promise<void>`; `plugin.ts` default `(pluginOptions?: ServerOptions) => StarsPlugin`; `module.ts` default `defineModule<ServerOptions>`.

- [ ] **Step 1:** kit dependency, exports, tsdown as Task 1.
- [ ] **Step 2: Failing tests.** `tests/module.test.ts` as Task 1 (`@wolfstar/plugin-api`, options `{ prefix: "/api" }`). `tests/plugin.test.ts`; read `tests/ApiServer.test.ts` and `tests/Server.test.ts` first for port selection and cleanup (use `server.options.port = 0`-style ephemeral ports as they do, and close the server in `afterEach`):

```ts
import { Client, container } from "@wolfstar/http-framework";
import { afterEach, describe, expect, test, vi } from "vitest";
import apiPlugin from "../src/plugin";
import { Server } from "../src/lib/structures/http/Server";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

afterEach(() => vi.restoreAllMocks());

describe("apiPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((apiPlugin() as { name: string }).name).toBe("@wolfstar/plugin-api");
  });

  test("GIVEN a client THEN the server is created and its stores registered", () => {
    new Client({ ...base, plugins: [apiPlugin({ automaticallyConnect: false })] });

    expect(container.server).toBeInstanceOf(Server);
    expect(container.stores.get("routes")).toBe(container.server.routes);
    expect(container.stores.get("middlewares")).toBe(container.server.middlewares);
  });

  test("GIVEN factory options THEN the server uses them", () => {
    new Client({ ...base, plugins: [apiPlugin({ prefix: "/api", automaticallyConnect: false })] });

    expect(container.server.options.prefix).toBe("/api");
  });

  test("GIVEN ClientOptions.api THEN it is merged over the factory options", () => {
    new Client({
      ...base,
      api: { prefix: "/client", automaticallyConnect: false },
      plugins: [apiPlugin({ prefix: "/factory" })],
    });

    expect(container.server.options.prefix).toBe("/client");
  });

  test("GIVEN postListen WHEN automaticallyConnect is false in the factory options THEN it does not connect", async () => {
    const client = new Client({ ...base, plugins: [apiPlugin({ automaticallyConnect: false })] });
    const connect = vi.spyOn(container.server, "connect").mockResolvedValue(undefined as never);

    await runPostListen(client);

    expect(connect).not.toHaveBeenCalled();
  });

  test("GIVEN postListen WHEN automaticallyConnect is unset THEN it connects", async () => {
    const client = new Client({ ...base, plugins: [apiPlugin()] });
    const connect = vi.spyOn(container.server, "connect").mockResolvedValue(undefined as never);

    await runPostListen(client);

    expect(connect).toHaveBeenCalledOnce();
  });
});
```

`runPostListen` is the helper copied from `plugin-scheduled-tasks/tests/plugin.test.ts`, the technique it uses to drive `postListen` for a real `Client`. Replace the `container.server.options` access with the actual public field if `options` is not exposed (check `Server.ts`: `this.options = options`; if it is `private`, assert via the effect on routing instead, for example `container.server.options` replaced by a request to the in-process harness in `tests/http-harness.ts`).

- [ ] **Step 3: Run, expect FAIL.**
- [ ] **Step 4: Implement.** `src/hooks.ts`:

```ts
import { container, type ClientOptions } from "@wolfstar/http-framework";
import { Server } from "./lib/structures/http/Server";
import { loadListeners } from "./listeners/_load";
import { loadMiddlewares } from "./middlewares/_load";

export function installApi(options: ClientOptions): void {
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

export async function connectApi(options: ClientOptions): Promise<void> {
  if ((options.api?.automaticallyConnect ?? true) === false) return;
  await container.server.connect();
}
```

`src/register.ts`: statics call `installApi(options)` / `await connectApi(options)`; drop now-unused imports. `src/plugin.ts`:

```ts
import { definePlugin, type ClientOptions } from "@wolfstar/http-framework";
import "./index";
import { connectApi, installApi } from "./hooks";
import type { ServerOptions } from "./lib/structures/http/Server";

/**
 * The API plugin: registers a standalone {@link Server} for auxiliary REST routes, independent from the Discord
 * interactions webhook server.
 *
 * @param pluginOptions The server options. `ClientOptions.api` is merged over them.
 */
export default definePlugin((pluginOptions: ServerOptions = {}) => {
  const merged = (options: ClientOptions): ClientOptions => ({
    ...options,
    api: { ...pluginOptions, ...options.api },
  });

  return {
    name: "@wolfstar/plugin-api",
    postInitialization: (_client, options) => installApi(merged(options)),
    postListen: (_client, options) => connectApi(merged(options)),
  };
});
```

(Confirm `ServerOptions` is exported from `Server.ts`; it is declared at the top of that file.) `src/module.ts`: as Task 1 with `defineModule<ServerOptions>`, name `@wolfstar/plugin-api`, JSDoc remark: `server` (node http options) and `cors`-style callbacks that are functions are not serialisable; use `ClientOptions.api` for them.

- [ ] **Step 5:** `pnpm vitest run packages/plugin-api tests/module-entries.test.ts` PASS (existing `index.test.ts` etc. untouched). README, changeset, gate, commit `feat(plugin-api): add module and plugin entries for defineModule`, PR, link, tick #173.

---

### Task 9: Wrap-up and issues

- [ ] **Step 1:** After the eighth PR is open, run `list_thread_pull_requests` and link any missing PR.
- [ ] **Step 2:** Re-read the AGENTS.md package list: update the descriptions that mention `./register` only, and confirm the Task 1 gotcha bullet is still accurate (for example with respect to `knip`).
- [ ] **Step 3:** Check which acceptance criteria of stars-components#245 are met by this work (`gh issue view 245 --repo wolfstar-project/stars-components`), list them in the report, and **ask the user** before closing or commenting. #251 (`meta.configKey`) stays open; #173 closes automatically when its last box is ticked and the user agrees.
- [ ] **Step 4:** Report to the user in Italian, briefly: the eight PRs, their stack order, what remains.

---

## Self-review notes

- Spec coverage: decisions 1-3 (Tasks 1-8, stack order, additive), why-subpaths (Global Constraints), layout (`hooks.ts`/`plugin.ts`/`module.ts`/`register.ts`), hooks table (Tasks 1, 2, 6, 7, 8), library modules (Tasks 3-5), package.json/build/docs (Step 1 of each task), tests (each task plus the root manifest test), AGENTS.md (Task 1), changeset per package, issues (Task 9).
- Open point to check at execution time (cannot be verified here because the Stars CLI is not installed in this repo): that the CLI resolves a `modules` entry given as a package subpath (`@wolfstar/plugin-x/module`) and still skips `<pkg>/register` for it. If it only dedupes on the bare package name, document "do not import `/register` by hand" in each README, which the plan already does.
- Known risk: eight stacked PRs all touch `pnpm-lock.yaml`; Kodiak squash-merges require restacking with `git rebase --onto origin/main <old-base>` after each merge.

# Port the existing plugins to `defineModule` / `definePlugin`

Date: 2026-10-04

## Goal

Every `@wolfstar/plugin-*` package that predates `plugin-scheduled-tasks` gains a `defineModule` entry
(`@wolfstar/kit`) and, where it has runtime hooks, a `definePlugin` factory (`@wolfstar/http-framework` 6.1), so
projects can list it in `modules` in `stars.config`. This is the migration tracked in #173 and the counterpart of
stars-components#245, which shipped the contract in framework 6.1.0 and kit 0.1.x.

`plugin-scheduled-tasks` (see `2026-10-03-plugin-scheduled-tasks-design.md`) is the reference implementation.

## Decisions taken with the maintainer

1. **Additive, no breaking change.** `./register` keeps its legacy behaviour on framework v3, v5 and v6; the new
   entries are new subpaths. Peer ranges on the framework do not change.
2. **Library packages** (`plugin-cache`, `plugin-gateway`, `plugin-sharder`) get a minimal module: `meta` and
   `addImports`, no runtime plugin. Their `./register` stays a no-op.
3. **One PR per package, stacked**, in the order of #173: logger, i18next, cache, sharder, gateway, broker,
   subcommands-advanced, api. Each PR ticks its own checkbox in #173.

## Why subpaths and not a root default export

`definePlugin` only exists from framework 6.1 and `defineModule` needs `@wolfstar/kit`. A root default export would
force both on every consumer, including those on framework v3/v5. `./module` and `./plugin` are imported only by the
CLI and by 6.1+ users, so `@wolfstar/kit` is an optional peer.

## Per-package layout (runtime-hook packages)

```
src/
  hooks.ts       the hook bodies as plain functions (shared)
  plugin.ts      default export = definePlugin((options) => ({ name, ...hooks }))
  module.ts      default export = defineModule(...)
  register.ts    legacy class + Client.plugins.register*Hook, now calling hooks.ts
```

- `hooks.ts` is the single source of the behaviour. `register.ts` and `plugin.ts` both call it, so the two activation
  paths cannot drift.
- `plugin.ts`: factory options are the base and `ClientOptions.<key>` is merged over them (`logger`, `i18n`,
  `broker`, `api`; `subcommands-advanced` has none). Plugin name is the package name. `plugin-logger` sets
  `enforce: "pre"`.
- `module.ts`: `meta.name` is the package name, `meta.compatibility.framework` is `">=6.1.0"`, `setup` calls
  `ctx.addPlugin({ from: "<pkg>/plugin", options })`. It does not call `addImports`: these packages are not meant to
  be auto-imported wholesale.
- Options written in `stars.config` must be JSON-serialisable (kit writes them into the built entry). Transports,
  instances and functions (`logger.transports`, `broker` clients, ...) stay on `ClientOptions` or the factory; each
  README says so.
- The CLI does not also import `<pkg>/register` for a package listed in `modules`, so the two paths never register
  twice. A project that imports `/register` by hand **and** lists the module is the user's mistake; documented, not
  guarded.

### Hooks per package

| Package                       | Hooks (unchanged)                                    | Notes                                                                                   |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `plugin-logger`               | `preGenericsInitialization`                          | `enforce: "pre"`.                                                                       |
| `plugin-i18next`              | `preGenericsInitialization`, `preLoad`, `postListen` | Watcher kept in shared module state; `I18nextPlugin.watcher` stays for the legacy side. |
| `plugin-broker`               | `preGenericsInitialization`, `postListen`            | Construct in the first, start in the second, as today.                                  |
| `plugin-subcommands-advanced` | `postInitialization`                                 | No options.                                                                             |
| `plugin-api`                  | `postInitialization`, `postListen`                   | Options from `ClientOptions.api`.                                                       |

## Library packages

`src/module.ts` only:

```ts
export default defineModule({
  meta: { name: "@wolfstar/plugin-cache", compatibility: { framework: ">=6.1.0" } },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-cache");
  },
});
```

No `plugin.ts`. `plugin-sharder` declares no framework peer today, so its `meta` omits `compatibility`.

## package.json, build, docs

- `exports`: add `./module` (and `./plugin` where present), same `import` shape as the existing entries.
- `scripts/tsdown.config.ts` per-package `entry` and `attwEntrypoints` gain the new files.
- `@wolfstar/kit` as a devDependency and as an optional peer (`peerDependenciesMeta`); versions follow the one
  `plugin-scheduled-tasks` uses. `sideEffects` unchanged.
- `tests/http-framework-peer-range.test.ts` is unaffected: framework peers do not change.
- README per package: the `modules` usage, the JSON-serialisable limit, and the legacy `./register`.
- `AGENTS.md`: update the package list and the activation notes once the first package lands, and the "Out of scope"
  statement of the scheduled-tasks spec no longer applies.
- `knip.json`: new entry files if it flags them.
- One `minor` changeset per package.

## Tests (per package)

- `plugin.test.ts`: a real `Client` with `plugins: [factory(...)]`; hooks ran, `ClientOptions` merge precedence, and
  for logger the `pre` ordering.
- `module.test.ts`: `setup` calls `addPlugin` with `from` and the options (and `addImports` for libraries).
- Parity: where the existing `register.test.ts` already exercises the hooks, run the same assertions against the
  plugin; both go through `hooks.ts`, so one shared case is enough.
- Existing tests must keep passing untouched, which is the check that `./register` is unchanged.

## Definition of done (each PR)

`pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass; changeset present; tick the box in #173.

## Issues

- **plugins#173**: ticked per PR, closed when the eighth lands.
- **stars-components#245**: its acceptance criteria also cover work in that repo (`shared-http-pieces`, docs,
  templates). After the plugins land, check each criterion and report which are met; closing waits for the
  maintainer's go-ahead.
- **stars-components#251** (`meta.configKey`): not resolved, stays open. The other open issues in both repos are
  unrelated.
- Closing or commenting on issues is visible to others: done only with explicit approval.

## Out of scope

- Dropping framework v3/v5 support or deleting `./register`.
- `meta.configKey` (not implemented in kit yet).
- Reading `ClientOptions` in the module's `setup` (it runs in the CLI process).

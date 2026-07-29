# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

`wolfstar-project/plugins` is a **pnpm + Turborepo monorepo of publishable TypeScript libraries** (currently one package: `@wolfstar/plugin-api`, under `packages/`). There is **no runnable app, frontend, backend, dev server, or database**. "Running" the project means build / typecheck / lint / test. Consumers embed the library into their own `@wolfstar/http-framework` Discord bot.

### Toolchain notes (non-obvious)

- `mise.toml` pins Node 24 + pnpm 11 (matches CI), but the Cloud VM's `node` is `v22.14.0` from `/exec-daemon` and is first on `PATH`, so it cannot be overridden. Node 22 satisfies the repo's `engines` (`>=20`), and build/test/lint/typecheck all pass on it.
- `pnpm` is provided via `corepack` (version `11.17.0`, pinned by `packageManager` in `package.json`). If `pnpm` is ever missing, run `corepack enable`.

### Commands (defined in root `package.json`)

- `pnpm build` — `turbo run build` (tsdown → `dist/`).
- `pnpm test` — `vitest run` (unit + in-process HTTP integration tests).
- `pnpm typecheck` — `turbo run typecheck` (`tsc --noEmit`).
- `pnpm lint` / `pnpm lint:fix` — oxlint + oxfmt.
- Turbo `test`/`typecheck` tasks `dependsOn: ["^build"]`, so a build is triggered as needed.

### Gotchas

- `pnpm clean` is broken: it runs `node scripts/clean.mjs`, but `scripts/` does not exist in the repo. Do not rely on it.
- Git hooks are active (husky): `pre-commit` runs nano-staged (oxfmt + `oxlint --fix`) and `commit-msg` runs commitlint. Commit messages **must** follow Conventional Commits.

### Exercising the core functionality (ApiServer)

The library's core is `ApiServer`, a standalone REST server (default port `4000`). To run it end-to-end: `pnpm build`, then instantiate `ApiServer`, register the route/middleware stores on `container.stores`, `loadMiddlewares()`, `loadListeners()`, load a `Route`, `container.stores.load()`, then `server.connect()`. See `packages/plugin-api/tests/ApiServer.test.ts` for the exact pattern.

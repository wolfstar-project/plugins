# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

`wolfstar-project/plugins` is a **pnpm + Turborepo monorepo of publishable TypeScript libraries**, under `packages/`:

- `@wolfstar/plugin-api` — the core REST server (`ApiServer`).
- `@wolfstar/plugin-subcommands-advanced` — modularizes slash subcommands into separate command classes.

There is **no runnable app, frontend, backend, dev server, or database**. "Running" the project means build / typecheck / lint / test. Consumers embed the libraries into their own `@wolfstar/http-framework` Discord bot.

### Toolchain notes (non-obvious)

- `mise.toml` pins Node 24 + pnpm 11 (matches CI), but the Cloud VM's `node` is `v22.14.0` from `/exec-daemon` and is first on `PATH`, so it cannot be overridden. Node 22 satisfies the root `engines` (`^22.11 || ^24 || >=26`, raised from `>=20` by `@changesets/cli` v3 — the published packages still declare `>=20.0.0`), and build/test/lint/typecheck all pass on it.
- `pnpm` is provided via `corepack` (version `11.17.0`, pinned by `packageManager` in `package.json`). If `pnpm` is ever missing, run `corepack enable`.

### Commands (defined in root `package.json`)

- `pnpm build` — `turbo run build` (tsdown → `dist/esm/`, shared options in `scripts/tsdown.config.ts`).
- `pnpm test` — `vitest run` (unit + in-process HTTP integration tests).
- `pnpm typecheck` — `turbo run typecheck` (`tsc --noEmit`).
- `pnpm lint` / `pnpm lint:fix` — oxlint + oxfmt.
- `pnpm run docs` — `typedoc` (config in root `typedoc.json`); note the explicit `run` is required because plain `pnpm docs` is intercepted by pnpm's built-in `docs` command and fails with `ERR_PNPM_MISSING_PACKAGE_NAME`. It generates API docs from each package's `src/index.ts` into `api/` (gitignored). Members marked `@internal` or `private` are excluded (`excludeInternal`/`excludePrivate`), so use that tag deliberately when adding public exports you don't want documented. CI publishes the same output (as JSON) to `wolfstar-project/docs` on pushes to `main`/`v*` tags via `.github/workflows/documentation.yml`.
- Turbo `test`/`typecheck` tasks `dependsOn: ["^build"]`, so a build is triggered as needed.

### Gotchas

- `pnpm clean` is broken: it runs `node scripts/clean.mjs`, but that file does not exist (only `scripts/tsdown.config.ts` is present). Do not rely on it.
- Git hooks are active (husky): `pre-commit` runs nano-staged (oxfmt + `oxlint --fix`) and `commit-msg` runs commitlint. Commit messages **must** follow Conventional Commits.
- Vitest is pinned to Vite 6 via `pnpm-workspace.yaml` overrides so TypeScript experimental decorators still transform through esbuild (Vite 8 / oxc does not).
- CI runs on GitHub-hosted runners (`ubuntu-24.04-arm` for `ci.yml`, `ubuntu-latest` for `release.yml`) — not Blacksmith, despite some now-superseded PR history.
- When adding a new package, add a matching `packages:<name>` entry to **both** `.github/labels.yml` (label sync) and `.github/labeler.yml` (path-based auto-labeling on PRs) — these can drift independently (e.g. `plugin-subcommands-advanced` currently has a label defined but no `labeler.yml` path mapping, so it's never auto-applied).
- Releases publish via CI (`release.yml`) using the `NPM_PUBLISH_TOKEN` secret (an npm granular _Automation_ token) so npm provenance/Sigstore attestation is attached; local `changeset publish` can't mint attestations and classic npm tokens fail with OTP errors. See `.changeset/README.md`.

### Exercising the core functionality (ApiServer)

The library's core is `ApiServer`, a standalone REST server (default port `4000`). To run it end-to-end: `pnpm build`, then instantiate `ApiServer`, register the route/middleware stores on `container.stores`, `loadMiddlewares()`, `loadListeners()`, load a `Route`, `container.stores.load()`, then `server.connect()`. See `packages/plugin-api/tests/ApiServer.test.ts` for the exact pattern.

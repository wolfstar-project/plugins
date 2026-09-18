# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is

`wolfstar-project/plugins` is a **pnpm + Turborepo monorepo of publishable TypeScript libraries**, under `packages/`:

- `@wolfstar/plugin-api` — the core REST server (`ApiServer`).
- `@wolfstar/plugin-i18next` — i18next-powered internationalization for HTTP interactions.
- `@wolfstar/plugin-logger` — pluggable logger (console, Sentry, and optional consola/evlog/winston adapter subpaths) replacing the framework's built-in console logger.
- `@wolfstar/plugin-subcommands-advanced` — modularizes slash subcommands into separate command classes.

There is **no runnable app, frontend, backend, dev server, or database**. "Running" the project means build / typecheck / lint / test. Consumers embed the libraries into their own `@wolfstar/http-framework` Discord bot.

### Toolchain notes (non-obvious)

- `mise.toml` pins Node 24 + pnpm 12 (matches CI), but the Cloud VM's `node` is `v22.14.0` from `/exec-daemon` and is first on `PATH`, so it cannot be overridden. Node 22 satisfies the root `engines` (`^22.11 || ^24 || >=26`, raised from `>=20` by `@changesets/cli` v3 — the published packages still declare `>=20.0.0`), and build/test/lint/typecheck all pass on it.
- `pnpm` is provided via `corepack` (version `12.3.1`, pinned by `packageManager` in `package.json`). If `pnpm` is ever missing, run `corepack enable`.
- TypeScript is on the `7.0.2` major (bumped from `~5.8.3`). Typechecking no longer goes through `tsc`/`turbo run typecheck` — see the `pnpm typecheck` entry below.

### Commands (defined in root `package.json`)

- `pnpm build` — `turbo run build` (tsdown → `dist/esm/`, shared options in `scripts/tsdown.config.ts`).
- `pnpm test` — `vitest run` (unit + in-process HTTP integration tests).
- `pnpm typecheck` — `golar typecheck && golar tsc --noEmit -p packages/plugin-i18next/tsconfig.consumption.json` (config in root `golar.config.ts`; replaced `turbo run typecheck` / per-package `tsc --noEmit` scripts). `golar typecheck` glob-checks `packages/*/src/**/*.ts` directly and does **not** read `tsconfig.json`/`project` options, so it can't resolve `plugin-i18next`'s type-level consumption test (which imports `node:url`) — that's why it's checked separately via `golar tsc`, a real TypeScript-CLI passthrough, against `tsconfig.consumption.json`.
- `pnpm lint` / `pnpm lint:fix` — oxlint + oxfmt.
- `pnpm run docs` — runs `typedoc` via `scripts/generate-docs.mjs` (config in root `typedoc.json`); note the explicit `run` is required because plain `pnpm docs` is intercepted by pnpm's built-in `docs` command and fails with `ERR_PNPM_MISSING_PACKAGE_NAME`. The wrapper script installs typedoc against an isolated `typescript@^5.9.3` in a throwaway directory instead of this repo's `typescript@7.0.2`: typedoc@0.28.20's peer range tops out at 6.0.x and crashes against the experimental TS 7 API, and pnpm has no way to give a single devDependency its own nested peer version. It generates API docs from each package's `src/index.ts` and `src/register.ts` into `api/` (gitignored). Members marked `@internal` or `private` are excluded (`excludeInternal`/`excludePrivate`), so use that tag deliberately when adding public exports you don't want documented. CI publishes the same output (as JSON) to `wolfstar-project/docs` on pushes to `main`/`v*` tags via `.github/workflows/documentation.yml`.
- Turbo's `test` task `dependsOn: ["^build"]`, so a build is triggered as needed. `typecheck` is no longer a Turbo task (removed from `turbo.json`) — it now runs once at the repo root via `golar`, independent of package builds.

### Gotchas

- `pnpm clean` is broken: it runs `node scripts/clean.mjs`, but that file does not exist (only `scripts/tsdown.config.ts` is present). Do not rely on it.
- Git hooks are active (husky): `pre-commit` runs nano-staged (oxfmt + `oxlint --fix`) and `commit-msg` runs commitlint. Commit messages **must** follow Conventional Commits.
- Vitest is **not** pinned to a specific Vite major anymore (the `pnpm-workspace.yaml` overrides forcing Vite 6 were dropped); it currently resolves Vite 6 naturally. `vitest.config.ts` still forces `esbuild.tsconfigRaw.compilerOptions.experimentalDecorators` for `plugin-subcommands-advanced`'s legacy-decorator tests — Vite 8 defaults to oxc, which ignores that esbuild option in favor of `oxc.typescript.decorators`, so migrate to that setting before letting Vite resolve past 7.
- CI runs on GitHub-hosted runners (`ubuntu-24.04-arm` for `ci.yml` and `pkg-pr-new.yml`, `ubuntu-latest` for `release.yml`) — not Blacksmith, despite some now-superseded PR history.
- When adding a new package, add a matching `packages:<name>` entry to **both** `.github/labels.yml` (label sync) and `.github/labeler.yml` (path-based auto-labeling on PRs) — these can drift independently (e.g. `plugin-subcommands-advanced` currently has a label defined but no `labeler.yml` path mapping, so it's never auto-applied).
- Releases publish via CI (`release.yml`) using npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC, no long-lived token) so npm provenance/Sigstore attestation is attached; local `changeset publish` can't mint attestations. See `.changeset/README.md`.
- Every push to any branch (see `.github/workflows/pkg-pr-new.yml`) builds the packages and publishes preview tarballs to [pkg.pr.new](https://pkg.pr.new) via `pnpm exec pkg-pr-new publish`, so unreleased changes from any branch/PR can be installed directly without waiting for a real release.

### Exercising the core functionality (ApiServer)

The library's core is `ApiServer`, a standalone REST server (default port `4000`). To run it end-to-end: `pnpm build`, then instantiate `ApiServer`, register the route/middleware stores on `container.stores`, `loadMiddlewares()`, `loadListeners()`, load a `Route`, `container.stores.load()`, then `server.connect()`. See `packages/plugin-api/tests/ApiServer.test.ts` for the exact pattern.

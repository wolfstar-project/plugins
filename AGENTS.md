# AGENTS.md

## What this repo is

`wolfstar-project/plugins` is a **pnpm + Turborepo monorepo of publishable TypeScript libraries**, under `packages/`:

- `@wolfstar/plugin-api` — the core REST server (`ApiServer`).
- `@wolfstar/plugin-broker` — distributes gateway events across processes over Redis Streams (at-least-once delivery).
- `@wolfstar/plugin-cache` — pluggable, storage-agnostic Discord entity cache (in-memory and Redis) for `plugin-gateway`.
- `@wolfstar/plugin-gateway` — Gateway (WebSocket) support: a `GatewayClient` emitting Structures, backed by a pluggable cache.
- `@wolfstar/plugin-i18next` — i18next-powered internationalization for HTTP interactions.
- `@wolfstar/plugin-logger` — pluggable logger (console, Sentry, and optional consola/evlog/winston adapter subpaths) replacing the framework's built-in console logger.
- `@wolfstar/plugin-scheduled-tasks` — one-off and repeated tasks as pieces, backed by BullMQ; the first package built on `definePlugin` (framework 6.1) and `defineModule` (`@wolfstar/kit`), with a no-op `./register`.
- `@wolfstar/plugin-sharder` — multi-process sharding for `plugin-gateway` (processes, cluster workers, or worker threads).
- `@wolfstar/plugin-subcommands-advanced` — modularizes slash subcommands into separate command classes.

There is **no runnable app, frontend, backend, dev server, or database**. "Running" the project means build / typecheck / lint / test. Consumers embed the libraries into their own `@wolfstar/http-framework` Discord bot.

## Toolchain notes (non-obvious)

- `mise.toml` pins Node 24 + pnpm 12 (matches CI). The root `engines` is `^22.11 || ^24 || >=26` (raised from `>=20` by `@changesets/cli` v3 — most published packages still declare `>=20.0.0`; `plugin-api` declares `>=20.18.1` (`undici`) and `plugin-gateway` `>=24.17.0`).
- `pnpm` is provided via `corepack` (pinned by `packageManager` in `package.json`; Renovate bumps it often, so check that field rather than hardcoding a version here). If `pnpm` is ever missing, run `corepack enable`.
- TypeScript is on the `7.0.2` major (bumped from `~5.8.3`). Typechecking no longer goes through `tsc`/`turbo run typecheck` — see the `pnpm typecheck` entry below.

## Commands (defined in root `package.json`)

- `pnpm build` — `turbo run build` (tsdown → `dist/esm/`, shared options in `scripts/tsdown.config.ts`).
- `pnpm test` — `vitest run` (unit + in-process HTTP integration tests).
- `pnpm typecheck` — `golar typecheck`, then `golar tsc --noEmit -p packages/<name>/tsconfig.consumption.json` for each package that has a type-level consumption test (currently `plugin-i18next`, `plugin-cache`, `plugin-gateway`, `plugin-broker`, `plugin-scheduled-tasks`; config in root `golar.config.ts`; replaced `turbo run typecheck` / per-package `tsc --noEmit` scripts). `golar typecheck` glob-checks `packages/*/src/**/*.ts` directly and does **not** read `tsconfig.json`/`project` options, so it can't resolve those consumption tests (e.g. `plugin-i18next`'s imports `node:url`) — that's why each is checked separately via `golar tsc`, a real TypeScript-CLI passthrough, against its `tsconfig.consumption.json`. A new package with a `tsconfig.consumption.json` must be appended to the root `typecheck` script.
- `pnpm lint` / `pnpm lint:fix` — oxlint + oxfmt.
- `pnpm run docs` — runs `typedoc` via `scripts/generate-docs.mjs` (config in root `typedoc.json`); note the explicit `run` is required because plain `pnpm docs` is intercepted by pnpm's built-in `docs` command and fails with `ERR_PNPM_MISSING_PACKAGE_NAME`. The wrapper script installs typedoc against an isolated `typescript@^5.9.3` in a throwaway directory instead of this repo's `typescript@7.0.2`: typedoc@0.28.20's peer range tops out at 6.0.x and crashes against the experimental TS 7 API, and pnpm has no way to give a single devDependency its own nested peer version. It generates API docs from each package's `src/index.ts` and `src/register.ts` into `api/` (gitignored). Members marked `@internal` or `private` are excluded (`excludeInternal`/`excludePrivate`), so use that tag deliberately when adding public exports you don't want documented. CI publishes the same output (as JSON) to `wolfstar-project/docs` on pushes to `main`/`v*` tags via `.github/workflows/documentation.yml`.
- Turbo's `test` task `dependsOn: ["^build"]`, so a build is triggered as needed. `typecheck` is no longer a Turbo task (removed from `turbo.json`) — it now runs once at the repo root via `golar`, independent of package builds.

## Gotchas

- `pnpm clean` is broken: it runs `node scripts/clean.mjs`, but that file does not exist (only `scripts/tsdown.config.ts` is present). Do not rely on it.
- Git hooks are active (husky): `pre-commit` runs nano-staged (oxfmt + `oxlint --fix`) and `commit-msg` runs commitlint. Commit messages **must** follow Conventional Commits.
- Vitest is **not** pinned to a specific Vite major anymore (the `pnpm-workspace.yaml` overrides forcing Vite 6 were dropped); it currently resolves Vite 6 naturally. `vitest.config.ts` still forces `esbuild.tsconfigRaw.compilerOptions.experimentalDecorators` for `plugin-subcommands-advanced`'s legacy-decorator tests — Vite 8 defaults to oxc, which ignores that esbuild option in favor of `oxc.typescript.decorators`, so migrate to that setting before letting Vite resolve past 7.
- CI runs on GitHub-hosted runners (`ubuntu-24.04-arm` for `ci.yml` and `pkg-pr-new.yml`, `ubuntu-latest` for `release.yml`) — not Blacksmith, despite some now-superseded PR history.
- When adding a new package, add a matching `packages:<name>` entry to **both** `.github/labels.yml` (label sync) and `.github/labeler.yml` (path-based auto-labeling on PRs) — these can drift independently (e.g. `plugin-subcommands-advanced` currently has no `labeler.yml` path mapping, and its `labels.yml` entry is misspelled `packages:plugins-subcommands-advanced`, so it's never auto-applied).
- When adding a new package, also add its name to the `scopes` list of `.github/workflows/semantic-pull-requests.yml`. That workflow runs on `pull_request_target`, so it validates a PR title against the list on the **base** branch: the PR that adds the package cannot use its own scope yet (`plugin-scheduled-tasks` was added as `feat: …` for that reason).
- Releases publish via CI (`release.yml`) using npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC, no long-lived token) so npm provenance/Sigstore attestation is attached; local `changeset publish` can't mint attestations. See `.changeset/README.md`.
- `pnpm run publish:snapshot` (`scripts/publish-snapshot.mjs`, run by the `snapshot` job on every push to `main` touching `packages/`) wraps `changeset publish` in `scripts/run-with-retry.mjs`, retrying up to 3 times (20s apart) because `changeset publish` fires one concurrent OIDC token exchange per package and npm intermittently 404s a subset instead of rate-limiting; already-published versions are skipped on retry. `pnpm run publish` (the tagged-release path, invoked by `changesets/action` via `release.yml`) does not use this retry wrapper yet.
- `tests/http-framework-peer-range.test.ts` (part of `pnpm test`, so the CI `unit` job) fails when any non-private package's `peerDependencies["@wolfstar/http-framework"]` excludes the framework version the workspace installs (its devDependency, kept on the latest release by Renovate), when a package declaring that peer doesn't also devDepend on it, or when the packages' peer ranges accept different majors (a package whose range starts at a later major, like `plugin-scheduled-tasks`' `^6.1.0`, only has to match from that major up). When Renovate bumps the framework to a new major, widen **every** plugin's peer range (`^x || ^<new>.0.0`) in the same PR **and** add a patch changeset per package — a peer-range change on `main` isn't published without one (that is how `plugin-api`/`plugin-logger`/`plugin-subcommands-advanced` shipped `^3`-only peers to npm after the v5 bump, #121).
- Activation has two paths. `plugin-scheduled-tasks` is module-only (its `./register` is a no-op). The older plugins ship `./module` (default export: `defineModule` from `@wolfstar/kit`, optional peer) and, for those with runtime hooks, `./plugin` (default export: a `definePlugin` factory); `./register` stays the legacy class + `Client.plugins.register*Hook` path for framework v3/v5/v6. Both call the same functions in `src/hooks.ts`, so change behaviour there. The `stars` CLI never imports `<pkg>/register` itself; it only preloads the sources registered through `ctx.addPlugin`, so a user's own `import "<pkg>/register"` (or passing the `./plugin` factory to `plugins` while also importing `/register`) still double-installs the hooks. `tests/module-entries.test.ts` checks that every `src/module.ts` (except `plugin-scheduled-tasks`, excluded on purpose) is exported, built and has kit as an optional peer.
- Every push to any branch (see `.github/workflows/pkg-pr-new.yml`) builds the packages and publishes preview tarballs to [pkg.pr.new](https://pkg.pr.new) via `pnpm exec pkg-pr-new publish`, so unreleased changes from any branch/PR can be installed directly without waiting for a real release.

## Exercising the core functionality (ApiServer)

The library's core is `ApiServer`, a standalone REST server (default port `4000`). To run it end-to-end: `pnpm build`, then instantiate `ApiServer`, register the route/middleware stores on `container.stores`, `loadMiddlewares()`, `loadListeners()`, load a `Route`, `container.stores.load()`, then `server.connect()`. See `packages/plugin-api/tests/ApiServer.test.ts` for the exact pattern.

## Secrets, approvals, and definition of done

- **Secrets:** never commit them. `.env` and `.env.*` are gitignored (`.env.example` is exempted for templates, though none exists yet). CI secrets (`WOLFSTAR_TOKEN`, `CODECOV_TOKEN`, AI provider keys for the review workflows) live in GitHub Actions secrets. npm publishing uses OIDC trusted publishing, so no npm token exists anywhere.
- **Ask before:** publishing to npm or running `pnpm run publish`/`publish:snapshot` locally, dispatching the `Release` workflow, force-pushing or rewriting history on shared branches, and deleting branches, tags, or releases.
- **Done** means: `pnpm lint`, `pnpm build`, `pnpm typecheck`, and `pnpm test` pass locally; a changeset exists for every user-facing package change (CI's `🦋 Verify changesets` runs `changeset status --since=origin/<base>` and fails without one); tests are added or updated for behaviour changes; and this file is updated when commands, packages, CI, or release flow change.

## Cloud VM notes

Applies to any agent running in a cloud VM (Cursor Cloud, Claude Code on the web, …), not to local development.

- The VM's default Node may differ from the Node 24 pinned by CI and `mise.toml` (Cursor Cloud has shipped v22.x first on `PATH`); check `node -v`. Any version in `engines` works for build/test/lint/typecheck.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

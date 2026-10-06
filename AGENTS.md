# AGENTS.md

Project conventions discovered for `plugins` (`wolfstar-project/plugins`).

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

## Stack

- **Language:** TypeScript (`7.0.2` major, bumped from `~5.8.3`), Node `^22.11 || ^24 || >=26` (the range required by Changesets v3, raised from `>=20`; most published packages still declare `>=20.0.0`, `plugin-api` declares `>=20.18.1` (`undici`) and `plugin-gateway` `>=24.17.0`). `mise.toml` pins Node 24 + pnpm 12 (matches CI).
- **Package manager:** `pnpm` (corepack-pinned via `packageManager` in root `package.json`; Renovate bumps it often — check that field for the exact pin, don't hardcode it here; if `pnpm` is ever missing, run `corepack enable`). Workspaces via `pnpm-workspace.yaml`.
- **Monorepo runner:** `turbo` (`turbo run build`; `test` `dependsOn: ["^build"]`, so a build is triggered as needed).
- **Bundler:** `tsdown` per package (→ `dist/esm/`, shared options in `scripts/tsdown.config.ts`).
- **Typecheck:** `golar` (`golar typecheck`, plus `golar tsc` per package consumption test; config in root `golar.config.ts`). It is not a Turbo task: it runs once at the repo root, independent of package builds.
- **Tests:** `vitest` (single root `vitest.config.ts`).
- **Lint:** `oxlint`.
- **Format:** `oxfmt`.
- **Docs:** `typedoc` through `scripts/generate-docs.mjs` (see Commands); CI publishes the output to `wolfstar-project/docs`.
- **Release:** [Changesets](https://github.com/changesets/changesets) v3 (`@changesets/cli` + `changesets/action` in CI, see `.github/workflows/release.yml`). Packages version independently, not in lockstep (`.changeset/config.json` has `fixed: []`, `linked: []`); `updateInternalDependencies: patch` bumps workspace dependents; `format: "oxfmt"` makes generated changelogs satisfy `oxfmt --check`. Publishes authenticate via npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC, no long-lived token), which attaches npm provenance/Sigstore attestation; local `changeset publish` can't mint attestations. See `.changeset/README.md`.

## Quality gates (in order)

1. `pnpm lint`
2. `pnpm build`
3. `pnpm typecheck`
4. `pnpm test`

## Commands

```bash
pnpm install                              # setup (also installs the husky hooks)
pnpm build                                # turbo run build (tsdown per package)
pnpm typecheck                            # golar typecheck + golar tsc per consumption tsconfig
pnpm lint                                 # oxlint + oxfmt --check over packages
pnpm lint:fix                             # oxlint --fix + oxfmt --write
pnpm test                                 # vitest run (unit + in-process HTTP integration tests)
pnpm vitest run <path>                    # single test file, e.g. pnpm vitest run packages/plugin-api/tests/Route.test.ts
pnpm vitest run <path> -t "<name>"        # single test by name
pnpm --filter @wolfstar/plugin-api build  # build one package (tsdown)
pnpm --filter @wolfstar/plugin-api test   # one package's tests
pnpm run docs                             # typedoc into api/ (gitignored); the explicit `run` is required
pnpm changeset                            # add a changeset (`pnpm changeset --empty` when no release is needed)
```

- `pnpm typecheck` runs `golar typecheck`, then `golar tsc --noEmit -p packages/<name>/tsconfig.consumption.json` for each package that has a type-level consumption test (currently `plugin-i18next`, `plugin-cache`, `plugin-gateway`, `plugin-broker`, `plugin-scheduled-tasks`; it replaced `turbo run typecheck` / per-package `tsc --noEmit` scripts). `golar typecheck` glob-checks `packages/*/src/**/*.ts` directly and does **not** read `tsconfig.json`/`project` options, so it can't resolve those consumption tests (e.g. `plugin-i18next`'s imports `node:url`) — that's why each is checked separately via `golar tsc`, a real TypeScript-CLI passthrough, against its `tsconfig.consumption.json`. A new package with a `tsconfig.consumption.json` must be appended to the root `typecheck` script.
- The root `vitest.config.ts` is the only Vitest config: it aliases `@wolfstar/plugin-cache` and `@wolfstar/plugin-gateway` to their sources, so those tests never need a prior build. Tests live in each package's `tests/` directory, plus repo-level checks in the root `tests/`.
- Vitest is **not** pinned to a specific Vite major (the `pnpm-workspace.yaml` overrides forcing Vite 6 were dropped); it currently resolves Vite 6 naturally. `vitest.config.ts` still forces `esbuild.tsconfigRaw.compilerOptions.experimentalDecorators` for `plugin-subcommands-advanced`'s legacy-decorator tests — Vite 8 defaults to oxc, which ignores that esbuild option in favor of `oxc.typescript.decorators`, so migrate to that setting before letting Vite resolve past 7.
- Per-package `pnpm --filter <pkg> lint` runs `oxlint src --fix`, which rewrites files; use the root `pnpm lint` for a read-only check.
- `pnpm run docs` (plain `pnpm docs` is intercepted by pnpm's built-in `docs` command and fails with `ERR_PNPM_MISSING_PACKAGE_NAME`) runs `typedoc` via `scripts/generate-docs.mjs` (config in root `typedoc.json`). The wrapper script installs typedoc against an isolated `typescript@^5.9.3` in a throwaway directory instead of this repo's `typescript@7.0.2`: typedoc@0.28.20's peer range tops out at 6.0.x and crashes against the experimental TS 7 API, and pnpm has no way to give a single devDependency its own nested peer version. It generates API docs from each package's `src/index.ts` and `src/register.ts` into `api/`. Members marked `@internal` or `private` are excluded (`excludeInternal`/`excludePrivate`), so use that tag deliberately when adding public exports you don't want documented. CI publishes the same output (as JSON) to `wolfstar-project/docs` on pushes to `main`/`v*` tags via `.github/workflows/documentation.yml`.
- `pnpm clean` is broken: it runs `node scripts/clean.mjs`, but that file does not exist (only `scripts/tsdown.config.ts` is present). Do not rely on it.
- Do not run `pnpm run publish` or `pnpm run publish:snapshot` locally without asking (see "Secrets, approvals, and definition of done").

## Conventions

- Commits: Conventional Commits. Git hooks are active (husky): `pre-commit` runs nano-staged (oxfmt + `oxlint --fix`) and `commit-msg` runs commitlint, which rejects non-conforming messages.
- PR titles follow Conventional Commits and are validated by `.github/workflows/semantic-pull-requests.yml` (types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`; the subject must not start with an uppercase letter). Scope rules:
  - Use the package name as the scope (e.g. `feat(plugin-gateway): ...`, `fix(plugin-api): ...`). Documentation about a package uses that package's scope too (e.g. `docs(plugin-cache): ...`).
  - Use `deps` for dependency updates, `release` for the release PR, and `ci` for workflow changes.
  - Omit the scope when the change is too broad for a single one.
  - A new package must be added to the `scopes` list in that workflow. It runs on `pull_request_target`, so it validates a PR title against the list on the **base** branch: the PR that adds the package cannot use its own scope yet (`plugin-scheduled-tasks` was added as `feat: …` for that reason).
- PR description: always create PRs using [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) — fill in every section (linked issue, context, description, key changes, type of change, pre-flight checklist) instead of writing a free-form body. Tick the checklist items that apply, never drop a section, and pass the filled template to `gh pr create --body-file`.
- Skills: when you need to commit, use the `/git-commit` skill if it is available in your environment (otherwise commit by hand following the Conventional Commits rules); when you need to open a PR, use the `/create-pull-request` skill if available (otherwise `gh pr create`). Either way the PR must follow the template rule above.
- To implement a `feature` issue, use the repo skill `/implement-issue` (`.claude/skills/implement-issue/`): it reads the implementation plan Pullfrog posted on the issue, checks it against the code, then follows the conventions in this file through to the PR.
- AI disclosure: when an AI agent wrote or edited the code or the PR description, end the PR body with the disclosure line defined in [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md#ai-assisted-contributions), naming the tool and the exact model ids you ran on (never a guess).
- Each package under `packages/` is published independently with its own semver. Merging a changeset (`pnpm changeset`) to `main` makes `changesets/action` open/update a `chore: update changelog and release` PR; merging that PR bumps the affected packages' versions, regenerates their CHANGELOGs (via `.changeset/generator.ts`), and publishes to npm. Any other push to `main` touching `packages/` also publishes an `@next` snapshot (`pnpm run publish:snapshot` → `scripts/publish-snapshot.mjs`, run by the `snapshot` job). That script wraps `changeset publish` in `scripts/run-with-retry.mjs`, retrying up to 3 times (20s apart) because `changeset publish` fires one concurrent OIDC token exchange per package and npm intermittently 404s a subset instead of rate-limiting; already-published versions are skipped on retry. `pnpm run publish` (the tagged-release path, invoked by `changesets/action` via `release.yml`) does not use this retry wrapper yet.
- `pkg.pr.new` continuous preview releases (`.github/workflows/pkg-pr-new.yml`): every push to any branch builds the packages and publishes preview tarballs via `pnpm exec pkg-pr-new publish`, so unreleased changes from any branch/PR can be installed directly without waiting for a real release.
- `.github/workflows/pullfrog.yml` runs an AI coding agent (the Pullfrog Action) on `workflow_dispatch` with a `prompt` input, used for scheduled/manual maintenance tasks. `.github/workflows/renovate-changeset.yml` adds the changeset for Renovate dependency PRs touching `packages/**`.
- CI runs on GitHub-hosted runners (`ubuntu-24.04-arm` for `ci.yml` and `pkg-pr-new.yml`, `ubuntu-latest` for `release.yml`) — not Blacksmith, despite some now-superseded PR history.
- Adding a new package: add a matching `packages:<name>` entry to **both** `.github/labels.yml` (label sync) and `.github/labeler.yml` (path-based auto-labeling on PRs) — these can drift independently (e.g. `plugin-subcommands-advanced` currently has no `labeler.yml` path mapping, and its `labels.yml` entry is misspelled `packages:plugins-subcommands-advanced`, so it's never auto-applied) — add its name to the `scopes` list of `semantic-pull-requests.yml`, and append its `tsconfig.consumption.json` (if any) to the root `typecheck` script.
- `tests/http-framework-peer-range.test.ts` (part of `pnpm test`, so the CI `unit` job) fails when any non-private package's `peerDependencies["@wolfstar/http-framework"]` excludes the framework version the workspace installs (its devDependency, kept on the latest release by Renovate), when a package declaring that peer doesn't also devDepend on it, or when the packages' peer ranges accept different majors (a package whose range starts at a later major, like `plugin-scheduled-tasks`' `^6.1.0`, only has to match from that major up). When Renovate bumps the framework to a new major, widen **every** plugin's peer range (`^x || ^<new>.0.0`) in the same PR **and** add a patch changeset per package — a peer-range change on `main` isn't published without one (that is how `plugin-api`/`plugin-logger`/`plugin-subcommands-advanced` shipped `^3`-only peers to npm after the v5 bump, #121).
- Activation has two paths. `plugin-scheduled-tasks` is module-only (its `./register` is a no-op). The older plugins ship `./module` (default export: `defineModule` from `@wolfstar/kit`, optional peer) and, for those with runtime hooks, `./plugin` (default export: a `definePlugin` factory); `./register` stays the legacy class + `Client.plugins.register*Hook` path for framework v3/v5/v6. Both call the same functions in `src/hooks.ts`, so change behaviour there. The `stars` CLI never imports `<pkg>/register` itself; it only preloads the sources registered through `ctx.addPlugin`, so a user's own `import "<pkg>/register"` (or passing the `./plugin` factory to `plugins` while also importing `/register`) still double-installs the hooks. `tests/module-entries.test.ts` checks that every `src/module.ts` (except `plugin-scheduled-tasks`, excluded on purpose) is exported, built and has kit as an optional peer.

## Notes for agents

- Do NOT touch `pnpm-lock.yaml` manually; let `pnpm install` regenerate it after `package.json` edits.
- Do not edit `package.json#version` or a package's `CHANGELOG.md` by hand; both are owned by Changesets. Add a changeset via `pnpm changeset` for any user-facing change instead. Manual/hotfix publishes are done by re-running the `Release` workflow via `workflow_dispatch`.
- `pnpm lint` / `pnpm lint:fix` run `oxlint`/`oxfmt` across `packages` only.
- Exercising the core (`ApiServer`, a standalone REST server on default port `4000`): `pnpm build`, then instantiate `ApiServer`, register the route/middleware stores on `container.stores`, `loadMiddlewares()`, `loadListeners()`, load a `Route`, `container.stores.load()`, then `server.connect()`. See `packages/plugin-api/tests/ApiServer.test.ts` for the exact pattern.

## Secrets, approvals, and definition of done

- **Secrets:** never commit them. `.env` and `.env.*` are gitignored (`.env.example` is exempted for templates, though none exists yet). CI secrets (`WOLFSTAR_TOKEN`, `CODECOV_TOKEN`, AI provider keys for the review workflows) live in GitHub Actions secrets. npm publishing uses OIDC trusted publishing, so no npm token exists anywhere.
- **Ask before:** publishing to npm or running `pnpm run publish`/`publish:snapshot` locally, dispatching the `Release` workflow, force-pushing or rewriting history on shared branches, and deleting branches, tags, or releases.
- **Done** means: the four quality gates above pass locally; a changeset exists for every user-facing package change (CI's `🦋 Verify changesets` runs `changeset status --since=origin/<base>` and fails without one); tests are added or updated for behaviour changes; and this file is updated when commands, packages, CI, or release flow change.

## Cloud VM notes

Applies to any agent running in a cloud VM (Cursor Cloud, Claude Code on the web, …), not to local development.

- The VM's default Node may differ from the Node 24 pinned by CI and `mise.toml` (Cursor Cloud has shipped v22.x first on `PATH`); check `node -v`. Any version in `engines` works for every gate.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

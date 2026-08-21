# Releasing with Changesets

plugins uses [`@changesets/cli`](https://github.com/changesets/changesets) v3 for monorepo releases.
Each `@wolfstar/*` package is versioned independently according to the changesets included in each release.

Changesets v3 requires Node `^22.11 || ^24 || >=26` and pnpm `>=10` — both already pinned by
`mise.toml` and `packageManager`. Changelog and changeset files are formatted with oxfmt
(`"format": "oxfmt"` in `config.json`).

---

## Development workflow: adding a changeset

Every pull request that changes publishable package code **must** include a changeset file.

```sh
pnpm changeset
```

The interactive CLI will ask:

1. Which packages are affected
2. Bump type: `patch` / `minor` / `major`
3. A short summary for the changelog

This creates a `.changeset/<random-slug>.md` file. Commit it alongside your code changes.

If a change does not need a release (docs, CI-only, etc.), run:

```sh
pnpm changeset add --empty
```

Optional metadata in the changeset summary (parsed by `.changeset/generator.ts`):

- `pr: #123` — link the entry to a pull request
- `commit: abc1234` — link to a specific commit
- `author: @username` — credit a contributor in the changelog

---

## One-time setup (required before first release)

### 1. Allow GitHub Actions to create pull requests

Under **Settings → Actions → General → Workflow permissions**, enable
**Allow GitHub Actions to create and approve pull requests**.

Without this, `changesets/action` fails when it attempts to open the release PR.

### 2. Configure secrets

Repository secrets (**Settings → Secrets and variables → Actions**):

| Secret              | Description                                                                                                                                                                                                                                                                                        |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WOLFSTAR_TOKEN`    | A GitHub PAT with `repo` and `workflow` scopes. Passed to `changesets/action` through its `github-token` input (v2 ignores the `GITHUB_TOKEN` environment variable) to push commits and open PRs; also exposed as `GITHUB_TOKEN` to the `@next` snapshot changelog generator.                      |
| `NPM_PUBLISH_TOKEN` | An npm **granular access token** with type **Automation** (bypasses 2FA) and publish access to all `@wolfstar/*` packages. Same pattern as [`skyra-project/archid-components`](https://github.com/skyra-project/archid-components). Classic tokens fail with `ERR_PNPM_OTP_NON_INTERACTIVE` in CI. |

`release.yml` wires this secret as `NODE_AUTH_TOKEN` (for `actions/setup-node` / pnpm).
`changesets/action` v2 no longer writes an `.npmrc` from `NPM_TOKEN`, so npm authentication
comes solely from `actions/setup-node`'s `registry-url`. Provenance attestations are produced
in CI via `id-token: write` + `publishConfig.provenance: true` (and `NPM_CONFIG_PROVENANCE`).

### 3. Install the autofix.ci GitHub App (optional)

`.github/workflows/autofix.yml` uses the [autofix.ci](https://autofix.ci) GitHub App to
push lint/format fixes back to PR branches. Install it at <https://github.com/apps/autofix-ci>.

---

## Release runbook

### Cutting a stable release

1. Merge one or more PRs that include changeset files.
2. The `release` job in `.github/workflows/release.yml` automatically creates or updates a
   **"chore: update changelog and release"** PR. This PR bumps affected package versions and updates CHANGELOGs.
3. Review the PR and optionally edit the changelog entries.
4. Merge the PR. `changesets/action` publishes the bumped packages to npm automatically
   with provenance attestation and creates GitHub Releases.

Only packages with pending changesets are versioned and published.

### Local release scripts

| Script                      | Purpose                                           |
| :-------------------------- | :------------------------------------------------ |
| `pnpm changeset`            | Add a changeset file (`changeset add`)            |
| `pnpm run publish:dry-run`  | Version, build, and simulate npm publish locally  |
| `pnpm run publish:snapshot` | Publish a `@next` snapshot (CI uses this)         |
| `pnpm run publish`          | Version, build, and publish to npm (CI uses this) |

Prefer publishing from CI so packages keep npm provenance (Sigstore). Local
`changeset publish` with `publishConfig.provenance: true` cannot mint attestations and
often fails with a misleading `E404` on `PUT`.

### Recovering a failed publish

If the automatic publish step in `release.yml` fails after the release PR is merged:

1. Confirm `NPM_PUBLISH_TOKEN` is a granular **Automation** token with publish access to
   the affected `@wolfstar/*` packages (not a classic token).
2. Re-run the failed **Create Release PR or Publish** job from **Actions**, or trigger
   **release** manually via **Run workflow** on `main`.
3. The job runs `pnpm run publish` (`pnpm build && changeset publish`).
   `changeset publish` is idempotent and skips packages already published at the current version.

Use this only when versions on `main` are already bumped and you need to retry npm publish.
It does not create or update the release PR.

### Canary (`@next`) channel

The `snapshot` job in `release.yml` publishes affected packages under the dist-tag `next`
whenever `main` receives a push that changes `packages/` or root `package.json`. Version bumps use
Changesets calculated snapshots (for example `1.2.3-next-20260816123456`) via `pnpm run publish:snapshot`.

Snapshot publish is skipped when the push commit message contains `chore: version packages` or `chore: update changelog and release` (the release PR merge commit).
`scripts/publish-snapshot.mjs` also exits early when no changesets are pending: `changeset version`
fails with exit code 1 in that case (v3 behaviour) so that a no-op version step can never be
followed by a publish that tags already-released versions as `next`.

No manual action is needed. Consumers can install the latest canary via:

```sh
pnpm add @wolfstar/http-framework@next
```

---

## Version policy

- Each package has its own semver. Select only the packages you changed when running `pnpm changeset`.
- **Do not edit `package.json#version` by hand.** The release PR owns version bumps.
- Bump type is set explicitly in each changeset file added during development:
  - `patch` — bug fixes, dependency updates
  - `minor` — new features (backwards compatible)
  - `major` — breaking changes

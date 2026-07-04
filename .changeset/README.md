# Releasing with Changesets

stars-components uses [`@changesets/cli`](https://github.com/changesets/changesets) for monorepo releases.
Each `@wolfstar/*` package is versioned independently according to the changesets included in each release.

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

| Secret              | Description                                                                                                                                                                                                                        |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WOLFSTAR_TOKEN`    | A GitHub PAT with `repo` and `workflow` scopes. Used by `changesets/action` to push commits and open PRs (the default `GITHUB_TOKEN` does not trigger other workflows).                                                            |
| `NPM_PUBLISH_TOKEN` | An npm **granular access token** with type **Automation** (bypasses 2FA) and publish access to all `@wolfstar/*` packages. Required for `release.yml`. Classic publish tokens will fail with `ERR_PNPM_OTP_NON_INTERACTIVE` in CI. |

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

### Recovering a failed publish

If the automatic publish step in `release.yml` fails after the release PR is merged:

1. Fix the underlying issue (npm token, network, build failure, etc.).
2. Re-run the failed **Create Release PR or Publish** job from **Actions**, or trigger
   **release** manually via **Run workflow** on `main`.
3. The job runs `pnpm run publish` (`pnpm build && changeset publish`).
   `changeset publish` is idempotent and skips packages already published at the current version.

Use this only when versions on `main` are already bumped and you need to retry npm publish.
It does not create or update the release PR.

### Canary (`@next`) channel

The `snapshot` job in `release.yml` publishes affected packages under the dist-tag `next`
whenever `main` receives a push that changes `packages/` or root `package.json`. Version bumps use
Changesets snapshots (for example `1.2.3-next.0`) via `pnpm run publish:snapshot`.

Snapshot publish is skipped when the push commit message contains `chore: version packages` or `chore: update changelog and release` (the release PR merge commit).

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

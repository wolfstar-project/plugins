---
name: implement-issue
description: Implement a GitHub issue labelled `feature` in wolfstar-project/stars-components or wolfstar-project/plugins, starting from the implementation plan that Pullfrog posted on the issue, and end with a PR that follows the repo's conventions. Use whenever the user types /implement-issue, gives an issue number or link and says implement, build, work on or pick up a feature or request, asks to "take the next feature issue", or wants the Pullfrog proposal turned into code, even if they never name Pullfrog or the label.
---

# implement-issue

Turn a `feature` issue into a reviewed-quality PR. Pullfrog (the `pullfrog[bot]` GitHub app) comments on new issues with a duplicate check and an implementation plan based on the current code. That plan is the starting point, not the contract: it is written fast, can be stale, and sometimes corrects the issue's own assumptions. The job is to read it critically, check it against the code, then build it.

Applies to both repos. Where they differ it is noted.

## 1. Find the issue

- User gave a number or URL: use it. Detect the repo from the working directory (`git remote get-url origin`) or the URL.
- No issue given: list open issues with the label and pick candidates that have no linked PR, then ask which one.
  ```bash
  gh api "repos/wolfstar-project/<repo>/issues?labels=feature&state=open&per_page=30" \
    -q '.[] | select(.pull_request==null) | "\(.number)\t\(.comments)\t\(.title)"'
  ```
  The live label is `feature`; the issue template still says `Meta: Feature`. Try both before concluding there are none.
- Use REST (`gh api repos/...`). `gh issue list` and other GraphQL-backed commands are blocked in some sessions.
- Check nothing already covers it: search open PRs for `#<n>`. Stacked work (see step 5) shows up as several PRs referencing one issue.

## 2. Read the issue and the Pullfrog plan

```bash
.claude/skills/implement-issue/scripts/find_plan.sh wolfstar-project/<repo> <number>
```

It prints the issue, then every comment, and tags the Pullfrog plan with `<<< PULLFROG PLAN`. Read the whole thread, because the plan is only one voice:

- The plan is an issue comment by `pullfrog[bot]` with a heading such as `## Plan` or `### Plan`, often preceded by a duplicate check and sometimes a "Corrections to the issue" list. If it was edited, `updated` is later than `created`; use the current text.
- Maintainer comments written after the plan can change scope. They win over the plan.
- Where "Corrections to the issue" contradicts the issue body, the correction usually reflects what the code really looks like (wrong helper name, a type that already exists, a breaking change hiding in a rename). Follow it after confirming in step 3.
- **No plan found:** the script only tags headings that contain "plan", so first skim the `pullfrog[bot]` comments it printed by hand (a plan can be titled differently, for example "Implementation plan"). If there really is none, do not make one up silently. Tell the user, and either wait for them to ask `@pullfrog` for a plan or get an explicit go-ahead to write your own short plan from the issue and the code.
- The plan says "duplicate of #N": stop and tell the user.

## 3. Verify the plan against the code

The plan cites files and line numbers. Open them. Line numbers drift, names get renamed, and a plan can describe code that has since moved.

- Read `AGENTS.md` (also served as `CLAUDE.md`) first. It holds the quality gates, scope rules, PR rules and per-package gotchas for this repo.
- For each plan step confirm the symbol, file and behaviour exist. Note what no longer matches.
- Decide per step: follow, adjust, or drop with a reason. Keep this list; it goes into the PR description and the final report.
- Ambiguity that would change the design (breaking vs additive API, a new package vs extending one, naming) is worth one question to the user before coding. Cosmetic choices are not: pick, and mention it.

## 4. Plan the change

Write a short task list from the verified plan, in the order that keeps the repo green after each step. Include tests and the changeset as tasks, not afterthoughts. Things that are easy to miss:

- **Changeset** for every user-facing package change: `pnpm changeset` (`pnpm changeset add --empty` when no release is needed). CI fails without one. Never edit `package.json#version`, a `CHANGELOG.md` or `pnpm-lock.yaml` by hand.
- **Tests** for behaviour changes (vitest). A feature without tests will not pass the pre-flight checklist.
- **New package:** add a `packages:<name>` entry to both `.github/labels.yml` and `.github/labeler.yml`, and add the scope to the `scopes` list in `.github/workflows/semantic-pull-requests.yml`. That workflow validates titles against the base branch, so the PR that adds the package cannot use its own scope; use `feat: ...` without a scope there.
- **Docs:** `stars-components` docs live in `wolfstar-project/website`, not in the repo. Update in-repo README, `AGENTS.md` and typedoc comments when commands, directories, CI or release flow change.
- **Ask first** (from AGENTS.md): publishing, dispatching `Release`, force-pushing shared branches, deleting branches/tags, `pnpm tolgee:push`, deprecating packages.

## 5. Decide on one PR or a stack

If the plan spans several layers (schema, then framework, then CLI, then scaffolder), a single diff is hard to review. The maintainers split these into stacked PRs, bottom first, each only showing its own layer (issue #252 became #254 through #258). Propose a split to the user when the plan has more than about three independent layers or touches more than one package's public API. Otherwise one PR.

For a stack: every PR uses `Refs #<issue>` and a Context line listing the whole stack bottom to top. Only the last one uses `Resolves #<issue>`, so the issue does not close while layers are missing.

## 6. Implement

- Branch from an up-to-date default branch: `feat/<scope>-<short-slug>` (`git fetch origin main` first; a stale shallow clone makes the push huge).
- Follow the neighbouring code. Copy an existing pattern before inventing one, and keep the diff to what the plan needs. Unrelated cleanups make review slower.
- Commit in small Conventional Commits (`feat(schema): ...`). Husky runs `oxfmt`/`oxlint --fix` on commit and commitlint rejects bad messages and body lines over 100 characters. Use the `/git-commit` skill if the environment has it.

## 7. Quality gates

Run in this order and fix before moving on, so a failure is caught at the cheapest gate. In `stars-components` the order is also required: `typecheck` resolves cross-package imports against built `dist/*.d.ts`, so it needs `pnpm build` first. In `plugins` `typecheck` is independent of the package builds, but keep the same order:

```bash
pnpm lint && pnpm build && pnpm typecheck && pnpm test
```

If a gate fails for a reason that predates your change (check with `git stash` or on `main`), say so in the PR instead of hiding or "fixing" it inside this diff. Do not claim a gate passed without having run it.

## 8. Open the PR

Use the `/create-pull-request` skill if available, otherwise `gh pr create`. Either way:

- **Title:** Conventional Commits, lowercase subject. Scope: in `stars-components` the package directory name (`feat(cli): ...`); in `plugins` the package name (`feat(plugin-gateway): ...`). Use no scope for broad changes.
- **Body:** fill every section of `.github/PULL_REQUEST_TEMPLATE.md` (Linked issue, Context, Description, Key changes, Type of Change, Pre-flight Checklist) and pass it with `--body-file`. Tick only what is true. Write it in plain words about what changed and why; do not paste generated text.
  - Linked issue: `Resolves #<n>` (or `Refs #<n>`, see step 5).
  - Mention in Description where you departed from the Pullfrog plan and why, in one or two lines. Reviewers who read the plan will otherwise wonder.
  - Add a Verification line with the gate results you actually saw.
- **AI disclosure:** end the body with the single disclosure line defined in AGENTS.md / CONTRIBUTING.md, with the tool name and the exact model ids you ran on (never guessed). That line is the only AI attribution the body may carry: no `Generated with Claude Code` footer, no `claude.ai/code/session_` link, no second attribution line. The repo rule overrides default tool footers. After creating or editing, re-read the body and confirm there is exactly one disclosure line.

## 9. Report back

Two or three sentences: PR link, what was built, and the plan deviations or open questions. Pullfrog and CI bots (CodSpeed, Greptile, `pkg.pr.new`) will comment on the PR; check CI status once after pushing and mention a red check if there is one, without looping on it unless asked.

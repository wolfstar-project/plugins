<div align="center">

# @wolfstar/plugins

**A monorepo of official plugins for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework).**

Structured after [`sapphiredev/plugins`](https://github.com/sapphiredev/plugins), tooled after
[`wolfstar-project/stars-components`](https://github.com/wolfstar-project/stars-components).

</div>

## Packages

| Package                                         | Description                                                  |
| ----------------------------------------------- | ------------------------------------------------------------ |
| [`@wolfstar/plugin-api`](./packages/plugin-api) | Registers a standalone REST API server for auxiliary routes. |

## Development

This monorepo uses **pnpm** workspaces + **Turborepo**.

```bash
pnpm install        # install dependencies
pnpm build          # build every package with tsdown
pnpm typecheck      # type-check every package
pnpm test           # run vitest
pnpm lint           # oxlint + oxfmt --check
pnpm lint:fix       # oxlint --fix + oxfmt
pnpm knip           # detect unused code / dependencies
```

### Tooling

- **Package manager:** pnpm 11
- **Build:** tsdown
- **Lint / format:** oxlint + oxfmt
- **Task runner:** Turborepo
- **Commit hooks:** husky + nano-staged + commitlint (conventional commits)
- **Versioning / release:** Changesets

## Releasing

Add a changeset for every user-facing change:

```bash
pnpm changeset
```

On merge to `main`, the `release` workflow opens a "version packages" PR (via Changesets). Merging that PR
publishes the affected packages to npm with provenance.

## License

Apache-2.0 © WolfStar Project

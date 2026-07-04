<div align="center">

# @wolfstar/plugins

**A monorepo of official plugins for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework).**

Structured after [`sapphiredev/plugins`](https://github.com/sapphiredev/plugins), tooled after
[`wolfstar-project/stars-components`](https://github.com/wolfstar-project/stars-components).

</div>

## Packages

| Package                                               | Description                                       |
| ----------------------------------------------------- | ------------------------------------------------- |
| [`@wolfstar/plugin-logger`](./packages/plugin-logger) | Registers a leveled logger on `container.logger`. |

## How plugins work

Each package hooks into the `@wolfstar/http-framework` plugin system. A plugin subclasses `Plugin`,
implements one or more symbol-keyed static hooks (`preGenericsInitialization`, `preInitialization`,
`postInitialization`, `preLoad`, `postListen`) and registers them on `Client.plugins`. Consumers opt in by
importing the side-effecting `./register` subpath. See
[`packages/plugin-logger/src/register.ts`](./packages/plugin-logger/src/register.ts) for the reference pattern.

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

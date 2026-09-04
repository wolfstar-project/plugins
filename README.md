<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# Plugins

**Official plugins for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework).**

[![GitHub License](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)
[![codecov](https://codecov.io/gh/wolfstar-project/plugins/branch/main/graph/badge.svg)](https://codecov.io/gh/wolfstar-project/plugins)

</div>

---

## Overview

Plugins is a monorepo containing **four publishable TypeScript packages** under the `@wolfstar` npm scope. They extend [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework) with REST APIs, internationalization, pluggable logging, and advanced slash-command composition.

**Technology Stack:**

- **Language:** TypeScript (Node.js `^22.11 || ^24 || >=26`)
- **Package Manager:** pnpm with workspaces
- **Monorepo Runner:** Turbo
- **Testing:** Vitest
- **Linting:** oxlint with oxfmt
- **Release:** Changesets v3 (independent semver per package)

---

## Quick Start

### Prerequisites

- Node.js `^22.11`, `^24`, or `>=26`
- pnpm (automatically pinned via corepack)

### Installation

```bash
git clone https://github.com/wolfstar-project/plugins.git
cd plugins
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

### Using a Package

Each package is independently published to npm. Install only the plugins your project needs:

```bash
pnpm add @wolfstar/http-framework @wolfstar/plugin-logger
```

---

## Packages

| Package                                                                           | Description                                                                   | Version                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@wolfstar/plugin-api`](./packages/plugin-api)                                   | Standalone REST API server with routes, middlewares, and filesystem routing   | [![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-api)](https://npmx.dev/package/@wolfstar/plugin-api)                                   |
| [`@wolfstar/plugin-i18next`](./packages/plugin-i18next)                           | i18next-powered internationalization for HTTP interactions                    | [![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-i18next)](https://npmx.dev/package/@wolfstar/plugin-i18next)                           |
| [`@wolfstar/plugin-logger`](./packages/plugin-logger)                             | Pluggable logger with console, Sentry, consola, evlog, and winston transports | [![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-logger)](https://npmx.dev/package/@wolfstar/plugin-logger)                             |
| [`@wolfstar/plugin-subcommands-advanced`](./packages/plugin-subcommands-advanced) | Modular slash subcommands implemented as separate command classes             | [![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-subcommands-advanced)](https://npmx.dev/package/@wolfstar/plugin-subcommands-advanced) |

---

## Development

### Contributing

Contributions are welcome! Please read the [Contributing Guide](https://github.com/wolfstar-project/.github/blob/main/.github/CONTRIBUTING.md) before submitting a pull request.

**Key Conventions:**

- **Commits:** follow [Conventional Commits](https://www.conventionalcommits.org/)
- **Changes:** use `pnpm changeset`; package versions and changelogs are managed by Changesets
- **Release Process:** packages are independently published through CI

### Contributors

Thank you to everyone who has contributed to Plugins!

<a href="https://github.com/wolfstar-project/plugins/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=wolfstar-project/plugins" alt="Contributors" />
</a>

### Development Environment

[![Open in VS Code](https://img.shields.io/badge/Open%20in-VS%20Code-007ACC?style=flat-square&logo=visualstudiocode)](https://vscode.dev/github/wolfstar-project/plugins)
[![Open in GitHub Codespaces](https://img.shields.io/badge/Open%20in-GitHub%20Codespaces-181717?style=flat-square&logo=github)](https://codespaces.new/wolfstar-project/plugins)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?style=flat-square&logo=stackblitz)](https://stackblitz.com/github/wolfstar-project/plugins)
[![Open in Gitpod](https://img.shields.io/badge/Open%20in-Gitpod-FFB45B?style=flat-square&logo=gitpod)](https://gitpod.io/#https://github.com/wolfstar-project/plugins)

---

## License

Plugins is licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for details.

Copyright 2022 Wolfstar Project

---

## Resources

- **GitHub:** https://github.com/wolfstar-project/plugins
- **npm Packages:** https://www.npmjs.com/org/wolfstar
- **Website:** https://wolfstar.rocks
- **Issues & Discussions:** https://github.com/wolfstar-project/plugins/issues

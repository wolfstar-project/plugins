# `@wolfstar/plugin-i18next`

Plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework) that adds an internationalization layer powered by [`i18next`](https://www.npmjs.com/package/i18next) and [`@wolfstar/i18next-backend`](https://www.npmjs.com/package/@wolfstar/i18next-backend).

It merges two upstream implementations:

- [`@wolfstar/http-framework-i18n`](https://github.com/wolfstar-project/stars-components/tree/main/packages/http-framework-i18n) — the HTTP-interaction helpers (`resolveKey`, `applyLocalizedBuilder`, typed `T` / `FT` keys).
- [`@sapphire/plugin-i18next`](https://github.com/sapphiredev/plugins/tree/main/packages/i18next) — the plugin architecture (`container.i18n`, `InternationalizationHandler`, custom `fetchLanguage`, formatters, HMR).

Interactions arrive over HTTP as raw payloads, so every helper operates on `discord-api-types` structures instead of `discord.js` class instances.

## Installation

```bash
pnpm add @wolfstar/http-framework @wolfstar/plugin-i18next
```

## Usage

Import the register entrypoint **before** creating the client:

```typescript
import "@wolfstar/plugin-i18next/register";
import { Client } from "@wolfstar/http-framework";

const client = new Client({
  i18n: {
    // Defaults to `<root>/languages`:
    defaultLanguageDirectory: new URL("languages", import.meta.url).pathname,
    defaultName: "en-US",
    defaultMissingKey: "default:default",
    formatters: [
      { name: "uppercase", format: (value) => value.toUpperCase() },
      { name: "lowercase", format: (value) => value.toLowerCase() },
    ],
  },
});
```

The plugin registers three hooks:

| Hook                        | What it does                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `preGenericsInitialization` | Creates the `InternationalizationHandler` and assigns it to `container.i18n`.                    |
| `preLoad`                   | Awaits `container.i18n.init()` **before** the stores load, so command builders can be localized. |
| `postListen`                | Starts the chokidar watcher when `i18n.hmr.enabled` is `true`.                                   |

### Languages directory

```text
languages/
├── en-US/
│   ├── default.json
│   └── commands/
│       └── ping.json
└── es-ES/
    ├── default.json
    └── commands/
        └── ping.json
```

Every top-level directory is a language, every nested `.json` file is a namespace (`commands/ping`).

### Definition

```typescript
import { FT, T } from "@wolfstar/plugin-i18next";

export const Success = T("commands/ping:success");
export const SuccessWithLatency = FT<{ latency: number }>("commands/ping:successWithLatency");
```

### Consumption

```typescript
import {
  getSupportedLanguageName,
  getSupportedUserLanguageName,
  resolveKey,
  resolveUserKey,
} from "@wolfstar/plugin-i18next";

// The guild's language, falling back to the user's one in DMs:
const guildLanguage = getSupportedLanguageName(interaction);

// The user's language:
const userLanguage = getSupportedUserLanguageName(interaction);

// Synchronous, resolved straight from the interaction payload:
const content = resolveKey(interaction, Success);
const userContent = resolveUserKey(interaction, SuccessWithLatency, { latency: 42 });
```

`resolve*` helpers are synchronous and only read the locales carried by the interaction. Use the
asynchronous `fetch*` helpers when the language comes from somewhere else — they go through
`container.i18n.fetchLanguage`:

```typescript
import { container } from "@wolfstar/http-framework";
import { fetchKey, fetchLanguage, fetchT } from "@wolfstar/plugin-i18next";

container.i18n.fetchLanguage = async (context) => {
  if (!context.guildId) return null;
  const guild = await database.getGuild(context.guildId);
  return guild?.language ?? null;
};

const language = await fetchLanguage(interaction);
const t = await fetchT(interaction);
const content = await fetchKey(interaction, "commands/ping:success");
```

### Localizing command builders

```typescript
import { RegisterCommand } from "@wolfstar/http-framework";
import { applyLocalizedBuilder, createLocalizedChoice } from "@wolfstar/plugin-i18next";

@RegisterCommand((builder) =>
  applyLocalizedBuilder(builder, "commands/ping:name").addStringOption((option) =>
    applyLocalizedBuilder(option, "commands/ping:mode")
      .setRequired(true)
      .setChoices(
        createLocalizedChoice("commands/ping:modeFast", { value: "fast" }),
        createLocalizedChoice("commands/ping:modeSlow", { value: "slow" }),
      ),
  ),
)
export class UserCommand extends Command {}
```

Passing a single root key resolves `<root>Name` and `<root>Description`; passing two keys uses them
verbatim.

> [!IMPORTANT]
> Builder localization reads the loaded resources, so it may only run after the `preLoad` hook has
> initialized the handler. The plugin already guarantees this ordering for pieces loaded by
> `Client#load`.

### Hot module replacement

```typescript
const client = new Client({
  i18n: {
    hmr: { enabled: true },
  },
});
```

When enabled, the languages directory is watched and `container.i18n.reloadResources()` runs on every
change or deletion.

## Options

| Option                     | Type                                     | Description                                                                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `defaultName`              | `string`                                 | The fallback locale. Defaults to `'en-US'`.                                     |
| `defaultLanguageDirectory` | `string`                                 | Where to look for languages. Defaults to `<root>/languages`.                    |
| `defaultMissingKey`        | `string`                                 | The key used to render missing keys, e.g. `'default:default'`.                  |
| `defaultNS`                | `string`                                 | The namespace prefixed to keys that don't specify one. Defaults to `'default'`. |
| `backend`                  | `Backend.Options`                        | Extra `@wolfstar/i18next-backend` paths.                                        |
| `i18next`                  | `InitOptions \| DynamicOptions`          | Raw options forwarded to `i18next.init`.                                        |
| `formatters`               | `I18nextFormatter[]`                     | Formatters registered on `i18next.services.formatter`.                          |
| `hmr`                      | `HMROptions`                             | Chokidar-based hot reloading of the languages directory.                        |
| `fetchLanguage`            | `(context) => Awaitable<string \| null>` | Custom language resolution, used by the `fetch*` helpers.                       |

## Credits

Adapted from [`@wolfstar/http-framework-i18n`](https://github.com/wolfstar-project/stars-components/tree/main/packages/http-framework-i18n) and [`@sapphire/plugin-i18next`](https://github.com/sapphiredev/plugins/tree/main/packages/i18next) (MIT).

# `@wolfstar/plugin-i18next`

Plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework) that adds an internationalization layer powered by [`i18next`](https://www.npmjs.com/package/i18next) and [`@wolfstar/i18next-backend`](https://www.npmjs.com/package/@wolfstar/i18next-backend).

It merges two upstream implementations:

- [`@wolfstar/http-framework-i18n`](https://github.com/wolfstar-project/stars-components/tree/main/packages/http-framework-i18n) — the HTTP-interaction helpers (`getSupportedLanguageT`, `applyLocalizedBuilder`, localized builders).
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

### Typed keys

Keys are typed through i18next's own `CustomTypeOptions` augmentation. Generate it from the locale
files with
[`@wolfstar/i18next-type-generator`](https://www.npmjs.com/package/@wolfstar/i18next-type-generator),
listed as an optional peer dependency — nothing at runtime depends on it, only the generated types
consumers opt into:

```bash
pnpm add -D @wolfstar/i18next-type-generator
i18next-type-generator ./languages/en-US/ ./src/@types/i18next.d.ts
```

The generator only emits `CustomTypeOptions.resources`. If `defaultNS` is set to anything other than
i18next's own `'translation'` default — this plugin's `defaultLanguageDirectory` layout usually
implies `'default'` — declare it separately, or every helper's default namespace stops satisfying
i18next's `Namespace` type:

```typescript
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "default";
  }
}
```

See [i18next's TypeScript guide](https://www.i18next.com/overview/typescript) for the other options
the augmentation accepts. Without any of this every helper still accepts plain strings, only
untyped.

### Consumption

```typescript
import {
  getSupportedLanguageName,
  getSupportedLanguageT,
  getSupportedUserLanguageName,
  getSupportedUserLanguageT,
} from "@wolfstar/plugin-i18next";

// The guild's language, falling back to the user's one in DMs:
const guildLanguage = getSupportedLanguageName(interaction);

// The user's language:
const userLanguage = getSupportedUserLanguageName(interaction);

// Synchronous, resolved straight from the interaction payload:
const content = getSupportedLanguageT(interaction, "commands/ping:success");
const userContent = getSupportedUserLanguageT(interaction, "commands/ping:successWithLatency", {
  latency: 42,
});

// Omitting the key returns the bound `TFunction` instead, for when several keys share a language:
const t = getSupportedUserLanguageT(interaction);
const name = t("commands/ping:name");

// Bound functions carry the language they were fixed to, as they did in `@wolfstar/http-framework-i18n`:
t.lng; // 'es-ES
```

`getSupported*T` helpers are synchronous and only read the locales carried by the interaction. Use
the asynchronous `fetch*` helpers when the language comes from somewhere else — they go through
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

### Targets

Every helper accepts any of four raw payloads, told apart structurally — the framework never has
`discord.js` class instances to check with `instanceof`:

| Target          | Recognized by | Locale it carries           |
| --------------- | ------------- | --------------------------- |
| `Interaction`   | `locale`      | `locale` and `guild_locale` |
| `MessageTarget` | `channel_id`  | none                        |
| `ChannelTarget` | `type`        | none                        |
| `GuildTarget`   | anything else | `preferred_locale`          |

`APIInteraction`, `APIMessage`, `APIChannel` and `APIGuild` all satisfy the matching target, so
payloads can be passed straight through:

```typescript
import { getSupportedLanguageName, getSupportedLanguageT } from "@wolfstar/plugin-i18next";

// A guild resolves through its `preferred_locale`:
const guild = await container.rest.get(Routes.guild(guildId));
const language = getSupportedLanguageName(guild);
const content = getSupportedLanguageT(guild, "commands/ping:success");
```

Channels and messages carry no locale of their own, so the synchronous helpers fall back to
`defaultName` for them. Use the asynchronous `fetch*` helpers instead: the hook receives the
target's `guildId`, `channelId` and `userId`, which is enough to look the language up.

```typescript
container.i18n.fetchLanguage = async ({ guildId }) =>
  guildId ? ((await database.getGuild(guildId))?.language ?? null) : null;

const content = await fetchKey(message, "commands/ping:success");
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
addition, change or deletion — including new locale directories and new namespace files, which are
registered on i18next and become usable without a restart.

`ignoreInitial` defaults to `true` so the files already on disk do not each trigger a reload on
startup; pass `hmr.options` to override it or any other chokidar option. The watcher is exposed as
`I18nextPlugin.watcher`, so it can be closed on shutdown:

```typescript
import { I18nextPlugin } from "@wolfstar/plugin-i18next/register";

await I18nextPlugin.watcher?.close();
```

## Options

| Option                     | Type                                     | Description                                                                             |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `defaultName`              | `string`                                 | The locale used when none of an interaction's locales is loaded. Defaults to `'en-US'`. |
| `defaultLanguageDirectory` | `string`                                 | Where to look for languages. Defaults to `<root>/languages`.                            |
| `defaultMissingKey`        | `string`                                 | The key used to render missing keys, e.g. `'default:default'`.                          |
| `defaultNS`                | `string`                                 | The namespace prefixed to keys that don't specify one. Defaults to `'default'`.         |
| `backend`                  | `Backend.Options`                        | Extra `@wolfstar/i18next-backend` paths.                                                |
| `i18next`                  | `InitOptions \| DynamicOptions`          | Raw options forwarded to `i18next.init`.                                                |
| `formatters`               | `I18nextFormatter[]`                     | Formatters registered on `i18next.services.formatter`.                                  |
| `hmr`                      | `HMROptions`                             | Chokidar-based hot reloading of the languages directory.                                |
| `fetchLanguage`            | `(context) => Awaitable<string \| null>` | Custom language resolution, used by the `fetch*` helpers.                               |

## Migrating from `@wolfstar/http-framework-i18n`

[`@wolfstar/http-framework-i18n`](https://www.npmjs.com/package/@wolfstar/http-framework-i18n) is deprecated in favour
of this plugin. The upstream changes are documented in
[wolfstar-project/stars-components#30](https://github.com/wolfstar-project/stars-components/pull/30); the short version:

```bash
pnpm remove @wolfstar/http-framework-i18n
pnpm add @wolfstar/plugin-i18next
```

```diff
-import { addFormatters, init, load } from "@wolfstar/http-framework-i18n";
+import "@wolfstar/plugin-i18next/register";
 import { Client } from "@wolfstar/http-framework";
+import { fileURLToPath } from "node:url";

-await load(new URL("locales", import.meta.url));
-addFormatters({ name: "uppercase", format: (value) => value.toUpperCase() });
-await init();
-
-const client = new Client();
+const client = new Client({
+  i18n: {
+    defaultLanguageDirectory: fileURLToPath(new URL("languages", import.meta.url)),
+    formatters: [{ name: "uppercase", format: (value) => value.toUpperCase() }],
+  },
+});
```

`getSupportedLanguageName`, `getSupportedUserLanguageName`, `getSupportedLanguageT`,
`getSupportedUserLanguageT` (which now also take the key and its options directly, like `resolveKey`
did), `supportedLanguages`, `isSupportedDiscordLocale`, `getLocalizedData`,
`applyNameLocalizedBuilder`, `applyDescriptionLocalizedBuilder`, `applyLocalizedBuilder` and
`createSelectMenuChoiceName` keep the same names and signatures — only the module specifier changes.

| Removed upstream               | Replacement here                                                              |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `load(directory)`              | `defaultLanguageDirectory` option                                             |
| `init(options)`                | The `preLoad` hook; raw options go to the `i18next` option                    |
| `addFormatters(...formatters)` | `formatters` option                                                           |
| `getT(locale, namespace?)`     | `container.i18n.getT(locale, namespace?)`                                     |
| `loadedLocales`                | `container.i18n.languages`                                                    |
| `loadedNamespaces`             | `container.i18n.namespaces`                                                   |
| `loadedPaths`                  | Derived from `defaultLanguageDirectory`; extra paths via the `backend` option |
| `loadedFormatters`             | `container.i18n.options.formatters`                                           |
| `Formatter`                    | `I18nextFormatter`                                                            |

`T`, `FT`, `resolveKey` and `resolveUserKey` were removed upstream in
[wolfstar-project/stars-components#30](https://github.com/wolfstar-project/stars-components/pull/30) and are gone here
too — see [Migrating off `T` / `FT` / `resolve*`](#migrating-off-t--ft--resolve) below.

Other differences: `@wolfstar/http-framework@^3.1.0` is now a peer dependency, `i18next` moves from `^22` to `^25`, and
the locales directory defaults to `<root>/languages` instead of an explicit path passed to `load()` — the layout itself
is unchanged.

## Migrating off `T` / `FT` / `resolve*`

The branded-key helpers were replaced by i18next's native TypeScript support, so keys are plain
strings typed by the `CustomTypeOptions` augmentation
[`@wolfstar/i18next-type-generator`](https://www.npmjs.com/package/@wolfstar/i18next-type-generator) emits.

```diff
-import { FT, T } from "@wolfstar/plugin-i18next";
-
-export const Success = T("commands/ping:success");
-export const SuccessWithLatency = FT<{ latency: number }>("commands/ping:successWithLatency");
```

| Removed                                | Replacement                                              |
| -------------------------------------- | -------------------------------------------------------- |
| `T(key)` / `FT<Args>(key)`             | The key itself, typed by the generated augmentation      |
| `resolveKey(target, key, options)`     | `getSupportedLanguageT(target, key, options)`            |
| `resolveUserKey(target, key, options)` | `getSupportedUserLanguageT(target, key, options)`        |
| `TypedT` / `TypedFT`                   | `ParseKeys` from `i18next`                               |
| `Value` / `Values` / `Difference`      | Interpolation options are inferred from the locale files |

`TFunction#lng` (along with `lngs`, `ns` and `keyPrefix`) is still declared, so code reading the
language off a bound function keeps working — i18next assigns them on every function `getFixedT`
returns but does not type them.

`LocalePrefixKey` is no longer hardcoded to `commands/<file>:<key>`: it is now
`` `${string}${LocaleSeparator}${string}` ``, with `LocaleSeparator` read from i18next's
`TypeOptions["nsSeparator"]`.

```diff
-const content = resolveKey(interaction, Success);
-const userContent = resolveUserKey(interaction, SuccessWithLatency, { latency: 42 });
+const content = getSupportedLanguageT(interaction, "commands/ping:success");
+const userContent = getSupportedUserLanguageT(
+  interaction,
+  "commands/ping:successWithLatency",
+  { latency: 42 },
+);
```

## Credits

Adapted from [`@wolfstar/http-framework-i18n`](https://github.com/wolfstar-project/stars-components/tree/main/packages/http-framework-i18n) and [`@sapphire/plugin-i18next`](https://github.com/sapphiredev/plugins/tree/main/packages/i18next) (MIT).

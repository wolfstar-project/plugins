import { definePlugin, type ClientOptions } from "@wolfstar/http-framework";
import type { FSWatcher } from "chokidar";
import "./index";
import { initI18n, installI18n, watchLanguages } from "./hooks";
import type { InternationalizationOptions } from "./lib/types";

/**
 * The i18next plugin: installs the `InternationalizationHandler` on `container.i18n`, loads the languages before the
 * stores, and watches the languages directory when HMR is enabled.
 *
 * The plugin exposes the chokidar watcher started by `postListen` as `watcher` (`null` until then, and when HMR is not
 * enabled), so it can be closed on shutdown, like `I18nextPlugin.watcher` of `./register`.
 *
 * @param pluginOptions The handler options. `ClientOptions.i18n` is merged over them.
 *
 * @example
 * ```ts
 * import i18nPlugin from '@wolfstar/plugin-i18next/plugin';
 *
 * const client = new Client({ plugins: [i18nPlugin({ defaultName: 'en-US' })] });
 * ```
 */
export default definePlugin((pluginOptions?: InternationalizationOptions) => {
  // Without any options the handler falls back to its own defaults, so only build an object when there is one. Kit's
  // `defineModule` calls `setup` with `{}` rather than `undefined` when no options are given, so an empty object
  // counts as "no options" too.
  const isEmpty = (value: InternationalizationOptions | undefined) =>
    !value || Object.keys(value).length === 0;
  const merged = (options: ClientOptions): ClientOptions => ({
    ...options,
    i18n:
      isEmpty(pluginOptions) && isEmpty(options.i18n)
        ? undefined
        : { ...pluginOptions, ...options.i18n },
  });

  let watcher: FSWatcher | null = null;

  return {
    name: "@wolfstar/plugin-i18next",
    get watcher() {
      return watcher;
    },
    preGenericsInitialization(_client, options) {
      options.i18n = merged(options).i18n;
      installI18n(options);
    },
    preLoad: () => initI18n(),
    postListen(_client, options) {
      watcher = watchLanguages(merged(options)) ?? watcher;
    },
  };
});

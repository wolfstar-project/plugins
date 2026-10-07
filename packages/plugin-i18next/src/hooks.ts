import { container, type ClientOptions } from "@wolfstar/http-framework";
import { watch, type FSWatcher } from "chokidar";
import { InternationalizationHandler } from "./lib/InternationalizationHandler";

/**
 * The chokidar events that make the languages directory's contents change.
 */
const HmrEvents = ["add", "addDir", "change", "unlink", "unlinkDir"] as const;

/**
 * Creates the {@link InternationalizationHandler} and assigns it to `container.i18n`. Shared by the `./register`
 * class plugin and the `./plugin` `definePlugin` factory.
 *
 * @param options The client options, read for `i18n`.
 */
export function installI18n(options: ClientOptions): void {
  container.i18n = new InternationalizationHandler(options.i18n);
}

/**
 * Loads the languages, so command builders can be localized when the stores load.
 */
export async function initI18n(): Promise<void> {
  await container.i18n.init();
}

/**
 * Watches the languages directory and reloads the resources when it changes, if `i18n.hmr.enabled` is set.
 *
 * @param options The client options, read for `i18n.hmr`.
 * @returns The chokidar watcher, or `null` when HMR is not enabled.
 */
export function watchLanguages(options: ClientOptions): FSWatcher | null {
  if (!options.i18n?.hmr?.enabled) return null;

  console.info("[plugin-i18next] HMR enabled. Watching for language changes.");

  // `ignoreInitial` defaults to `true` here: chokidar otherwise replays an `add` for every file
  // already on disk, which would trigger a reload per translation file on startup.
  const watcher = watch(container.i18n.languagesDirectory, {
    ignoreInitial: true,
    ...options.i18n.hmr.options,
  });

  // Adding a locale directory or a namespace file emits `addDir` / `add`, not `change`, so all of
  // them have to be watched for new languages and namespaces to be picked up.
  for (const event of HmrEvents) {
    watcher.on(event, () => void container.i18n.reloadResources());
  }

  return watcher;
}

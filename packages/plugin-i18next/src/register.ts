import {
  Client,
  container,
  Plugin,
  postListen,
  preGenericsInitialization,
  preLoad,
  type ClientOptions,
} from "@wolfstar/http-framework";
import { watch, type FSWatcher } from "chokidar";
import "./index";
import { InternationalizationHandler } from "./lib/InternationalizationHandler";

/**
 * The chokidar events that make the languages directory's contents change.
 */
const HmrEvents = ["add", "addDir", "change", "unlink", "unlinkDir"] as const;

/**
 * Registers the i18next-powered {@link InternationalizationHandler} on `container.i18n`, loading the
 * languages before the stores are loaded so command builders can be localized at registration time.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-i18next/register';
 * ```
 */
export class I18nextPlugin extends Plugin {
  /**
   * The chokidar watcher started by the `postListen` hook when HMR is enabled, or `null` when it is
   * not. Exposed so it can be closed on shutdown.
   */
  public static watcher: FSWatcher | null = null;

  public static [preGenericsInitialization](this: Client, options: ClientOptions): void {
    container.i18n = new InternationalizationHandler(options.i18n);
  }

  public static async [preLoad](this: Client): Promise<void> {
    await container.i18n.init();
  }

  public static [postListen](this: Client, options: ClientOptions): void {
    if (!options.i18n?.hmr?.enabled) return;

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

    I18nextPlugin.watcher = watcher;
  }
}

Client.plugins.registerPreGenericsInitializationHook(
  I18nextPlugin[preGenericsInitialization],
  "WolfStar-I18next-PreGenericsInitialization",
);
Client.plugins.registerPreLoadHook(I18nextPlugin[preLoad], "WolfStar-I18next-PreLoad");
Client.plugins.registerPostListenHook(I18nextPlugin[postListen], "WolfStar-I18next-PostListen");

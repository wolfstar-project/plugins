import {
  Client,
  Plugin,
  postListen,
  preGenericsInitialization,
  preLoad,
  type ClientOptions,
} from "@wolfstar/http-framework";
import type { FSWatcher } from "chokidar";
import "./index";
import { initI18n, installI18n, watchLanguages } from "./hooks";

/**
 * Registers the i18next-powered `InternationalizationHandler` on `container.i18n`, loading the
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
    installI18n(options);
  }

  public static async [preLoad](this: Client): Promise<void> {
    await initI18n();
  }

  public static [postListen](this: Client, options: ClientOptions): void {
    I18nextPlugin.watcher = watchLanguages(options) ?? I18nextPlugin.watcher;
  }
}

Client.plugins.registerPreGenericsInitializationHook(
  I18nextPlugin[preGenericsInitialization],
  "WolfStar-I18next-PreGenericsInitialization",
);
Client.plugins.registerPreLoadHook(I18nextPlugin[preLoad], "WolfStar-I18next-PreLoad");
Client.plugins.registerPostListenHook(I18nextPlugin[postListen], "WolfStar-I18next-PostListen");

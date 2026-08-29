import {
  Client,
  container,
  Plugin,
  postListen,
  preGenericsInitialization,
  preLoad,
  type ClientOptions,
} from "@wolfstar/http-framework";
import { watch } from "chokidar";
import "./index";
import { InternationalizationHandler } from "./lib/InternationalizationHandler";

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
  public static [preGenericsInitialization](this: Client, options: ClientOptions): void {
    container.i18n = new InternationalizationHandler(options.i18n);
  }

  public static async [preLoad](this: Client): Promise<void> {
    await container.i18n.init();
  }

  public static [postListen](this: Client, options: ClientOptions): void {
    if (!options.i18n?.hmr?.enabled) return;

    console.info("[plugin-i18next] HMR enabled. Watching for language changes.");

    watch(container.i18n.languagesDirectory, options.i18n.hmr.options ?? {})
      .on("change", () => void container.i18n.reloadResources())
      .on("unlink", () => void container.i18n.reloadResources());
  }
}

Client.plugins.registerPreGenericsInitializationHook(
  I18nextPlugin[preGenericsInitialization],
  "WolfStar-I18next-PreGenericsInitialization",
);
Client.plugins.registerPreLoadHook(I18nextPlugin[preLoad], "WolfStar-I18next-PreLoad");
Client.plugins.registerPostListenHook(I18nextPlugin[postListen], "WolfStar-I18next-PostListen");

import {
  Client,
  Plugin,
  postInitialization,
  postListen,
  type ClientOptions,
} from "@wolfstar/http-framework";
import "./index";
import { connectApi, installApi } from "./hooks";

/**
 * Registers a standalone `Server` for auxiliary REST routes (health checks, dashboards,
 * webhooks from other services, etc), independent from the Discord interactions webhook server.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-api/register';
 * ```
 */
export class Api extends Plugin {
  public static [postInitialization](this: Client, options: ClientOptions): void {
    installApi(options);
  }

  public static async [postListen](this: Client, options: ClientOptions): Promise<void> {
    await connectApi(options);
  }
}

Client.plugins.registerPostInitializationHook(
  Api[postInitialization],
  "WolfStar-Api-PostInitialization",
);
Client.plugins.registerPostListenHook(Api[postListen], "WolfStar-Api-PostListen");

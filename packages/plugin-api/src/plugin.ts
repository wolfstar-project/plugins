import { definePlugin, type ClientOptions } from "@wolfstar/http-framework";
import "./index";
import { connectApi, installApi } from "./hooks";
import type { ServerOptions } from "./lib/structures/http/Server";

/**
 * The API plugin: registers a standalone `Server` for auxiliary REST routes, independent from the Discord
 * interactions webhook server.
 *
 * @param pluginOptions The server options. `ClientOptions.api` is merged over them.
 *
 * @example
 * ```ts
 * import apiPlugin from '@wolfstar/plugin-api/plugin';
 *
 * const client = new Client({ plugins: [apiPlugin({ prefix: '/api', listenOptions: { port: 4000 } })] });
 * ```
 */
export default definePlugin((pluginOptions: ServerOptions = {}) => {
  const merged = (options: ClientOptions): ClientOptions => ({
    ...options,
    api: { ...pluginOptions, ...options.api },
  });

  return {
    name: "@wolfstar/plugin-api",
    postInitialization: (_client, options) => installApi(merged(options)),
    postListen: (_client, options) => connectApi(merged(options)),
  };
});

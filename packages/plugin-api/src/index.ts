import type { Server, ServerOptions } from "./lib/structures/http/Server";
import type { MiddlewareStore } from "./lib/structures/MiddlewareStore";
import type { RouteStore } from "./lib/structures/RouteStore";

export * from "./lib/structures/http/Server";
export * from "./lib/structures/api/ApiRequest";
export * from "./lib/structures/api/ApiResponse";
export * from "./lib/structures/api/CookieStore";
export * from "./lib/structures/http/HttpCodes";
export * from "./lib/structures/http/HttpMethods";
export * from "./lib/structures/Middleware";
export * from "./lib/structures/MiddlewareStore";
export * from "./lib/structures/Route";
export * from "./lib/structures/router/RouterBranch";
export * from "./lib/structures/router/RouterNode";
export * from "./lib/structures/router/RouterRoot";
export * from "./lib/structures/RouteStore";

export type * from "@sapphire/iana-mime-types";

export { loadListeners } from "./listeners/_load";
export { loadMiddlewares } from "./middlewares/_load";

/**
 * The `@wolfstar/plugin-api` version, replaced with the `package.json` version at build time by
 * `@redstardev/unplugin-version-injector`.
 */
export const version: string = "[VI]{{inject}}[/VI]";

declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    /**
     * Options for the auxiliary REST API server registered by `@wolfstar/plugin-api`.
     */
    api?: ServerOptions;
  }
}

declare module "@sapphire/pieces" {
  interface StoreRegistryEntries {
    routes: RouteStore;
    middlewares: MiddlewareStore;
  }

  interface Container {
    /**
     * The auxiliary REST API server registered by `@wolfstar/plugin-api`. Independent from the
     * Discord interactions webhook server (`Client#server`).
     */
    server: Server;
  }
}

import type { ApiServer, ApiServerOptions } from "./lib/http/ApiServer";
import type { MiddlewareStore } from "./lib/structures/MiddlewareStore";
import type { RouteStore } from "./lib/structures/RouteStore";

export * from "./lib/http/ApiRequest";
export * from "./lib/http/ApiResponse";
export * from "./lib/http/ApiServer";
export * from "./lib/http/HttpMethod";
export * from "./lib/structures/Middleware";
export * from "./lib/structures/MiddlewareStore";
export * from "./lib/structures/Route";
export * from "./lib/structures/router/RouterBranch";
export * from "./lib/structures/router/RouterNode";
export * from "./lib/structures/router/RouterRoot";
export * from "./lib/structures/RouteStore";

export { loadListeners } from "./listeners/_load";
export { loadMiddlewares } from "./middlewares/_load";

declare module "@wolfstar/http-framework" {
	interface ClientOptions {
		/**
		 * Options for the auxiliary REST API server registered by `@wolfstar/plugin-api`.
		 */
		api?: ApiServerOptions;
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
		server: ApiServer;
	}
}

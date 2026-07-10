import {
	Client,
	container,
	Plugin,
	postInitialization,
	postListen,
	type ClientOptions,
} from "@wolfstar/http-framework";
import "./index";
import { ApiServer } from "./lib/http/ApiServer";
import { loadListeners } from "./listeners/_load";
import { loadMiddlewares } from "./middlewares/_load";

/**
 * Registers a standalone {@link ApiServer} for auxiliary REST routes (health checks, dashboards,
 * webhooks from other services, etc), independent from the Discord interactions webhook server.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-api/register';
 * ```
 */
export class ApiPlugin extends Plugin {
	public static [postInitialization](this: Client, options: ClientOptions): void {
		const server = new ApiServer(options.api);

		container.stores //
			.register(server.routes)
			.register(server.middlewares);

		loadListeners().catch((error: unknown) =>
			console.error("[plugin-api] Failed to load listeners:", error),
		);
		loadMiddlewares().catch((error: unknown) =>
			console.error("[plugin-api] Failed to load middlewares:", error),
		);
	}

	public static async [postListen](this: Client, options: ClientOptions): Promise<void> {
		if ((options.api?.automaticallyConnect ?? true) === false) return;
		await container.server.connect();
	}
}

Client.plugins.registerPostInitializationHook(
	ApiPlugin[postInitialization],
	"WolfStar-Api-PostInitialization",
);
Client.plugins.registerPostListenHook(ApiPlugin[postListen], "WolfStar-Api-PostListen");

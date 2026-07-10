import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { ApiServerEvent } from "../lib/http/ApiServer";

/**
 * Logs and responds with a 500 when a route's `run` method throws.
 */
export class PluginRouteErrorListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, { emitter: "server", event: ApiServerEvent.RouteError });
	}

	public override run(error: unknown, _request: ApiRequest, response: ApiResponse): void {
		console.error("[plugin-api] Route error:", error);
		if (!response.writableEnded) response.error();
	}
}

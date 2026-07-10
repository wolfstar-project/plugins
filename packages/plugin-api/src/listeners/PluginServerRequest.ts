import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { ApiServerEvent } from "../lib/http/ApiServer";
import type { HttpMethod } from "../lib/http/HttpMethod";
import { RouterRoot } from "../lib/structures/router/RouterRoot";

/**
 * Parses the request URL, matches it against the route trie, runs every middleware, then emits
 * the outcome (`routerFound`, `routerBranchNotFound`, or `routerBranchMethodNotAllowed`) for the
 * downstream listeners to handle.
 */
export class PluginServerRequestListener extends Listener {
	public constructor(context: Listener.LoaderContext) {
		super(context, { emitter: "server", event: ApiServerEvent.Request });
	}

	public override async run(request: ApiRequest, response: ApiResponse): Promise<void> {
		const [pathname, querystring] = splitUrl(request.url);
		request.query = new URLSearchParams(querystring);

		const parts = RouterRoot.normalize(pathname);
		const branch = container.server.routes.router.find(parts);
		const node = branch?.node ?? null;
		const route = node?.get((request.method ?? "GET") as HttpMethod) ?? null;

		if (node) request.params = node.extractParameters(parts);
		request.routerNode = branch;
		request.route = route;

		try {
			// Middlewares always run, even without a match, since browsers send a pre-flight OPTIONS request.
			await container.server.middlewares.run(request, response);
		} catch (error) {
			container.server.emit(ApiServerEvent.MiddlewareError, error, request, response);
			return;
		}

		if (response.writableEnded) return;

		if (branch === null) {
			container.server.emit(ApiServerEvent.RouterBranchNotFound, request, response);
		} else if (route === null) {
			container.server.emit(ApiServerEvent.RouterBranchMethodNotAllowed, request, response);
		} else {
			container.server.emit(ApiServerEvent.RouterFound, request, response);
		}
	}
}

function splitUrl(url = "/"): [pathname: string, querystring: string] {
	const index = url.indexOf("?");
	return index === -1 ? [url, ""] : [url.slice(0, index), url.slice(index + 1)];
}

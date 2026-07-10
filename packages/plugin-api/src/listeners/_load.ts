import { container } from "@wolfstar/http-framework";
import { PluginRouteErrorListener } from "./PluginRouteError";
import { PluginServerMiddlewareErrorListener } from "./PluginServerMiddlewareError";
import { PluginServerRequestListener } from "./PluginServerRequest";
import { PluginServerRouterBranchMethodNotAllowedListener } from "./PluginServerRouterBranchMethodNotAllowed";
import { PluginServerRouterBranchNotFoundListener } from "./PluginServerRouterBranchNotFound";
import { PluginServerRouterFoundListener } from "./PluginServerRouterFound";

/**
 * Registers the built-in dispatch-pipeline listeners into the framework's existing listener
 * store, targeting the `server` container entry (see {@link ApiServer}).
 */
export async function loadListeners(): Promise<void> {
	await Promise.all([
		container.stores.loadPiece({
			store: "listeners",
			name: "pluginServerRequest",
			piece: PluginServerRequestListener,
		}),
		container.stores.loadPiece({
			store: "listeners",
			name: "pluginServerRouterFound",
			piece: PluginServerRouterFoundListener,
		}),
		container.stores.loadPiece({
			store: "listeners",
			name: "pluginServerRouterBranchNotFound",
			piece: PluginServerRouterBranchNotFoundListener,
		}),
		container.stores.loadPiece({
			store: "listeners",
			name: "pluginServerRouterBranchMethodNotAllowed",
			piece: PluginServerRouterBranchMethodNotAllowedListener,
		}),
		container.stores.loadPiece({
			store: "listeners",
			name: "pluginServerMiddlewareError",
			piece: PluginServerMiddlewareErrorListener,
		}),
		container.stores.loadPiece({
			store: "listeners",
			name: "pluginRouteError",
			piece: PluginRouteErrorListener,
		}),
	]);
}

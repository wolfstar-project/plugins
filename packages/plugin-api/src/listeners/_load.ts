import { container } from "@wolfstar/http-framework";
import { PluginRouteErrorListener } from "./PluginRouteError";
import { PluginServerMiddlewareErrorListener } from "./PluginServerMiddlewareError";
import { PluginServerMiddlewareSuccessListener } from "./PluginServerMiddlewareSuccess";
import { PluginServerRequestListener } from "./PluginServerRequest";
import { PluginServerRouterBranchMethodNotAllowedListener } from "./PluginServerRouterBranchMethodNotAllowed";
import { PluginServerRouterBranchNotFoundListener } from "./PluginServerRouterBranchNotFound";
import { PluginServerRouterFoundListener } from "./PluginServerRouterFound";

/**
 * Registers the built-in dispatch-pipeline listeners into the framework's existing listener
 * store, targeting the `server` container entry (see {@link Server}).
 */
export async function loadListeners(): Promise<void> {
  await Promise.all([
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginRouteError",
      piece: PluginRouteErrorListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerMiddlewareError",
      piece: PluginServerMiddlewareErrorListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerMiddlewareSuccess",
      piece: PluginServerMiddlewareSuccessListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRequest",
      piece: PluginServerRequestListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRouterBranchMethodNotAllowed",
      piece: PluginServerRouterBranchMethodNotAllowedListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRouterBranchNotFound",
      piece: PluginServerRouterBranchNotFoundListener,
    }),
    container.stores.loadPiece({
      store: "listeners",
      name: "PluginServerRouterFound",
      piece: PluginServerRouterFoundListener,
    }),
  ]);
}

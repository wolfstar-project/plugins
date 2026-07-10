import { LoaderStrategy, type Store } from "@sapphire/pieces";
import type { Route } from "./Route";
import type { RouteStore } from "./RouteStore";

/**
 * Keeps {@link RouteStore.router} in sync as route pieces are loaded and unloaded.
 */
export class RouteLoaderStrategy extends LoaderStrategy<Route> {
  public override onLoad(store: Store<Route>, piece: Route): void {
    super.onLoad(store, piece);
    (store as RouteStore).router.add(piece);
  }

  public override onUnload(store: Store<Route>, piece: Route): void {
    super.onUnload(store, piece);
    (store as RouteStore).router.remove(piece);
  }
}

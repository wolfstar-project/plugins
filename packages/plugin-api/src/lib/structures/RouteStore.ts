import { Store } from "@sapphire/pieces";
import { Route } from "./Route";
import { RouteLoaderStrategy } from "./RouteLoaderStrategy";
import { RouterRoot } from "./router/RouterRoot";

export class RouteStore extends Store<Route, "routes"> {
  /**
   * The trie used to match an incoming request's pathname to a registered {@link Route}.
   */
  public readonly router = new RouterRoot();

  public constructor() {
    super(Route, { name: "routes", strategy: new RouteLoaderStrategy() });
  }
}

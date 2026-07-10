import { Piece, type PieceOptions } from "@sapphire/pieces";
import type { ApiRequest } from "../http/ApiRequest";
import type { ApiResponse } from "../http/ApiResponse";
import type { HttpMethod } from "../http/HttpMethod";
import { RouterRoot } from "./router/RouterRoot";

export type Awaitable<T> = T | PromiseLike<T>;

/**
 * A single HTTP endpoint. The route's path and methods are either given explicitly via
 * {@link Route.Options.route}/{@link Route.Options.methods}, or inferred from the piece's file
 * system location: directories become path segments (`(group)`-style directories are skipped,
 * `index` collapses into its parent), `[param]` segments become dynamic, and a `.<method>`
 * filename suffix (e.g. `hello.post.ts`) implies that HTTP method.
 */
export abstract class Route<Options extends Route.Options = Route.Options> extends Piece<
  Options,
  "routes"
> {
  /**
   * The normalized path segments this route is registered under, e.g. `['users', '[id]']`.
   */
  public readonly path: readonly string[];

  /**
   * The HTTP methods this route responds to.
   */
  public readonly methods: ReadonlySet<HttpMethod>;

  public constructor(context: Route.LoaderContext, options: Options) {
    super(context, options);

    const methods = new Set<HttpMethod>(options.methods ?? []);

    let path: string;
    if (options.route) {
      path = options.route;
    } else {
      let name = context.name;
      const implied = RouterRoot.extractMethod(name);
      if (implied) {
        name = name.slice(0, name.length - implied.length - 1);
        methods.add(implied);
      }

      path = RouterRoot.makeRoutePathForPiece(this.location.directories, name);
    }

    if (methods.size === 0) methods.add("GET");

    this.path = RouterRoot.normalize(path);
    this.methods = methods;
  }

  /**
   * Handles every method this route was registered for. Branch on `request.method` when a route
   * needs to support multiple methods.
   */
  public abstract run(request: ApiRequest, response: ApiResponse): Awaitable<unknown>;
}

export namespace Route {
  export type LoaderContext = Piece.LoaderContext<"routes">;

  export interface Options extends PieceOptions {
    /**
     * An explicit route path, e.g. `/users/[id]`. If omitted, the path is inferred from the
     * piece's directory structure and file name.
     */
    route?: `/${string}`;

    /**
     * The HTTP methods this route responds to. If omitted, inferred from a `.<method>` filename
     * suffix (e.g. `hello.post.ts`), defaulting to `GET`.
     */
    methods?: readonly HttpMethod[];
  }
}

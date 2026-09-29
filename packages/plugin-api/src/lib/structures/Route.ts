import { Piece, type PieceOptions } from "@sapphire/pieces";
import type { Awaitable } from "../utils/common";
import type { ApiRequest } from "./api/ApiRequest";
import type { ApiResponse } from "./api/ApiResponse";
import type { MethodName } from "./http/HttpMethods";
import { RouterRoot } from "./router/RouterRoot";

/**
 * The base class for every route. A route answers the `methods` it declares on `path`; a route that
 * declares no methods (through `options.methods` or a `name.method` piece name) matches nothing.
 */
export abstract class Route<Options extends Route.Options = Route.Options> extends Piece<
  Options,
  "routes"
> {
  /**
   * The path segments of the route, prefix included.
   */
  public readonly path: readonly string[];

  /**
   * The methods this route answers.
   */
  public readonly methods: ReadonlySet<MethodName>;

  /**
   * The maximum request body size in bytes for this route.
   */
  public readonly maximumBodyLength: number;

  public constructor(context: Route.LoaderContext, options: Options = {} as Options) {
    super(context, options);

    const api = this.container.server.options;
    const methods = new Set<MethodName>(options.methods ?? []);
    const path = RouterRoot.normalize(api.prefix);

    if (options.route !== undefined) {
      path.push(...RouterRoot.normalize(options.route));
    } else {
      const name = this.name;
      const implied = RouterRoot.extractMethod(name);
      if (implied !== null) methods.add(implied);

      const routeName = implied === null ? name : name.slice(0, name.lastIndexOf("."));
      path.push(
        ...RouterRoot.normalize(
          RouterRoot.makeRoutePathForPiece(this.location.directories, routeName),
        ),
      );
    }

    this.path = path;
    this.methods = methods;
    this.maximumBodyLength = options.maximumBodyLength ?? api.maximumBodyLength ?? 1024 * 1024 * 50;
  }

  /**
   * Runs when a request matches this route. Errors thrown here are emitted as `ServerEvent.RouteError`.
   */
  public abstract run(request: Route.Request, response: Route.Response): Awaitable<unknown>;

  public override toJSON(): Route.JSON {
    return {
      ...super.toJSON(),
      options: {
        ...this.options,
        methods: [...this.methods],
        route: `/${this.path.join("/")}`,
        maximumBodyLength: this.maximumBodyLength,
      },
    };
  }
}

export interface RouteOptions extends PieceOptions {
  /**
   * The route the route answers, for example `/users/[id]`. If omitted, it is derived from the file
   * path and the piece name.
   */
  route?: string;

  /**
   * The maximum request body size in bytes for this route. Falls back to `ServerOptions.maximumBodyLength`.
   */
  maximumBodyLength?: number;

  /**
   * The methods the route answers. A `name.method` piece name adds its method to this list.
   */
  methods?: readonly MethodName[];
}

export namespace Route {
  /** @deprecated Use {@link Route.LoaderContext} instead. */
  export type Context = LoaderContext;
  export type LoaderContext = Piece.LoaderContext<"routes">;
  export type Options = RouteOptions;
  export type JSON = Piece.JSON;
  export type LocationJSON = Piece.LocationJSON;
  export type Request = ApiRequest;
  export type Response = ApiResponse;
}

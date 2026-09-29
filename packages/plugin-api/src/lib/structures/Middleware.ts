import { Piece, type PieceOptions } from "@sapphire/pieces";
import type { Awaitable } from "../utils/common";
import type { ApiRequest } from "./api/ApiRequest";
import type { ApiResponse } from "./api/ApiResponse";

/**
 * The base class for every middleware. Middlewares run in ascending `position` order before the
 * route is resolved. The built-in ones sit at `headers` 10, `body` 20 and `cookies` 30.
 */
export abstract class Middleware<
  Options extends Middleware.Options = Middleware.Options,
> extends Piece<Options, "middlewares"> {
  /**
   * The position of the middleware; lower runs first.
   */
  public readonly position: number;

  public constructor(context: Middleware.LoaderContext, options: Options = {} as Options) {
    super(context, options);
    this.position = options.position ?? 1000;
  }

  /**
   * Runs for every request. Ending the response stops the remaining middlewares and the route.
   */
  public abstract run(
    request: Middleware.Request,
    response: Middleware.Response,
  ): Awaitable<unknown>;

  public override toJSON(): Middleware.JSON {
    return {
      ...super.toJSON(),
      options: { ...this.options, position: this.position },
    };
  }
}

export interface MiddlewareOptions extends PieceOptions {
  /**
   * The position of the middleware; lower runs first.
   * @default 1000
   */
  position?: number;
}

export namespace Middleware {
  export type Request = ApiRequest;
  export type Response = ApiResponse;
  export type Options = MiddlewareOptions;
  export type JSON = Piece.JSON;
  export type LocationJSON = Piece.LocationJSON;
  /** @deprecated Use {@link Middleware.LoaderContext} instead. */
  export type Context = LoaderContext;
  export type LoaderContext = Piece.LoaderContext<"middlewares">;
}

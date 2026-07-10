import { Piece, type PieceOptions } from "@sapphire/pieces";
import type { ApiRequest } from "../http/ApiRequest";
import type { ApiResponse } from "../http/ApiResponse";
import type { Awaitable } from "./Route";

/**
 * A piece that runs on every incoming request, in ascending {@link Middleware.position} order,
 * before route dispatch. A middleware stops the chain implicitly by ending the response
 * (`response.writableEnded`); there is no explicit `next()` callback.
 */
export abstract class Middleware<
	Options extends Middleware.Options = Middleware.Options,
> extends Piece<Options, "middlewares"> {
	/**
	 * The built-in middlewares use the following positions:
	 * - `headers`: 10 (CORS headers, 404/405 short-circuit)
	 * - `body`: 20 (`Content-Length` validation)
	 */
	public readonly position: number;

	public constructor(context: Middleware.LoaderContext, options: Options) {
		super(context, options);
		this.position = options.position ?? 1000;
	}

	public abstract run(request: ApiRequest, response: ApiResponse): Awaitable<unknown>;
}

export namespace Middleware {
	export type LoaderContext = Piece.LoaderContext<"middlewares">;

	export interface Options extends PieceOptions {
		/**
		 * Middlewares run in ascending order of this value.
		 * @default 1000
		 */
		position?: number;
	}
}

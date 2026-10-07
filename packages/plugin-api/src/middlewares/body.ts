import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { Middleware } from "../lib/structures/Middleware";

/**
 * Rejects requests whose declared `content-length` exceeds the matched route's `maximumBodyLength`.
 * Chunked bodies without a `content-length` are not length-limited.
 */
export class BodyMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 20 });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    if (!request.route) return;

    const contentLength = request.headers["content-length"];
    if (typeof request.headers["content-type"] !== "string" || typeof contentLength !== "string") {
      return;
    }

    if (Number(contentLength) > request.route.maximumBodyLength) {
      response
        .status(HttpCodes.PayloadTooLarge)
        .json({ error: "Exceeded maximum content length." });
    }
  }
}

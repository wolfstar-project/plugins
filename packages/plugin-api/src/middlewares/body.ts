import { container, HttpCodes } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { Middleware } from "../lib/structures/Middleware";

/**
 * Rejects requests whose declared `Content-Length` exceeds {@link ApiServerOptions.maximumBodyLength}.
 * Runs second (position 20), after CORS headers have been set.
 */
export class BodyMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 20 });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    const limit = container.server.options.maximumBodyLength ?? 1024 * 1024 * 50;
    const contentLength = Number(request.headers["content-length"] ?? 0);

    if (contentLength > limit) {
      response.json({ error: "Payload Too Large" }, HttpCodes.PayloadTooLarge);
    }
  }
}

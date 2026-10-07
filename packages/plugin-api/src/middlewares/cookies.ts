import { CookieStore } from "../lib/structures/api/CookieStore";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { Middleware } from "../lib/structures/Middleware";

/**
 * Creates `response.cookies`. Cookies are marked `Secure` when `NODE_ENV` is `production`.
 */
export class CookiesMiddleware extends Middleware {
  private readonly production = process.env.NODE_ENV === "production";

  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 30 });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    response.cookies = new CookieStore(request, response, this.production);
  }
}

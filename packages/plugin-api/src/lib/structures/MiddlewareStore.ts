import { Store } from "@sapphire/pieces";
import type { ApiRequest } from "../http/ApiRequest";
import type { ApiResponse } from "../http/ApiResponse";
import { Middleware } from "./Middleware";

export class MiddlewareStore extends Store<Middleware, "middlewares"> {
  /**
   * Enabled middlewares, kept sorted in ascending {@link Middleware.position} order.
   */
  public readonly sortedMiddlewares: Middleware[] = [];

  public constructor() {
    super(Middleware, { name: "middlewares" });
  }

  /**
   * Runs every enabled middleware in order, stopping early once the response has ended.
   */
  public async run(request: ApiRequest, response: ApiResponse): Promise<void> {
    for (const middleware of this.sortedMiddlewares) {
      if (response.writableEnded) return;
      if (middleware.enabled) await middleware.run(request, response);
    }
  }

  public override set(key: string, value: Middleware): this {
    const index = this.sortedMiddlewares.findIndex(
      (middleware) => middleware.position >= value.position,
    );
    if (index === -1) this.sortedMiddlewares.push(value);
    else this.sortedMiddlewares.splice(index, 0, value);

    return super.set(key, value);
  }

  public override delete(key: string): boolean {
    const index = this.sortedMiddlewares.findIndex((middleware) => middleware.name === key);
    if (index !== -1) this.sortedMiddlewares.splice(index, 1);

    return super.delete(key);
  }

  public override clear(): void {
    this.sortedMiddlewares.length = 0;
    super.clear();
  }
}

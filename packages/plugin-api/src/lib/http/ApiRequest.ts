import { IncomingMessage } from "node:http";
import type { Route } from "../structures/Route";
import type { RouterBranch } from "../structures/router/RouterBranch";

export class ApiRequest extends IncomingMessage {
  /**
   * The parsed query string parameters.
   */
  public query: URLSearchParams = new URLSearchParams();

  /**
   * The extracted dynamic (`[param]`) path segment values.
   */
  public params: Record<string, string> = {};

  /**
   * The matched router branch for this request's pathname, if any.
   */
  public routerNode: RouterBranch | null = null;

  /**
   * The matched route for this request's pathname and method, if any.
   */
  public route: Route | null = null;

  /**
   * Reads the full request body as a UTF-8 string.
   * @param limit The maximum number of bytes to read before rejecting. Defaults to 1 MiB.
   */
  public async readBodyText(limit = 1024 * 1024): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of this) {
      size += (chunk as Buffer).length;
      if (size > limit) throw new RangeError(`Request body exceeded the ${limit} byte limit`);
      chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString("utf8");
  }

  /**
   * Reads and parses the request body as JSON.
   * @param limit The maximum number of bytes to read before rejecting. Defaults to 1 MiB.
   */
  public async readBodyJson<T = unknown>(limit?: number): Promise<T> {
    const text = await this.readBodyText(limit);
    return JSON.parse(text) as T;
  }
}

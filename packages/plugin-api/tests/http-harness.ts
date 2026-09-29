import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ApiRequest } from "../src/lib/structures/api/ApiRequest";
import { ApiResponse } from "../src/lib/structures/api/ApiResponse";

export interface Harness {
  readonly baseUrl: string;
  close(): Promise<void>;
}

const running: Harness[] = [];

/**
 * Starts a bare `node:http` server that builds `ApiRequest`/`ApiResponse` objects and hands them to `handler`.
 * A rejected handler answers with an empty 500.
 */
export async function startHarness(
  handler: (request: ApiRequest, response: ApiResponse) => unknown,
): Promise<Harness> {
  const server = createServer(
    { IncomingMessage: ApiRequest, ServerResponse: ApiResponse },
    (request, response) => {
      Promise.resolve()
        .then(() => handler(request as ApiRequest, response as ApiResponse))
        .catch(() => {
          if (!response.writableEnded) {
            response.statusCode = 500;
            response.end();
          }
        });
    },
  );

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const harness: Harness = {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
  running.push(harness);
  return harness;
}

export async function closeAllHarnesses(): Promise<void> {
  await Promise.all(running.splice(0).map((harness) => harness.close()));
}

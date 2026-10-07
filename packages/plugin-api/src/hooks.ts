import { container, type ClientOptions } from "@wolfstar/http-framework";
import { Server } from "./lib/structures/http/Server";
import { loadListeners } from "./listeners/_load";
import { loadMiddlewares } from "./middlewares/_load";

/**
 * Creates the standalone {@link Server} from `ClientOptions.api`, registers its route and middleware stores, and loads
 * the built-in listeners and middlewares.
 *
 * @remarks
 * The loaders are not awaited: a failure is reported on the console instead of failing the client.
 */
export function installApi(options: ClientOptions): void {
  const server = new Server(options.api);

  container.stores //
    .register(server.routes)
    .register(server.middlewares);

  loadListeners().catch((error: unknown) =>
    console.error("[plugin-api] Failed to load listeners:", error),
  );
  loadMiddlewares().catch((error: unknown) =>
    console.error("[plugin-api] Failed to load middlewares:", error),
  );
}

/**
 * Starts listening, unless `ClientOptions.api.automaticallyConnect` is `false`.
 */
export async function connectApi(options: ClientOptions): Promise<void> {
  if ((options.api?.automaticallyConnect ?? true) === false) return;
  await container.server.connect();
}

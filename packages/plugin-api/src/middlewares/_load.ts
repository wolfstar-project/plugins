import { container } from "@wolfstar/http-framework";
import { BodyMiddleware } from "./body";
import { CookiesMiddleware } from "./cookies";
import { HeadersMiddleware } from "./headers";

/**
 * Registers the built-in middlewares (`body`, `cookies`, `headers`) into {@link Server.middlewares}.
 */
export async function loadMiddlewares(): Promise<void> {
  await Promise.all([
    container.stores.loadPiece({ store: "middlewares", name: "body", piece: BodyMiddleware }),
    container.stores.loadPiece({ store: "middlewares", name: "cookies", piece: CookiesMiddleware }),
    container.stores.loadPiece({ store: "middlewares", name: "headers", piece: HeadersMiddleware }),
  ]);
}

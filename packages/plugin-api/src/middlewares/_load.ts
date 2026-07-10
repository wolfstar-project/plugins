import { container } from "@wolfstar/http-framework";
import { BodyMiddleware } from "./body";
import { HeadersMiddleware } from "./headers";

/**
 * Registers the built-in middlewares (`headers`, `body`) into {@link ApiServer.middlewares}.
 */
export async function loadMiddlewares(): Promise<void> {
	await Promise.all([
		container.stores.loadPiece({ store: "middlewares", name: "headers", piece: HeadersMiddleware }),
		container.stores.loadPiece({ store: "middlewares", name: "body", piece: BodyMiddleware }),
	]);
}

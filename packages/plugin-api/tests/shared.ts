import { container, VirtualPath } from "@sapphire/pieces";
import { Route } from "../src/lib/structures/Route";
import type { MethodName } from "../src/lib/structures/http/HttpMethods";

export function makeRoute(route: string, methods: readonly MethodName[] = ["GET"]): Route {
  (container as unknown as { server?: unknown }).server ??= { options: {} };

  class UserRoute extends Route {
    public constructor(context: Route.LoaderContext) {
      super(context, { route, methods });
    }

    public run(): void {}
  }

  return new UserRoute({
    name: "test",
    path: VirtualPath,
    root: VirtualPath,
    store: null as never,
  });
}

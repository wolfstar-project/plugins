import { container, VirtualPath } from "@sapphire/pieces";
import { Route } from "../src/lib/structures/Route";
import { makeRoute } from "./shared";

function setServerOptions(options: Record<string, unknown>) {
  (container as unknown as { server: unknown }).server = { options };
}

describe("Route", () => {
  beforeEach(() => setServerOptions({}));

  it("given no methods then the route has none and no GET is implied (decision 8)", () => {
    const route = makeRoute("/hello", []);
    expect(route.methods.size).toBe(0);
  });

  it("given a route option then the path is normalized", () => {
    expect(makeRoute("/a/b/", ["GET"]).path).toStrictEqual(["a", "b"]);
  });

  it("given a server prefix then it is prepended to the path", () => {
    setServerOptions({ prefix: "v1/" });
    expect(makeRoute("/users", ["GET"]).path).toStrictEqual(["v1", "users"]);
  });

  it("given no maximumBodyLength anywhere then the default is 50 MiB", () => {
    expect(makeRoute("/x").maximumBodyLength).toBe(1024 * 1024 * 50);
  });

  it("given a server-wide maximumBodyLength then the route inherits it", () => {
    setServerOptions({ maximumBodyLength: 100 });
    expect(makeRoute("/x").maximumBodyLength).toBe(100);
  });

  it("given a per-route maximumBodyLength then it wins over the server-wide one", () => {
    setServerOptions({ maximumBodyLength: 100 });

    class Limited extends Route {
      public constructor(context: Route.LoaderContext) {
        super(context, { route: "/x", methods: ["POST"], maximumBodyLength: 5 });
      }

      public run(): void {}
    }

    const route = new Limited({
      name: "limited",
      path: VirtualPath,
      root: VirtualPath,
      store: null as never,
    });
    expect(route.maximumBodyLength).toBe(5);
  });

  it("given a piece name with a method suffix then the method and path come from the name", () => {
    class Named extends Route {
      public run(): void {}
    }

    const post = new Named({
      name: "hello.post",
      path: VirtualPath,
      root: VirtualPath,
      store: null as never,
    });
    expect(post.path).toStrictEqual(["hello"]);
    expect([...post.methods]).toStrictEqual(["POST"]);

    const index = new Named({
      name: "index.get",
      path: VirtualPath,
      root: VirtualPath,
      store: null as never,
    });
    expect(index.path).toStrictEqual([]);
    expect([...index.methods]).toStrictEqual(["GET"]);
  });
});

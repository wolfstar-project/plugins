import type { ApiRequest } from "../src/lib/http/ApiRequest";
import type { ApiResponse } from "../src/lib/http/ApiResponse";
import { Middleware } from "../src/lib/structures/Middleware";
import { MiddlewareStore } from "../src/lib/structures/MiddlewareStore";

const calls: string[] = [];

class FirstMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 10 });
  }

  public override run(): void {
    calls.push("first");
  }
}

class SecondMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 20 });
  }

  public override run(_request: ApiRequest, response: ApiResponse): void {
    calls.push("second");
    response.end();
  }
}

class ThirdMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 30 });
  }

  public override run(): void {
    calls.push("third");
  }
}

describe("MiddlewareStore", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("given middlewares registered out of order then sorts them ascending by position", async () => {
    const store = new MiddlewareStore();
    await store.loadPiece({ name: "third", piece: ThirdMiddleware });
    await store.loadPiece({ name: "first", piece: FirstMiddleware });
    await store.loadPiece({ name: "second", piece: SecondMiddleware });
    await store.loadAll();

    expect(store.sortedMiddlewares.map((middleware) => middleware.position)).toStrictEqual([
      10, 20, 30,
    ]);
  });

  it("given a middleware that ends the response then stops running the remaining chain", async () => {
    const store = new MiddlewareStore();
    await store.loadPiece({ name: "first", piece: FirstMiddleware });
    await store.loadPiece({ name: "second", piece: SecondMiddleware });
    await store.loadPiece({ name: "third", piece: ThirdMiddleware });
    await store.loadAll();

    const response = {
      writableEnded: false,
      end: vi.fn(function (this: { writableEnded: boolean }) {
        this.writableEnded = true;
      }),
    } as unknown as ApiResponse;

    await store.run({} as ApiRequest, response);

    // `second` ends the response, so `third` (checked before it would run) never fires.
    expect(calls).toStrictEqual(["first", "second"]);
  });

  it("given a removed middleware then no longer runs it", async () => {
    const store = new MiddlewareStore();
    await store.loadPiece({ name: "first", piece: FirstMiddleware });
    await store.loadPiece({ name: "second", piece: SecondMiddleware });
    await store.loadAll();
    store.delete("second");

    expect(store.sortedMiddlewares).toHaveLength(1);
    expect(store.sortedMiddlewares[0]!.name).toBe("first");
  });
});

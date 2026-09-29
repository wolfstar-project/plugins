import { container } from "@wolfstar/http-framework";
import { request as httpRequest } from "node:http";
import { Route } from "../src/lib/structures/Route";
import { Server } from "../src/lib/structures/http/Server";
import { loadListeners } from "../src/listeners/_load";
import { loadMiddlewares } from "../src/middlewares/_load";

class GreetRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/greet/[name]", methods: ["GET"] });
  }

  public override run(request: Route.Request, response: Route.Response): void {
    response.json({ message: `Hello, ${request.params.name}!` });
  }
}

class EchoRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/echo", methods: ["POST"] });
  }

  public override async run(request: Route.Request, response: Route.Response): Promise<void> {
    const body = (await request.readBodyJson()) as { text: string };
    response.json({ echo: body.text });
  }
}

class LimitedRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/limited", methods: ["POST"], maximumBodyLength: 5 });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.ok();
  }
}

class CookiesRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/cookies", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.json(Object.fromEntries(response.cookies));
  }
}

class SetCookieRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/set-cookie", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.cookies.add("session", "abc", { domain: "example.com" });
    response.ok();
  }
}

class SetCookieWithoutDomainRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/set-cookie-default", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.cookies.add("session", "abc");
    response.ok();
  }
}

class ThrowAfterHeadersRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/throw-after-headers", methods: ["GET"] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.writeHead(200);
    response.write("part");
    throw new Error("mid-stream failure");
  }
}

class JsonRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/json", methods: ["POST"] });
  }

  public override async run(request: Route.Request, response: Route.Response): Promise<void> {
    response.json(await request.readBodyJson());
  }
}

class BoomRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/boom", methods: ["GET"] });
  }

  public override run(): void {
    throw new Error("secret failure detail");
  }
}

class NoMethodsRoute extends Route {
  public constructor(context: Route.LoaderContext) {
    super(context, { route: "/no-methods", methods: [] });
  }

  public override run(_request: Route.Request, response: Route.Response): void {
    response.ok();
  }
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function rawRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: options.method ?? "GET", headers: options.headers, agent: false },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

describe("Server (integration)", () => {
  let server: Server;
  let baseUrl: string;
  const fatal = vi.fn();

  beforeAll(async () => {
    // `container.logger` is only assigned by the framework's `Client` constructor.
    container.logger = {
      fatal,
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    } as never;

    server = new Server({ listenOptions: { port: 0, host: "127.0.0.1" } });

    container.stores //
      .register(server.routes)
      .register(server.middlewares);

    await loadMiddlewares();
    await loadListeners();

    for (const [name, piece] of [
      ["greet", GreetRoute],
      ["echo", EchoRoute],
      ["limited", LimitedRoute],
      ["cookies", CookiesRoute],
      ["setCookie", SetCookieRoute],
      ["setCookieDefault", SetCookieWithoutDomainRoute],
      ["json", JsonRoute],
      ["boom", BoomRoute],
      ["throwAfterHeaders", ThrowAfterHeadersRoute],
      ["noMethods", NoMethodsRoute],
    ] as const) {
      await server.routes.loadPiece({ name, piece });
    }

    // `loadPiece` only queues pieces; flushing them is normally `client.load()`'s job.
    await container.stores.load();

    await server.connect();

    const address = server.server.address();
    if (address === null || typeof address === "string") throw new Error("Expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => fatal.mockClear());

  afterAll(async () => {
    await server.disconnect();
  });

  it("given a dynamic route then extracts the param and responds with json", async () => {
    const response = await fetch(`${baseUrl}/greet/world`);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Authorization, User-Agent, Content-Type",
    );
    await expect(response.json()).resolves.toStrictEqual({ message: "Hello, world!" });
  });

  it("given a POST route then reads the request body", async () => {
    const response = await fetch(`${baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hi" }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ echo: "hi" });
  });

  it("given an unregistered path then responds with an empty 404", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(fatal).not.toHaveBeenCalled();
  });

  it("given the root path without a route then responds with 404", async () => {
    const response = await fetch(`${baseUrl}/`);
    expect(response.status).toBe(404);
  });

  it("given a registered path with the wrong method then responds with an empty 405 listing the allowed methods", async () => {
    const response = await fetch(`${baseUrl}/greet/world`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET");
    expect(fatal).not.toHaveBeenCalled();
  });

  it("given an OPTIONS preflight then responds with an empty 200 and the route's methods", async () => {
    const response = await fetch(`${baseUrl}/greet/world`, { method: "OPTIONS" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET");
    expect(fatal).not.toHaveBeenCalled();
  });

  it("given a route declared with no methods then its path answers 404", async () => {
    const response = await fetch(`${baseUrl}/no-methods`);
    expect(response.status).toBe(404);
  });

  it("given a request declaring an oversized body then responds with 413", async () => {
    const response = await rawRequest(`${baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(1024 * 1024 * 100) },
    });
    expect(response.status).toBe(413);
  });

  it("given a route with its own maximumBodyLength then that limit is enforced", async () => {
    const response = await rawRequest(`${baseUrl}/limited`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "0123456789",
    });
    expect(response.status).toBe(413);
    expect(JSON.parse(response.body)).toStrictEqual({ error: "Exceeded maximum content length." });
  });

  it("given a malformed percent-encoded param then the raw value is used", async () => {
    const response = await rawRequest(`${baseUrl}/greet/%E0%A4%A`);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({ message: "Hello, %E0%A4%A!" });
  });

  it("given a Cookie header then response.cookies exposes it", async () => {
    const response = await rawRequest(`${baseUrl}/cookies`, {
      headers: { cookie: "a=1; b=hello%20world" },
    });
    expect(JSON.parse(response.body)).toStrictEqual({ a: "1", b: "hello world" });
  });

  it("given a malformed Cookie header then the bad pairs are skipped and the request succeeds (Review Focus 4)", async () => {
    const response = await rawRequest(`${baseUrl}/cookies`, {
      headers: { cookie: "a=1; bad=%E0%A4%A; noequals; c=3" },
    });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toStrictEqual({ a: "1", c: "3" });
  });

  it("given a request to an IP host then the request itself does not fail through the cookies middleware (Review Focus 2)", async () => {
    const response = await fetch(`${baseUrl}/greet/ip`);
    expect(response.status).toBe(200);
  });

  it("given an IP host and an explicit cookie domain then Set-Cookie is written (Review Focus 2)", async () => {
    const response = await fetch(`${baseUrl}/set-cookie`);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toStrictEqual([
      "session=abc; Domain=example.com; Path=/; HttpOnly",
    ]);
  });

  it("given an IP host and no cookie domain then add fails as a route error with a generic 500", async () => {
    const response = await fetch(`${baseUrl}/set-cookie-default`);
    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({ error: "Internal Server Error" });
    expect(fatal).toHaveBeenCalledOnce();
  });

  it("given an invalid JSON body then the route error becomes a generic 500 that does not leak the message (Review Focus 3)", async () => {
    const response = await rawRequest(`${baseUrl}/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(response.status).toBe(500);
    expect(JSON.parse(response.body)).toStrictEqual({ error: "Internal Server Error" });
    expect(fatal).toHaveBeenCalledOnce();
  });

  it("given a route that throws after the headers were sent then the response is ended and the process survives", async () => {
    const response = await rawRequest(`${baseUrl}/throw-after-headers`);
    expect(response.status).toBe(200);
    expect(response.body).toBe("part");
    expect(fatal).toHaveBeenCalledOnce();
  });

  it("given a route that throws then responds with a generic 500 and logs the error", async () => {
    const response = await fetch(`${baseUrl}/boom`);
    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({ error: "Internal Server Error" });
    expect(fatal).toHaveBeenCalledOnce();
    expect((fatal.mock.calls[0][0] as Error).message).toBe("secret failure detail");
  });
});

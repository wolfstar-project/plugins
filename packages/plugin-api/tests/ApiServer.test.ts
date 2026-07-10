import { container } from "@wolfstar/http-framework";
import { request as httpRequest } from "node:http";
import { ApiServer } from "../src/lib/http/ApiServer";
import { Route } from "../src/lib/structures/Route";
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
    const body = await request.readBodyJson<{ text: string }>();
    response.json({ echo: body.text });
  }
}

function rawRequest(
  url: string,
  options: { method: string; headers?: Record<string, string> },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: options.method, headers: options.headers }, (res) => {
      res.resume();
      res.on("end", () => resolve(res.statusCode ?? 0));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("ApiServer (integration)", () => {
  let server: ApiServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = new ApiServer({ listenOptions: { port: 0 } });

    container.stores //
      .register(server.routes)
      .register(server.middlewares);

    await loadMiddlewares();
    await loadListeners();

    await server.routes.loadPiece({ name: "greet.get", piece: GreetRoute });
    await server.routes.loadPiece({ name: "echo.post", piece: EchoRoute });

    // `loadPiece` only queues pieces; flushing them is normally `client.load()`'s job.
    await container.stores.load();

    await server.connect();

    const address = server.server.address();
    if (address === null || typeof address === "string") throw new Error("Expected an AddressInfo");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await server.disconnect();
  });

  it("given a dynamic route then extracts the param and responds with json", async () => {
    const response = await fetch(`${baseUrl}/greet/world`);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
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

  it("given an unregistered path then responds with 404", async () => {
    const response = await fetch(`${baseUrl}/missing`);
    expect(response.status).toBe(404);
  });

  it("given a registered path with the wrong method then responds with 405", async () => {
    const response = await fetch(`${baseUrl}/greet/world`, { method: "POST" });
    expect(response.status).toBe(405);
  });

  it("given an OPTIONS preflight request then responds with 204 and CORS headers", async () => {
    const response = await fetch(`${baseUrl}/greet/world`, { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("given a request declaring an oversized body then responds with 413", async () => {
    const statusCode = await rawRequest(`${baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(1024 * 1024 * 100) },
    });
    expect(statusCode).toBe(413);
  });
});

import { Readable } from "node:stream";
import type { ApiResponse } from "../src/lib/structures/api/ApiResponse";
import { closeAllHarnesses, startHarness } from "./http-harness";

afterEach(closeAllHarnesses);

async function call(run: (response: ApiResponse) => void) {
  const harness = await startHarness((_request, response) => run(response));
  return fetch(harness.baseUrl);
}

describe("ApiResponse helpers", () => {
  it.each([
    ["ok", 200, "OK"],
    ["created", 201, "Created"],
    ["noContent", 204, ""],
  ] as const)(
    "given %s then it answers %i with the status text as text",
    async (method, status, body) => {
      const result = await call((response) => response[method]());
      expect(result.status).toBe(status);
      expect(await result.text()).toBe(body);
    },
  );

  it.each([
    ["badRequest", 400, "Bad Request"],
    ["unauthorized", 401, "Unauthorized"],
    ["forbidden", 403, "Forbidden"],
    ["notFound", 404, "Not Found"],
    ["methodNotAllowed", 405, "Method Not Allowed"],
    ["conflict", 409, "Conflict"],
  ] as const)(
    "given %s then it answers %i with a JSON error body",
    async (method, status, message) => {
      const result = await call((response) => response[method]());
      expect(result.status).toBe(status);
      expect(await result.json()).toStrictEqual({ error: message });
    },
  );

  it("given custom data then the helper uses it", async () => {
    const result = await call((response) => response.badRequest("nope"));
    expect(await result.json()).toStrictEqual({ error: "nope" });
  });

  it("given a string then error answers 500 with that message", async () => {
    const result = await call((response) => response.error("boom"));
    expect(result.status).toBe(500);
    expect(await result.json()).toStrictEqual({ error: "boom" });
  });

  it("given a status number and data then error uses both", async () => {
    const result = await call((response) => response.error(418, "tea"));
    expect(result.status).toBe(418);
    expect(await result.json()).toStrictEqual({ error: "tea" });
  });

  it("given a string then respond sends text, otherwise JSON", async () => {
    const text = await call((response) => response.ok("hi"));
    expect(text.headers.get("content-type")).toBe("text/plain");
    const json = await call((response) => response.ok({ a: 1 }));
    expect(json.headers.get("content-type")).toBe("application/json");
    expect(await json.json()).toStrictEqual({ a: 1 });
  });

  it("given status then json the status code is applied", async () => {
    const result = await call((response) => response.status(202).json({ queued: true }));
    expect(result.status).toBe(202);
    expect(await result.json()).toStrictEqual({ queued: true });
  });

  it("given html then it sets the content type and status", async () => {
    const result = await call((response) => response.html(200, "<p>x</p>"));
    expect(result.headers.get("content-type")).toBe("text/html");
    expect(await result.text()).toBe("<p>x</p>");
  });

  it("given a buffer or a stream then image sends the bytes with the image type", async () => {
    const buffer = await call((response) => response.image("image/png", Buffer.from("abc")));
    expect(buffer.headers.get("content-type")).toBe("image/png");
    expect(await buffer.text()).toBe("abc");

    const stream = await call((response) =>
      response.image("image/png", Readable.from([Buffer.from("abc")])),
    );
    expect(stream.headers.get("content-type")).toBe("image/png");
    expect(await stream.text()).toBe("abc");
  });
});

import { connect } from "node:net";
import { RequestHeadersProxy } from "../src/lib/utils/_body/RequestHeadersProxy";
import { parseHost } from "../src/lib/utils/_body/RequestURLProxy";
import { closeAllHarnesses, startHarness } from "./http-harness";

afterEach(closeAllHarnesses);

describe("ApiRequest body readers", () => {
  it("given a JSON body then readBodyJson parses it", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json(await request.readBodyJson()),
    );
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await result.json()).toStrictEqual({ a: 1 });
  });

  it("given a urlencoded body then readBody returns FormData", async () => {
    const harness = await startHarness(async (request, response) => {
      const form = (await request.readBody()) as FormData;
      response.json(Object.fromEntries(form));
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      body: new URLSearchParams({ a: "1", b: "two" }),
    });
    expect(await result.json()).toStrictEqual({ a: "1", b: "two" });
  });

  it("given a multipart body then readBodyFormData parses the fields", async () => {
    const harness = await startHarness(async (request, response) => {
      const form = await request.readBodyFormData();
      response.json({ a: form.get("a") });
    });
    const body = new FormData();
    body.set("a", "hello");
    const result = await fetch(harness.baseUrl, { method: "POST", body });
    expect(await result.json()).toStrictEqual({ a: "hello" });
  });

  it("given a text body then readBodyText returns it", async () => {
    const harness = await startHarness(async (request, response) =>
      response.text(await request.readBodyText()),
    );
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });
    expect(await result.text()).toBe("hello");
  });

  it("given a chunked body without content-length then it is read completely (Review Focus 5)", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json({
        text: await request.readBodyText(),
        length: request.headers["content-length"] ?? null,
      }),
    );
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("he"));
        controller.enqueue(encoder.encode("llo"));
        controller.close();
      },
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(await result.json()).toStrictEqual({ text: "hello", length: null });
  });

  it("given a validator then readValidatedBodyJson returns the validated value", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json(await request.readValidatedBodyJson((data) => (data as { n: number }).n * 2)),
    );
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ n: 2 }),
    });
    expect(await result.json()).toBe(4);
  });

  it("given a body then readBodyBlob and readBodyArrayBuffer report its size and type", async () => {
    const harness = await startHarness(async (request, response) => {
      const blob = await request.readBodyBlob();
      response.json({ size: blob.size, type: blob.type });
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "abc",
    });
    expect(await result.json()).toStrictEqual({ size: 3, type: "text/plain" });

    const second = await startHarness(async (request, response) =>
      response.json({ bytes: (await request.readBodyArrayBuffer()).byteLength }),
    );
    const other = await fetch(second.baseUrl, { method: "POST", body: "abcd" });
    expect(await other.json()).toStrictEqual({ bytes: 4 });
  });

  it("given a GET request without a body then the readers return empty values", async () => {
    const harness = await startHarness(async (request, response) =>
      response.json({
        text: await request.readBodyText(),
        bytes: (await request.readBodyArrayBuffer()).byteLength,
      }),
    );
    const result = await fetch(harness.baseUrl);
    expect(await result.json()).toStrictEqual({ text: "", bytes: 0 });
  });

  it("given an invalid JSON body then readBodyJson rejects with a SyntaxError", async () => {
    const harness = await startHarness(async (request, response) => {
      try {
        await request.readBodyJson();
        response.json({});
      } catch (error) {
        response.json({ name: (error as Error).name });
      }
    });
    const result = await fetch(harness.baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{nope",
    });
    expect(await result.json()).toStrictEqual({ name: "SyntaxError" });
  });

  it("given a client that disconnects mid-body then the reader rejects instead of hanging", async () => {
    let settle!: (value: string) => void;
    const settled = new Promise<string>((resolve) => (settle = resolve));
    const harness = await startHarness(async (request) => {
      try {
        await request.readBodyText();
        settle("resolved");
      } catch {
        settle("rejected");
      }
    });

    const socket = connect(Number(new URL(harness.baseUrl).port), "127.0.0.1");
    socket.write(
      "POST / HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: 10\r\n\r\nabc",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.destroy();

    expect(await settled).toBe("rejected");
  });
});

describe("ApiRequest body readers after a disconnect", () => {
  it("given a client that disconnects before the body is read then the reader rejects instead of hanging", async () => {
    let settle!: (value: string) => void;
    const settled = new Promise<string>((resolve) => (settle = resolve));
    const harness = await startHarness(async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        await request.readBodyText();
        settle("resolved");
      } catch {
        settle("rejected");
      }
    });

    const socket = connect(Number(new URL(harness.baseUrl).port), "127.0.0.1");
    socket.write(
      "POST / HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nContent-Length: 10\r\n\r\nabc",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    socket.destroy();

    const outcome = await Promise.race([
      settled,
      new Promise<string>((resolve) => setTimeout(() => resolve("hung"), 1500)),
    ]);
    expect(outcome).toBe("rejected");
  });
});

describe("parseHost", () => {
  it.each([
    [undefined, ["localhost", -1]],
    ["", ["localhost", -1]],
    ["example.com", ["example.com", -1]],
    ["localhost:4000", ["localhost", 4000]],
    [":8080", ["", 8080]],
    ["host:", ["host", -1]],
    ["host:abc", ["host", -1]],
  ] as const)("given %j then it returns %j", (input, expected) => {
    expect(parseHost(input)).toStrictEqual(expected);
  });
});

const make = (headers: Record<string, string | string[] | undefined>) =>
  new RequestHeadersProxy({ headers } as never);

describe("RequestHeadersProxy", () => {
  it("given mixed-case lookups then get is case-insensitive and null for missing or empty", () => {
    const headers = make({ "content-type": "text/plain", empty: "" });
    expect(headers.get("Content-Type")).toBe("text/plain");
    expect(headers.get("missing")).toBeNull();
    expect(headers.get("empty")).toBeNull();
    expect(headers.has("content-type")).toBe(true);
    expect(headers.has("empty")).toBe(false);
  });

  it("given an array header then get joins the values", () => {
    expect(make({ accept: ["a", "b"] }).get("accept")).toBe("a, b");
  });

  it("given append, set and delete then the underlying headers change", () => {
    const headers = make({ "x-a": "a" });
    headers.append("X-A", "b");
    expect(headers.get("x-a")).toBe("a, b");
    headers.append("x-new", "1");
    expect(headers.get("x-new")).toBe("1");
    headers.set("x-a", "z");
    expect(headers.get("x-a")).toBe("z");
    headers.delete("x-a");
    expect(headers.has("x-a")).toBe(false);
  });

  it("given set-cookie values then getSetCookie splits them", () => {
    const headers = make({
      "set-cookie": ["a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT", "b=2"],
    });
    expect(headers.getSetCookie()).toStrictEqual([
      "a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT",
      "b=2",
    ]);
    expect(make({}).getSetCookie()).toStrictEqual([]);
  });

  it("given empty entries then iteration skips them", () => {
    const headers = make({ a: "1", b: "", c: undefined, d: "4" });
    expect([...headers.entries()]).toStrictEqual([
      ["a", "1"],
      ["d", "4"],
    ]);
    expect([...headers.keys()]).toStrictEqual(["a", "d"]);
    expect([...headers.values()]).toStrictEqual(["1", "4"]);
    expect([...headers]).toStrictEqual([...headers.entries()]);
  });
});

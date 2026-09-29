import { CookieStore } from "../src/lib/structures/api/CookieStore";

function fakeResponse() {
  const headers = new Map<string, unknown>();
  return {
    headers,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    setHeader: (name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
    },
  };
}

function make(
  cookie: string | undefined,
  {
    host = "api.example.com",
    remoteAddress = "10.0.0.1",
    secure = false,
    overwrite = null,
  }: {
    host?: string;
    remoteAddress?: string;
    secure?: boolean;
    overwrite?: string | null;
  } = {},
) {
  const response = fakeResponse();
  const store = new CookieStore(
    { headers: { cookie, host }, socket: { remoteAddress } } as never,
    response as never,
    secure,
    overwrite,
  );
  return { store, response };
}

describe("CookieStore", () => {
  it("given a Cookie header then the pairs are parsed and decoded", () => {
    const { store } = make("a=1; b=hello%20world");
    expect(store.get("a")).toBe("1");
    expect(store.get("b")).toBe("hello world");
  });

  it("given no Cookie header then the store is empty", () => {
    expect(make(undefined).store.size).toBe(0);
  });

  it("given malformed pairs then they are skipped and the rest are kept (Review Focus 4)", () => {
    const { store } = make("a=1; bad=%E0%A4%A; noequals; c=3");
    expect([...store.keys()]).toStrictEqual(["a", "c"]);
  });

  it("given a subdomain host then Domain is the registrable domain", () => {
    const { store, response } = make(undefined);
    store.add("s", "v");
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "s=v; Domain=.example.com; Path=/; HttpOnly",
    ]);
    expect(store.get("s")).toBe("v");
  });

  it("given secure, maxAge, expires and httpOnly options then the attributes follow the expected order", () => {
    const { store, response } = make(undefined, { secure: true });
    store.add("a", "1", { maxAge: 60, httpOnly: false, path: "/x" });
    store.add("b", "2", { expires: new Date(0) });
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "a=1; Max-Age=60; Domain=.example.com; Path=/x; Secure",
      "b=2; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.example.com; Path=/; Secure; HttpOnly",
    ]);
  });

  it("given the same name twice then the Set-Cookie entry is replaced", () => {
    const { store, response } = make(undefined);
    store.add("s", "1");
    store.add("s", "2");
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "s=2; Domain=.example.com; Path=/; HttpOnly",
    ]);
  });

  it("given remove then the key is dropped and an expired cookie is emitted", () => {
    const { store, response } = make("s=1");
    store.remove("s");
    expect(store.has("s")).toBe(false);
    expect(response.headers.get("set-cookie")).toStrictEqual([
      "s=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Domain=.example.com; Path=/; HttpOnly",
    ]);
  });

  it("given an invalid value then add throws every time and does not mutate the store", () => {
    const { store } = make(undefined);
    expect(() => store.add("a", "bad value")).toThrow("Invalid character in value");
    expect(() => store.add("a", "bad value")).toThrow("Invalid character in value");
    expect(store.has("a")).toBe(false);
  });

  it("given an IP host then reading works, add throws, and an explicit domain works (Review Focus 2)", () => {
    const { store, response } = make("a=1", {
      host: "127.0.0.1:4000",
      remoteAddress: "127.0.0.1",
    });
    expect(store.get("a")).toBe("1");
    expect(() => store.add("s", "v")).toThrow(/IP address/);
    store.add("s", "v", { domain: "example.com" });
    expect((response.headers.get("set-cookie") as string[])[0]).toContain("Domain=example.com");
  });

  it("given an IP host reached over a dual-stack socket then add still throws instead of writing Domain=<ip>", () => {
    const { store } = make(undefined, {
      host: "127.0.0.1:4000",
      remoteAddress: "::ffff:127.0.0.1",
    });
    expect(() => store.add("s", "v")).toThrow(/IP address/);
  });

  it("given a domain override then it wins over the host", () => {
    const { store, response } = make(undefined, { overwrite: ".foo.com" });
    store.add("s", "v");
    expect((response.headers.get("set-cookie") as string[])[0]).toContain("Domain=.foo.com");
  });

  it("given an uppercase host then the domain is lowercased", () => {
    const { store, response } = make(undefined, { host: "API.Example.COM" });
    store.add("s", "v");
    expect((response.headers.get("set-cookie") as string[])[0]).toContain("Domain=.example.com");
  });
});

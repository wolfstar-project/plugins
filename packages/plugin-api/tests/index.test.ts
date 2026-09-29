import * as api from "../src/index";

function isClass(value: unknown): boolean {
  return typeof value === "function" && /^class\s/.test(Function.prototype.toString.call(value));
}

describe("index exports", () => {
  it.each([
    "ApiRequest",
    "ApiResponse",
    "CookieStore",
    "Middleware",
    "MiddlewareStore",
    "Route",
    "RouteStore",
    "RouterBranch",
    "RouterNode",
    "RouterRoot",
    "Server",
  ])("given the %s export then it is a class", (name) => {
    expect(isClass((api as Record<string, unknown>)[name])).toBe(true);
  });

  it("given the loaders then both are exported functions", () => {
    expect(typeof api.loadListeners).toBe("function");
    expect(typeof api.loadMiddlewares).toBe("function");
  });

  it("given the enums and constants then they are exported", () => {
    expect(api.ServerEvent.RouterFound).toBe("routerFound");
    expect(api.HttpCodes.OK).toBe(200);
    expect(api.MethodNames).toContain("GET");
  });

  it("given the removed 1.x names then they are no longer exported", () => {
    expect((api as Record<string, unknown>).ApiServer).toBeUndefined();
    expect((api as Record<string, unknown>).ApiServerEvent).toBeUndefined();
  });

  it("given the version export then it is a string", () => {
    expect(typeof api.version).toBe("string");
  });
});

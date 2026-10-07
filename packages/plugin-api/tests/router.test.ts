import { RouterRoot } from "../src/lib/structures/router/RouterRoot";
import { makeRoute } from "./shared";

describe("router trie", () => {
  it("given a route then find returns the branch holding it", () => {
    const root = new RouterRoot();
    const route = makeRoute("/hello");
    root.add(route);
    expect(root.find(["hello"])?.node.get("GET")).toBe(route);
  });

  it("given a dynamic segment then the params are extracted", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/greet/[name]"));
    const parts = ["greet", "Ana"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ name: "Ana" });
  });

  it("given several dynamic segments then all params are extracted", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/[a]/x/[b]"));
    const parts = ["1", "x", "2"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ a: "1", b: "2" });
  });

  it("given percent-encoded params then they are decoded", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/users/[name]"));
    const parts = ["users", "J%C3%BCrgen"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ name: "Jürgen" });
  });

  it("given a malformed percent-encoded param then the raw value is kept", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/users/[name]"));
    const parts = ["users", "100%"];
    expect(root.find(parts)?.node.extractParameters(parts)).toStrictEqual({ name: "100%" });
  });

  it("given a static and a dynamic sibling then the static one wins", () => {
    const root = new RouterRoot();
    const me = makeRoute("/users/me");
    const byId = makeRoute("/users/[id]");
    root.add(me);
    root.add(byId);
    expect(root.find(["users", "me"])?.node.get("GET")).toBe(me);
    expect(root.find(["users", "7"])?.node.get("GET")).toBe(byId);
  });

  it("given a method that is not registered then get returns null", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/hello"));
    expect(root.find(["hello"])?.node.get("POST")).toBeNull();
  });

  it("given an unknown path then find returns null", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/hello"));
    expect(root.find(["nope"])).toBeNull();
  });

  it("given a branch without methods then find returns null (404, not 405)", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/a/b"));
    expect(root.find(["a"])).toBeNull();
    expect(root.find([])).toBeNull();
  });

  it("given a removed route then it is no longer found and the root is empty", () => {
    const root = new RouterRoot();
    const route = makeRoute("/hello");
    root.add(route);
    expect(root.remove(route)).toBe(true);
    expect(root.find(["hello"])).toBeNull();
    expect(root.empty).toBe(true);
  });

  it("given a different route object for the same path then remove returns false", () => {
    const root = new RouterRoot();
    const route = makeRoute("/a");
    root.add(route);
    expect(root.remove(makeRoute("/a"))).toBe(false);
    expect(root.find(["a"])?.node.get("GET")).toBe(route);
  });

  it("given a dynamic route next to a static branch then removing the dynamic one works", () => {
    const root = new RouterRoot();
    const staticRoute = makeRoute("/a");
    const dynamicRoute = makeRoute("/[x]/c");
    root.add(staticRoute);
    root.add(dynamicRoute);
    expect(root.remove(dynamicRoute)).toBe(true);
    expect(root.find(["q", "c"])).toBeNull();
    expect(root.find(["a"])?.node.get("GET")).toBe(staticRoute);
  });

  it("given a static route next to a dynamic sibling then removing the static one falls through to the dynamic one", () => {
    const root = new RouterRoot();
    const staticRoute = makeRoute("/a");
    const dynamicRoute = makeRoute("/[x]");
    root.add(staticRoute);
    root.add(dynamicRoute);
    expect(root.remove(staticRoute)).toBe(true);
    expect(root.find(["a"])?.node.get("GET")).toBe(dynamicRoute);
  });

  it("given two routes sharing a path then removing one keeps the other's methods", () => {
    const root = new RouterRoot();
    const get = makeRoute("/r", ["GET"]);
    const post = makeRoute("/r", ["POST"]);
    root.add(get);
    root.add(post);
    expect(root.remove(get)).toBe(true);
    const node = root.find(["r"])?.node;
    expect(node?.get("GET")).toBeNull();
    expect(node?.get("POST")).toBe(post);
    expect(root.supportedMethods).toStrictEqual(["POST"]);
  });

  it("given a deep route then supportedMethods bubbles up and is cleared on removal", () => {
    const root = new RouterRoot();
    const route = makeRoute("/a/b/c", ["POST"]);
    root.add(route);
    expect(root.supportedMethods).toContain("POST");
    expect(root.children[0].supportedMethods).toStrictEqual(["POST"]);
    root.remove(route);
    expect(root.supportedMethods).toStrictEqual([]);
  });

  it("given a removal that empties a branch then the branch is pruned", () => {
    const root = new RouterRoot();
    const route = makeRoute("/a/b/c");
    root.add(route);
    root.remove(route);
    expect(root.empty).toBe(true);
  });

  it("given a parent branch that still has methods then it is not pruned", () => {
    const root = new RouterRoot();
    const parent = makeRoute("/a");
    const child = makeRoute("/a/b");
    root.add(parent);
    root.add(child);
    root.remove(child);
    expect(root.find(["a"])?.node.get("GET")).toBe(parent);
    expect(root.children[0].empty).toBe(true);
  });

  it("given a static branch with no methods beside a dynamic sibling then the dynamic route still matches", () => {
    const root = new RouterRoot();
    const dynamic = makeRoute("/users/[id]");
    root.add(dynamic);
    root.add(makeRoute("/users/me/settings"));
    const parts = ["users", "me"];
    const branch = root.find(parts);
    expect(branch?.node.get("GET")).toBe(dynamic);
    expect(branch?.node.extractParameters(parts)).toStrictEqual({ id: "me" });
  });
});

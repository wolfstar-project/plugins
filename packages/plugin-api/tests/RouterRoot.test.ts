import { RouterRoot } from "../src/lib/structures/router/RouterRoot";
import { makeRoute } from "./shared";

describe("RouterRoot statics", () => {
  it("given empty inputs then normalize returns no parts", () => {
    expect(RouterRoot.normalize()).toStrictEqual([]);
    expect(RouterRoot.normalize(null)).toStrictEqual([]);
    expect(RouterRoot.normalize("")).toStrictEqual([]);
    expect(RouterRoot.normalize("/")).toStrictEqual([]);
  });

  it("given repeated slashes then normalize drops empty parts", () => {
    expect(RouterRoot.normalize("/a//b/")).toStrictEqual(["a", "b"]);
  });

  it("given a name with a method suffix then extractMethod returns it uppercased", () => {
    expect(RouterRoot.extractMethod("hello.get")).toBe("GET");
    expect(RouterRoot.extractMethod("hello.post")).toBe("POST");
    expect(RouterRoot.extractMethod(["a", "b.put"])).toBe("PUT");
  });

  it("given a name without a usable suffix then extractMethod returns null", () => {
    expect(RouterRoot.extractMethod("hello")).toBeNull();
    expect(RouterRoot.extractMethod("hello.")).toBeNull();
    expect(RouterRoot.extractMethod("")).toBeNull();
    expect(RouterRoot.extractMethod([])).toBeNull();
  });

  it("given any suffix then extractMethod does not validate it (strict upstream behaviour)", () => {
    expect(RouterRoot.extractMethod("hello.notamethod")).toBe("NOTAMETHOD");
  });

  it("given directories and a name then makeRoutePathForPiece joins them", () => {
    expect(RouterRoot.makeRoutePathForPiece([], "index")).toBe("");
    expect(RouterRoot.makeRoutePathForPiece(["a"], "index")).toBe("a");
    expect(RouterRoot.makeRoutePathForPiece(["a", "b"], "c")).toBe("a/b/c");
    expect(RouterRoot.makeRoutePathForPiece([" a ", "", "(group)", "b"], "[id]")).toBe("a/b/[id]");
  });
});

describe("RouterRoot structure", () => {
  it("given a new root then it is empty with an empty path", () => {
    const root = new RouterRoot();
    expect(root.path).toBe("");
    expect(root.toString()).toBe("");
    expect(root.children).toStrictEqual([]);
    expect(root.empty).toBe(true);
    expect(root.supportedMethods).toStrictEqual([]);
  });

  it("given nested branches then path includes every ancestor", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/a/b/[id]"));
    const a = root.children[0];
    const b = a.children[0];
    const id = b.children[0];
    expect(a.path).toBe("/a");
    expect(b.path).toBe("/a/b");
    expect(id.path).toBe("/a/b/[id]");
    expect(id.name).toBe("id");
    expect(id.dynamic).toBe(true);
  });

  it("given static and dynamic children then children lists static first and matches behaves", () => {
    const root = new RouterRoot();
    root.add(makeRoute("/a"));
    root.add(makeRoute("/[x]"));
    const [a, x] = root.children;
    expect(root.children.map(String)).toStrictEqual(["a", "[x]"]);
    expect(root.empty).toBe(false);
    expect(a.empty).toBe(true);
    expect(a.matches("a")).toBe(true);
    expect(a.matches("b")).toBe(false);
    expect(x.matches("anything")).toBe(true);
    expect([...root.nodes()]).toHaveLength(3);
  });
});

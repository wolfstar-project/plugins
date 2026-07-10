import type { Route } from "../src/lib/structures/Route";
import { RouterRoot } from "../src/lib/structures/router/RouterRoot";

function fakeRoute(path: readonly string[], methods: readonly string[]): Route {
	return { path, methods: new Set(methods) } as unknown as Route;
}

describe("RouterRoot static helpers", () => {
	it("given a path with slashes then normalizes to its non-empty segments", () => {
		expect(RouterRoot.normalize("/users/[id]/posts/")).toStrictEqual(["users", "[id]", "posts"]);
	});

	it("given a nullish path then normalizes to an empty array", () => {
		expect(RouterRoot.normalize(undefined)).toStrictEqual([]);
		expect(RouterRoot.normalize(null)).toStrictEqual([]);
		expect(RouterRoot.normalize("")).toStrictEqual([]);
	});

	it("given directories with a (group) segment then skips it", () => {
		expect(RouterRoot.makeRoutePathForPiece(["(v1)", "users"], "profile")).toBe("users/profile");
	});

	it("given a piece named index then collapses it into its parent", () => {
		expect(RouterRoot.makeRoutePathForPiece(["users"], "index")).toBe("users");
	});

	it("given a name with a method suffix then extracts the uppercased method", () => {
		expect(RouterRoot.extractMethod("hello.post")).toBe("POST");
		expect(RouterRoot.extractMethod("hello")).toBeNull();
		expect(RouterRoot.extractMethod("hello.notamethod")).toBeNull();
	});
});

describe("RouterRoot trie", () => {
	it("given a static route then matches its exact path", () => {
		const root = new RouterRoot();
		const route = fakeRoute(["health"], ["GET"]);
		root.add(route);

		const branch = root.find(["health"]);
		expect(branch?.node.get("GET")).toBe(route);
	});

	it("given no matching path then returns null", () => {
		const root = new RouterRoot();
		root.add(fakeRoute(["health"], ["GET"]));

		expect(root.find(["missing"])).toBeNull();
	});

	it("given a dynamic segment then matches and exposes the branch for param extraction", () => {
		const root = new RouterRoot();
		const route = fakeRoute(["users", "[id]"], ["GET"]);
		root.add(route);

		const branch = root.find(["users", "42"]);
		expect(branch?.node.get("GET")).toBe(route);
		expect(branch?.node.extractParameters(["users", "42"])).toStrictEqual({ id: "42" });
	});

	it("given a static child and a dynamic child then prefers the static match", () => {
		const root = new RouterRoot();
		const staticRoute = fakeRoute(["users", "me"], ["GET"]);
		const dynamicRoute = fakeRoute(["users", "[id]"], ["GET"]);
		root.add(dynamicRoute);
		root.add(staticRoute);

		expect(root.find(["users", "me"])?.node.get("GET")).toBe(staticRoute);
		expect(root.find(["users", "42"])?.node.get("GET")).toBe(dynamicRoute);
	});

	it("given a matched path but an unregistered method then the node has no entry for it", () => {
		const root = new RouterRoot();
		root.add(fakeRoute(["health"], ["GET"]));

		const branch = root.find(["health"]);
		expect(branch?.node.get("POST")).toBeUndefined();
	});

	it("given a removed route then it no longer matches", () => {
		const root = new RouterRoot();
		const route = fakeRoute(["health"], ["GET"]);
		root.add(route);
		root.remove(route);

		expect(root.find(["health"])?.node.get("GET")).toBeUndefined();
	});
});

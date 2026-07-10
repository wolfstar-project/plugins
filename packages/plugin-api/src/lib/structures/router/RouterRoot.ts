import { HttpMethods, type HttpMethod } from "../../http/HttpMethod";
import type { Route } from "../Route";
import { RouterBranch } from "./RouterBranch";
import type { RouterNode } from "./RouterNode";

const ROOT_NAME = "::ROOT::";

/**
 * The root of the route trie, owned by {@link RouteStore.router}. Provides the public
 * add/remove/find API plus the static path-parsing helpers used by {@link Route}'s constructor.
 */
export class RouterRoot extends RouterBranch {
	public constructor() {
		super(ROOT_NAME, false, null);
	}

	public add(route: Route): RouterNode {
		return this.insertAt(route.path, 0, route);
	}

	public remove(route: Route): boolean {
		return this.removeAt(route.path, 0, route);
	}

	public find(parts: readonly string[]): RouterBranch | null {
		return this.findAt(parts, 0);
	}

	/**
	 * Splits a `/`-delimited path into its non-empty segments.
	 */
	public static normalize(path?: string | null): string[] {
		if (!path) return [];
		return path.split("/").filter((part) => part.length > 0);
	}

	/**
	 * Builds a route path from a piece's directory structure and file name: `(group)`-style
	 * directories are skipped, and a file named `index` collapses into its parent directory.
	 */
	public static makeRoutePathForPiece(directories: readonly string[], name: string): string {
		const parts: string[] = [];

		for (const directory of directories) {
			const trimmed = directory.trim();
			if (trimmed.length === 0) continue;
			if (trimmed.startsWith("(") && trimmed.endsWith(")")) continue;
			parts.push(trimmed);
		}

		const trimmedName = name.trim();
		if (trimmedName !== "index") parts.push(trimmedName);

		return parts.join("/");
	}

	/**
	 * Extracts a trailing `.<method>` suffix from a piece name, e.g. `hello.post` → `POST`.
	 */
	public static extractMethod(name: string): HttpMethod | null {
		const index = name.lastIndexOf(".");
		if (index === -1) return null;

		const method = name.slice(index + 1).toUpperCase();
		return (HttpMethods as readonly string[]).includes(method) ? (method as HttpMethod) : null;
	}
}

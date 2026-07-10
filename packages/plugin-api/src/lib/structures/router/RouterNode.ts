import type { HttpMethod } from "../../http/HttpMethod";
import type { Route } from "../Route";
import type { RouterBranch } from "./RouterBranch";

/**
 * A single path segment's registered routes, keyed by HTTP method.
 */
export class RouterNode extends Map<HttpMethod, Route> {
	public readonly branch: RouterBranch;

	public constructor(branch: RouterBranch) {
		super();
		this.branch = branch;
	}

	/**
	 * Walks up the branch chain collecting the values captured by dynamic (`[param]`) segments.
	 * @param parts The path segments of the matched request, in the same order used to reach this node.
	 */
	public extractParameters(parts: readonly string[]): Record<string, string> {
		const params: Record<string, string> = {};

		let branch: RouterBranch | null = this.branch;
		let index = parts.length - 1;

		while (branch && branch.parent) {
			if (branch.dynamic) params[branch.name] = decodeURIComponent(parts[index]);
			branch = branch.parent;
			index -= 1;
		}

		return params;
	}
}

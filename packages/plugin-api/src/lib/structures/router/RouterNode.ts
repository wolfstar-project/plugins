import type { Route } from "../Route";
import type { MethodName } from "../http/HttpMethods";
import type { RouterBranch } from "./RouterBranch";

function decodeParameter(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export class RouterNode {
  /**
   * The branch containing this node.
   */
  public readonly parent: RouterBranch;

  /**
   * The methods this node supports.
   */
  readonly #methods = new Map<MethodName, Route>();

  public constructor(parent: RouterBranch) {
    this.parent = parent;
  }

  public get path(): string {
    return this.parent.path;
  }

  public extractParameters(parts: readonly string[]): Record<string, string> {
    const parameters: Record<string, string> = {};

    let branch: RouterBranch | null = this.parent;
    let index = parts.length - 1;
    while (branch?.parent) {
      if (branch.dynamic) parameters[branch.name] = decodeParameter(parts[index]);

      branch = branch.parent;
      --index;
    }

    return parameters;
  }

  public get(method: MethodName): Route | null {
    return this.#methods.get(method) ?? null;
  }

  public set(method: MethodName, route: Route): this {
    this.#methods.set(method, route);
    return this;
  }

  public delete(method: MethodName, route: Route): boolean {
    const existing = this.#methods.get(method);
    if (existing === route) {
      this.#methods.delete(method);
      return true;
    }

    return false;
  }

  public methods(): IterableIterator<MethodName> {
    return this.#methods.keys();
  }
}

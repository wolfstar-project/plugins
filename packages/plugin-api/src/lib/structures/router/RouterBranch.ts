import type { Route } from "../Route";
import { RouterNode } from "./RouterNode";

/**
 * A single segment of the route trie. Each branch owns exactly one {@link RouterNode} (its
 * method-to-route map) and may have any number of static children plus at most one dynamic
 * (`[param]`) child, which is only checked after every static child fails to match.
 */
export class RouterBranch {
  public readonly name: string;
  public readonly dynamic: boolean;
  public readonly parent: RouterBranch | null;
  public readonly node: RouterNode;

  private readonly staticChildren: RouterBranch[] = [];
  private dynamicChild: RouterBranch | null = null;

  public constructor(name: string, dynamic: boolean, parent: RouterBranch | null) {
    this.name = name;
    this.dynamic = dynamic;
    this.parent = parent;
    this.node = new RouterNode(this);
  }

  public matches(part: string): boolean {
    return this.dynamic || this.name === part;
  }

  protected insertAt(parts: readonly string[], index: number, route: Route): RouterNode {
    if (index >= parts.length) {
      for (const method of route.methods) this.node.set(method, route);
      return this.node;
    }

    const part = parts[index];
    const dynamic = part.startsWith("[") && part.endsWith("]");

    if (dynamic) {
      if (this.dynamicChild) return this.dynamicChild.insertAt(parts, index + 1, route);

      const branch = new RouterBranch(part.slice(1, -1), true, this);
      this.dynamicChild = branch;
      return branch.insertAt(parts, index + 1, route);
    }

    const staticChild = this.staticChildren.find((branch) => branch.name === part);
    if (staticChild) return staticChild.insertAt(parts, index + 1, route);

    const branch = new RouterBranch(part, false, this);
    this.staticChildren.push(branch);
    return branch.insertAt(parts, index + 1, route);
  }

  protected removeAt(parts: readonly string[], index: number, route: Route): boolean {
    if (index >= parts.length) {
      let removed = false;
      for (const method of route.methods) {
        if (this.node.delete(method)) removed = true;
      }
      return removed;
    }

    const part = parts[index];
    const child = this.staticChildren.find((branch) => branch.matches(part)) ?? this.dynamicChild;
    return child ? child.removeAt(parts, index + 1, route) : false;
  }

  protected findAt(parts: readonly string[], index: number): RouterBranch | null {
    if (index >= parts.length) return this;

    const part = parts[index];
    const child = this.staticChildren.find((branch) => branch.matches(part)) ?? this.dynamicChild;

    return child ? child.findAt(parts, index + 1) : null;
  }
}

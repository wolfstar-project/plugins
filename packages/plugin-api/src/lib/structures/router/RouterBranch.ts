import type { Route } from "../Route";
import type { MethodName } from "../http/HttpMethods";
import { RouterNode } from "./RouterNode";

function isDynamicPart(part: string): boolean {
  return part.length > 2 && part.startsWith("[") && part.endsWith("]");
}

export class RouterBranch {
  /**
   * The name of the branch.
   */
  public readonly name: string;

  /**
   * Whether or not the branch is dynamic.
   */
  public readonly dynamic: boolean;

  /**
   * The parent branch, if any.
   */
  public readonly parent: RouterBranch | null;

  /**
   * The node this branch is associated with.
   */
  public readonly node = new RouterNode(this);

  /**
   * The methods supported by the branch's node or any of its descendants.
   */
  public supportedMethods: readonly MethodName[] = [];

  private staticChildren: RouterBranch[] = [];
  private dynamicChild: RouterBranch | null = null;

  public constructor(name: string, dynamic: boolean, parent: RouterBranch | null) {
    this.name = name;
    this.dynamic = dynamic;
    this.parent = parent;
  }

  /**
   * The path representing this branch, including every ancestor.
   */
  public get path(): string {
    return this.parent ? `${this.parent.path}/${this}` : `${this}`;
  }

  /**
   * The branches directly below this one, static ones first.
   */
  public get children(): RouterBranch[] {
    return this.staticChildren.concat(this.dynamicChild ?? []);
  }

  /**
   * Whether or not the branch has no children.
   */
  public get empty(): boolean {
    return this.staticChildren.length === 0 && this.dynamicChild === null;
  }

  /**
   * Tries to find the branch that answers a path. A branch whose node has no methods never answers.
   *
   * @param parts The normalized parts of a path
   * @returns The branch found, or null if not found
   */
  public find(parts: readonly string[]): RouterBranch | null {
    return this.findAt(parts, 0);
  }

  /**
   * Checks if the given name matches the branch.
   */
  public matches(name: string): boolean {
    return this.dynamic || this.name === name;
  }

  public toString(): string {
    return this.dynamic ? `[${this.name}]` : this.name;
  }

  public *nodes(): IterableIterator<RouterNode> {
    yield this.node;
    for (const child of this.staticChildren) {
      yield* child.nodes();
    }

    if (this.dynamicChild) {
      yield* this.dynamicChild.nodes();
    }
  }

  protected insertAt(parts: readonly string[], index: number, route: Route): RouterNode {
    if (index >= parts.length) {
      for (const method of route.methods) {
        this.node.set(method, route);
      }

      this.updateSupportedMethods();
      return this.node;
    }

    const part = parts[index];
    let child: RouterBranch;
    if (isDynamicPart(part)) {
      this.dynamicChild ??= new RouterBranch(part.slice(1, -1), true, this);
      child = this.dynamicChild;
    } else {
      let existing = this.staticChildren.find((branch) => branch.name === part);
      if (!existing) {
        existing = new RouterBranch(part, false, this);
        this.staticChildren.push(existing);
      }

      child = existing;
    }

    const node = child.insertAt(parts, index + 1, route);
    this.updateSupportedMethods();
    return node;
  }

  protected removeAt(parts: readonly string[], index: number, route: Route): boolean {
    if (index >= parts.length) {
      let removed = false;
      for (const method of route.methods) {
        if (this.node.delete(method, route)) removed = true;
      }

      if (removed) this.updateSupportedMethods();
      return removed;
    }

    const part = parts[index];
    const child = isDynamicPart(part)
      ? this.dynamicChild
      : (this.staticChildren.find((branch) => branch.name === part) ?? null);
    if (child === null) return false;
    if (!child.removeAt(parts, index + 1, route)) return false;

    if (child.empty && child.node.methods().next().done === true) this.detach(child);
    this.updateSupportedMethods();
    return true;
  }

  private findAt(parts: readonly string[], index: number): RouterBranch | null {
    if (index >= parts.length) {
      return this.node.methods().next().done === true ? null : this;
    }

    const part = parts[index];
    const staticChild = this.staticChildren.find((branch) => branch.matches(part));
    return (
      staticChild?.findAt(parts, index + 1) ?? this.dynamicChild?.findAt(parts, index + 1) ?? null
    );
  }

  private detach(child: RouterBranch): void {
    if (child === this.dynamicChild) {
      this.dynamicChild = null;
    } else {
      this.staticChildren = this.staticChildren.filter((branch) => branch !== child);
    }
  }

  private updateSupportedMethods(): void {
    const methods = new Set<MethodName>(this.node.methods());
    for (const child of this.children) {
      for (const method of child.supportedMethods) methods.add(method);
    }

    this.supportedMethods = [...methods];
  }
}

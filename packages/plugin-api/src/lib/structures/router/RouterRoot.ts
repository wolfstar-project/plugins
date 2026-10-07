import type { Route } from "../Route";
import type { MethodName } from "../http/HttpMethods";
import { RouterBranch } from "./RouterBranch";
import type { RouterNode } from "./RouterNode";

export class RouterRoot extends RouterBranch {
  public constructor() {
    super("::ROOT::", false, null);
  }

  public override get path(): string {
    return "";
  }

  public add(route: Route): RouterNode {
    return this.insertAt(route.path, 0, route);
  }

  public remove(route: Route): boolean {
    return this.removeAt(route.path, 0, route);
  }

  public override toString(): string {
    return "";
  }

  public static normalize(path?: string | null): string[] {
    if (!path) return [];
    return path.split("/").filter((part) => part.length > 0);
  }

  public static makeRoutePathForPiece(directories: readonly string[], name: string): string {
    const parts: string[] = [];
    for (const directory of directories) {
      const trimmed = directory.trim();
      if (trimmed === "" || (trimmed.startsWith("(") && trimmed.endsWith(")"))) continue;
      parts.push(trimmed);
    }

    const trimmedName = name.trim();
    if (trimmedName !== "index") parts.push(trimmedName);
    return parts.join("/");
  }

  public static extractMethod(path: string | readonly string[]): MethodName | null {
    if (path.length === 0) return null;
    if (typeof path !== "string") return RouterRoot.extractMethod(path[path.length - 1]);

    const lastDot = path.lastIndexOf(".");
    if (lastDot === -1 || lastDot === path.length - 1) return null;
    return path.slice(lastDot + 1).toUpperCase() as MethodName;
  }
}

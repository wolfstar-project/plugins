import { MethodNames } from "../src/lib/structures/http/HttpMethods";
import { isNullish, isNullishOrEmpty } from "../src/lib/utils/common";
import { NodeUtilInspectSymbol } from "../src/lib/utils/constants";

describe("utils", () => {
  it("given null and undefined then isNullish is true", () => {
    expect(isNullish(null)).toBe(true);
    expect(isNullish(undefined)).toBe(true);
  });

  it("given other falsy values then isNullish is false", () => {
    expect(isNullish("")).toBe(false);
    expect(isNullish(0)).toBe(false);
    expect(isNullish(false)).toBe(false);
  });

  it("given nullish or empty values then isNullishOrEmpty is true", () => {
    expect(isNullishOrEmpty(null)).toBe(true);
    expect(isNullishOrEmpty(undefined)).toBe(true);
    expect(isNullishOrEmpty("")).toBe(true);
    expect(isNullishOrEmpty([])).toBe(true);
  });

  it("given non-empty values then isNullishOrEmpty is false", () => {
    expect(isNullishOrEmpty("a")).toBe(false);
    expect(isNullishOrEmpty([1])).toBe(false);
    expect(isNullishOrEmpty(0)).toBe(false);
    expect(isNullishOrEmpty(false)).toBe(false);
  });

  it("exposes the Node inspect symbol", () => {
    expect(NodeUtilInspectSymbol).toBe(Symbol.for("nodejs.util.inspect.custom"));
  });

  it("lists the 35 HTTP methods including QUERY and M-SEARCH without duplicates", () => {
    expect(MethodNames).toHaveLength(35);
    expect(new Set(MethodNames).size).toBe(35);
    expect(MethodNames).toContain("QUERY");
    expect(MethodNames).toContain("M-SEARCH");
    expect(MethodNames).toContain("GET");
  });
});

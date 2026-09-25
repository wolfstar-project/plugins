import type { Structure } from "../structures/Structure.js";

/**
 * The raw API data a {@link Structure} wraps.
 */
export type RawAPIType<Value extends Structure<object>> =
  Value extends Structure<infer Type> ? Type : never;

/**
 * A function building a {@link Structure} out of its raw API data.
 */
export type StructureCreator<
  Value extends Structure<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> = (data: Raw) => Value;

import type { EvlogInlineOptions } from "./evlog-plugin.js";
import type { EvlogModuleOptions } from "./module.js";

// Compile-time only, not part of any entrypoint. The Stars module declares its `evlog` options
// without evlog's types (see `EvlogModuleOptions`); this fails the typecheck if they stop being
// accepted by the evlog plugin they are handed to.
type Assert<T extends true> = T;

export type ModuleOptionsAreAcceptedByTheEvlogPlugin = Assert<
  Omit<EvlogModuleOptions, "drain"> extends EvlogInlineOptions ? true : false
>;

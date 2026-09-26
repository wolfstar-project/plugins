/**
 * `@wolfstar/plugin-sharder` has no `Plugin` lifecycle hooks to register today — this entrypoint
 * only re-exercises `./index.js`'s side effects (currently none) so the subpath resolves.
 *
 * `@wolfstar/cli`'s Stars build transform injects `import "<name>/register"` for every
 * `@wolfstar/plugin-*` dependency unconditionally, regardless of whether the package actually
 * needs one; without this subpath, consuming projects crash at runtime with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
import "./index.js";

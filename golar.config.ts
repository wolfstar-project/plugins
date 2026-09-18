import { defineConfig } from "golar/unstable";

export default defineConfig({
  typecheck: {
    // Mirrors the file scope the previous `tsc --noEmit` scripts checked:
    // package sources only (per each package's tsconfig.json, which only
    // `include`s "src"). Vitest test files under `tests/` are
    // intentionally excluded — they were never part of the tsc
    // typecheck scope and rely on vitest's runtime globals rather than
    // ambient type declarations.
    //
    // plugin-i18next's type-level consumption test (previously checked
    // via `tsc --noEmit -p tsconfig.consumption.json`) is NOT included
    // here: golar's glob-based `typecheck` mode does not read
    // tsconfig.json at all (no `project`/`types` option exists in this
    // version's Config type), so it can't resolve that project's
    // `node:url` import the way a real tsconfig-aware compiler does.
    // It is instead checked separately via `golar tsc`, which forwards
    // to a real (golar-bundled) TypeScript CLI and does honor
    // tsconfig.consumption.json - see the root "typecheck" script.
    include: ["packages/*/src/**/*.ts"],
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});

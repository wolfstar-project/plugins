import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Workspace packages consumed by other packages' tests resolve to their sources, so the tests never depend on a
  // previous build (CI runs vitest right after install) and always exercise the code under review.
  resolve: {
    alias: [
      {
        find: /^@wolfstar\/plugin-cache$/,
        replacement: fileURLToPath(new URL("packages/plugin-cache/src/index.ts", import.meta.url)),
      },
    ],
  },
  // plugin-subcommands-advanced's tests use legacy decorators transformed here.
  // Vite 8 defaults to oxc, which ignores this esbuild option in favor of
  // oxc.typescript.decorators — migrate to that before upgrading past Vite 7.
  esbuild: {
    target: "es2022",
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
      },
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "clover"],
      include: ["packages/*/src/**/*.ts"],
    },
  },
});

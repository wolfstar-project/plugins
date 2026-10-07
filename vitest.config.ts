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
      {
        find: /^@wolfstar\/plugin-gateway$/,
        replacement: fileURLToPath(
          new URL("packages/plugin-gateway/src/index.ts", import.meta.url),
        ),
      },
    ],
  },
  // The tests of plugin-subcommands-advanced, plugin-broker and plugin-gateway use legacy decorators,
  // transformed here. Vite 8 transforms with oxc, which ignores the old esbuild.tsconfigRaw option.
  oxc: {
    target: "es2022",
    decorator: { legacy: true },
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

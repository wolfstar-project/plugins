import { defineConfig } from "vitest/config";

export default defineConfig({
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

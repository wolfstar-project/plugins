import { defineConfig } from "vitest/config";

export default defineConfig({
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

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/register.ts"],
  format: "esm",
  target: "es2022",
  dts: true,
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  outDir: "dist",
});

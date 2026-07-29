import { build } from "tsdown";

await build({
  entry: ["src/index.ts", "src/register.ts"],
  format: "esm",
  target: "es2022",
  // Avoid bundling broken transitive `.d.mts` from `@sapphire/utilities` via http-framework.
  dts: { resolve: false },
  clean: true,
  sourcemap: true,
  fixedExtension: false,
  outDir: "dist",
  config: false,
});

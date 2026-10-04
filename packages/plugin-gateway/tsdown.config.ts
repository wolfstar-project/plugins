import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./register", "./module"],
    entry: ["src/index.ts", "src/register.ts", "src/module.ts"],
  }),
);

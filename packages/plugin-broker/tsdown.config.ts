import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./register", "./plugin", "./module"],
    entry: ["src/index.ts", "src/register.ts", "src/plugin.ts", "src/module.ts"],
  }),
);

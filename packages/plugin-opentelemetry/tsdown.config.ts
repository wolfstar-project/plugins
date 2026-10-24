import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./preload", "./plugin", "./module", "./register"],
    entry: ["src/index.ts", "src/preload.ts", "src/plugin.ts", "src/module.ts", "src/register.ts"],
  }),
);

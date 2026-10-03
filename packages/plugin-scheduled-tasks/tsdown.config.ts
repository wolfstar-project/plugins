import VersionInjector from "@redstardev/unplugin-version-injector/rolldown";
import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./plugin", "./register"],
    entry: ["src/index.ts", "src/plugin.ts", "src/register.ts"],
    plugins: [VersionInjector()],
  }),
);

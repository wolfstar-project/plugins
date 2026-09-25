import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./rest", "./ws"],
    entry: ["src/index.ts", "src/exports/rest.ts", "src/exports/ws.ts"],
  }),
);

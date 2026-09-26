import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./register", "./rest", "./ws"],
    entry: ["src/index.ts", "src/register.ts", "src/rest.ts", "src/ws.ts"],
  }),
);

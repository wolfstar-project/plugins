import { defineConfig } from "tsdown";
import { createTsdownOptions } from "../../scripts/tsdown.config";

export default defineConfig(
  createTsdownOptions({
    attwEntrypoints: [".", "./register", "./consola", "./evlog", "./winston"],
    entry: ["src/index.ts", "src/register.ts", "src/consola.ts", "src/evlog.ts", "src/winston.ts"],
  }),
);

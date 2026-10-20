import { defineModule } from "@wolfstar/kit";

/**
 * The options of the module: none yet. The `sharder` key of `stars.config` is reserved for them.
 */
export type SharderModuleOptions = Record<string, never>;

/**
 * The Stars module: listing `@wolfstar/plugin-sharder/module` in `modules` in `stars.config` adds the package to the
 * auto imports. Shards are still started by constructing a `ShardManager` yourself.
 *
 * @remarks
 * The module owns the `sharder` key of `stars.config`, which takes no options for now.
 */
export default defineModule<SharderModuleOptions>({
  meta: { name: "@wolfstar/plugin-sharder", configKey: "sharder" },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-sharder");
  },
});

declare module "@wolfstar/schema" {
  interface StarsConfig {
    sharder?: SharderModuleOptions;
  }
}

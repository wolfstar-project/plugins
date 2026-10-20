import { defineModule } from "@wolfstar/kit";

/**
 * The options of the module: none yet. The `cache` key of `stars.config` is reserved for them.
 */
export type CacheModuleOptions = Record<string, never>;

/**
 * The Stars module: listing `@wolfstar/plugin-cache/module` in `modules` in `stars.config` adds the package to the
 * auto imports. The cache itself is constructed by `@wolfstar/plugin-gateway`.
 *
 * @remarks
 * The module owns the `cache` key of `stars.config`, which takes no options for now.
 */
export default defineModule<CacheModuleOptions>({
  meta: { name: "@wolfstar/plugin-cache", configKey: "cache" },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-cache");
  },
});

declare module "@wolfstar/schema" {
  interface StarsConfig {
    cache?: CacheModuleOptions;
  }
}

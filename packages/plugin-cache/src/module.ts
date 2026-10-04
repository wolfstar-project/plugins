import { defineModule } from "@wolfstar/kit";

/**
 * The Stars module: listing `@wolfstar/plugin-cache/module` in `modules` in `stars.config` adds the package to the
 * auto imports. The cache itself is constructed by `@wolfstar/plugin-gateway`.
 */
export default defineModule({
  meta: { name: "@wolfstar/plugin-cache" },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-cache");
  },
});

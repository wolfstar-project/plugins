import { defineModule } from "@wolfstar/kit";

/**
 * The Stars module: listing `@wolfstar/plugin-gateway/module` in `modules` in `stars.config` adds the package to the
 * auto imports. The `GatewayClient` is still constructed by you.
 */
export default defineModule({
  meta: { name: "@wolfstar/plugin-gateway", compatibility: { framework: ">=6.1.0" } },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-gateway");
  },
});

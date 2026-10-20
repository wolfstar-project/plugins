import { defineModule } from "@wolfstar/kit";

/**
 * The options of the module: none yet. The `gateway` key of `stars.config` is reserved for them.
 */
export type GatewayModuleOptions = Record<string, never>;

/**
 * The Stars module: listing `@wolfstar/plugin-gateway/module` in `modules` in `stars.config` adds the package to the
 * auto imports. The `GatewayClient` is still constructed by you.
 *
 * @remarks
 * The module owns the `gateway` key of `stars.config`, which takes no options for now.
 */
export default defineModule<GatewayModuleOptions>({
  meta: {
    name: "@wolfstar/plugin-gateway",
    configKey: "gateway",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-gateway");
  },
});

declare module "@wolfstar/schema" {
  interface StarsConfig {
    gateway?: GatewayModuleOptions;
  }
}

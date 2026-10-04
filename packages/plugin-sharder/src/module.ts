import { defineModule } from "@wolfstar/kit";

/**
 * The Stars module: listing `@wolfstar/plugin-sharder/module` in `modules` in `stars.config` adds the package to the
 * auto imports. Shards are still started by constructing a `ShardManager` yourself.
 */
export default defineModule({
  meta: { name: "@wolfstar/plugin-sharder" },
  setup(_options, ctx) {
    ctx.addImports("@wolfstar/plugin-sharder");
  },
});

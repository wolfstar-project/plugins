import { relative, resolve as resolveDir } from "node:path";
import type { TsdownPluginOption, UserConfig } from "tsdown";

export type FormatConfig =
  Exclude<NonNullable<UserConfig["format"]>, string | string[]> extends Record<string, infer V>
    ? NonNullable<V>
    : never;

function toPluginArray(plugins?: TsdownPluginOption): TsdownPluginOption[] {
  if (plugins == null || plugins === false) {
    return [];
  }

  return (Array.isArray(plugins) ? plugins : [plugins]).filter(
    (plugin): plugin is Exclude<TsdownPluginOption, false | undefined | null | void> =>
      plugin != null && plugin !== false,
  );
}

export interface FormatConfigCJS extends FormatConfig {
  disabled?: boolean;
}

type LegacyFormatPlugins = { plugins?: UserConfig["plugins"] };

function splitFormatOptions<T extends object>(options?: T) {
  if (!options) {
    return {
      formatOptions: undefined as T | undefined,
      plugins: undefined as UserConfig["plugins"] | undefined,
    };
  }

  const { plugins, ...formatOptions } = options as T & LegacyFormatPlugins;
  return { formatOptions: formatOptions as T, plugins };
}

const esmOutExtensions = () => ({ js: ".js", dts: ".d.ts" });
const cjsOutExtensions = () => ({ js: ".cjs", dts: ".d.cts" });

const attwOptions = {
  entrypoints: ["."],
  enabled: true,
  level: "error",
  profile: "node16",
} satisfies NonNullable<Extract<UserConfig["attw"], object>>;

const baseOptions: UserConfig = {
  clean: true,
  // Do not bundle transitive package `.d.ts` graphs (e.g. broken `@sapphire/utilities` exports).
  dts: { resolve: false },
  entry: ["src/index.ts"],
  minify: false,
  deps: {
    neverBundle: true,
    onlyBundle: false,
  },
  sourcemap: true,
  target: "es2022",
  treeshake: true,
  attw: attwOptions,
  tsconfig: relative(
    import.meta.dirname,
    resolveDir(import.meta.dirname, "../tsconfig.build.json"),
  ),
  publint: {
    enabled: true,
    level: "error",
  },
};

/**
 * Shared tsdown options for publishable packages in this monorepo.
 * Mirrors `wolfstar-project/stars-components/scripts/tsdown.config.ts`.
 */
export function createTsdownOptions(options?: EnhancedTsdownOptions): UserConfig {
  const { cjsOptions, esmOptions, entry, target, plugins } = options ?? {};
  const { formatOptions: cjsFormatOptions, plugins: cjsPlugins } = splitFormatOptions(cjsOptions);
  const { formatOptions: esmFormatOptions, plugins: esmPlugins } = splitFormatOptions(esmOptions);
  const { disabled: cjsDisabled = true, ...cjsRest } = cjsFormatOptions ?? { disabled: true };
  const mergedPlugins = [
    ...toPluginArray(plugins),
    ...toPluginArray(cjsPlugins),
    ...toPluginArray(esmPlugins),
  ];

  const esmFormat = {
    outDir: "dist/esm",
    outExtensions: esmOutExtensions,
    ...esmFormatOptions,
  };

  return {
    ...baseOptions,
    attw: {
      ...attwOptions,
      profile: cjsDisabled ? "esm-only" : "node16",
    },
    entry: entry ?? baseOptions.entry,
    ...(target ? { target } : {}),
    ...(mergedPlugins.length > 0 ? { plugins: mergedPlugins } : {}),
    format: cjsDisabled
      ? { esm: esmFormat }
      : {
          esm: esmFormat,
          cjs: {
            outDir: "dist/cjs",
            outExtensions: cjsOutExtensions,
            ...cjsRest,
          },
        },
  } satisfies UserConfig;
}

export interface EnhancedTsdownOptions {
  cjsOptions?: FormatConfigCJS;
  esmOptions?: FormatConfig;
  entry?: UserConfig["entry"];
  plugins?: UserConfig["plugins"];
  target?: UserConfig["target"];
}

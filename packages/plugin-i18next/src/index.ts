import type { InternationalizationHandler } from "./lib/InternationalizationHandler";
import type { InternationalizationOptions } from "./lib/types";

export {
  default as i18next,
  type InitOptions,
  type TFunction,
  type TOptions,
  type TOptionsBase,
} from "i18next";
export * from "./lib/functions";
export * from "./lib/InternationalizationHandler";
export type * from "./lib/types";

declare module "@sapphire/pieces" {
  interface Container {
    /**
     * The internationalization handler registered by `@wolfstar/plugin-i18next`.
     */
    i18n: InternationalizationHandler;
  }
}

declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    /**
     * Options for the i18next-powered internationalization layer registered by
     * `@wolfstar/plugin-i18next`.
     */
    i18n?: InternationalizationOptions;
  }
}

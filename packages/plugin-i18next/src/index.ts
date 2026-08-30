import type { DefaultNamespace, Namespace } from "i18next";
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

declare module "i18next" {
  /**
   * The metadata `i18next.getFixedT` assigns to the functions it returns, which
   * `@wolfstar/http-framework-i18n` used to declare and i18next itself does not type.
   *
   * @remarks
   * Only a fixed function carries it, so it is populated on anything returned by
   * {@link InternationalizationHandler.getT} and the helpers built on top of it, but not on the
   * bare `i18next.t`.
   */
  interface TFunction<Ns extends Namespace = DefaultNamespace, KPrefix = undefined> {
    /**
     * The language the function is fixed to.
     */
    lng: string;

    /**
     * The languages the function is fixed to, set instead of {@link TFunction.lng} when several
     * were passed to `getFixedT`.
     */
    lngs?: readonly string[];

    /**
     * The namespace the function is fixed to, if any.
     */
    ns?: Ns;

    /**
     * The key prefix the function is fixed to, if any.
     */
    keyPrefix?: KPrefix;
  }
}

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

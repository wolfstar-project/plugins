import type { Awaitable, NonNullObject } from "@sapphire/utilities";
import type { Backend } from "@wolfstar/i18next-backend";
import type { ChokidarOptions } from "chokidar";
import type {
  APIInteraction,
  APIPingInteraction,
  LocaleString,
  LocalizationMap,
} from "discord-api-types/v10";
import type { InitOptions } from "i18next";

/**
 * This is a re-exported type from i18next.
 *
 * We could use the `NoInfer` TypeScript built-in utility, however this package still supports
 * TypeScript < 5.4.
 *
 * @see https://github.com/millsp/ts-toolbelt/blob/master/sources/Function/NoInfer.ts
 */
export type $NoInfer<A> = [A][A extends any ? 0 : never];

/**
 * This is a re-exported type from i18next. It is essentially an object of key-value pairs, where
 * the key is a string and the value is any.
 */
export interface $Dictionary {
  [key: string]: any;
}

/**
 * This is a re-exported type from i18next. It is the returned type from `resolveKey` when
 * `returnObjects` is `true` in the options.
 */
export type $SpecialObject = $Dictionary | Array<string | $Dictionary>;

/**
 * A translation key typed with the value it resolves to, created through {@link T}.
 */
export type TypedT<TCustom = string> = string & { __type__: TCustom };

/**
 * A translation key typed with both the interpolation arguments it takes and the value it resolves
 * to, created through {@link FT}.
 */
export type TypedFT<TArgs extends NonNullObject = NonNullObject, TReturn = string> = string & {
  __args__: TArgs;
  __return__: TReturn;
};

export interface Value<T = string> {
  value: T;
}

export interface Values<T = string> {
  values: readonly T[];
  count: number;
}

export interface Difference<T = string> {
  previous: T;
  next: T;
}

/**
 * A `commands/<file>:<key>` shaped key, used as the root key overload of {@link applyLocalizedBuilder}.
 */
export type LocalePrefixKey = `commands/${string}:${string}`;

/**
 * The subset of an interaction payload the localization helpers need in order to resolve a language.
 *
 * @remarks
 * `@wolfstar/http-framework` receives raw Discord interaction payloads over HTTP, so the helpers
 * operate on `discord-api-types` structures rather than on `discord.js` class instances.
 */
export type Interaction = Pick<
  Exclude<APIInteraction, APIPingInteraction>,
  "locale" | "guild_locale" | "guild_id"
> &
  Partial<Pick<Exclude<APIInteraction, APIPingInteraction>, "channel_id" | "user" | "member">>;

/**
 * Any value the localization helpers accept as the source of a language.
 */
export type Target = Interaction;

/**
 * Configure whether to use Hot-Module-Replacement (HMR) for your i18next resources using these
 * options. The minimum config to enable HMR is to set `enabled` to true. Any other properties are
 * optional.
 */
export interface HMROptions {
  /**
   * HMR status for the i18next plugin.
   * @default false
   */
  enabled: boolean;

  /**
   * Languages that will be reloaded when updating the languages directory.
   * @default All languages that are automatically resolved from your folder setup
   */
  languages?: string | string[];

  /**
   * Namespaces that will be reloaded when updating the languages directory.
   * @default All namespaces that are automatically resolved from your languages folder setup
   */
  namespaces?: string | string[];

  /**
   * The options passed to `chokidar`'s `watch`.
   */
  options?: ChokidarOptions;
}

/**
 * Used to dynamically add options based on the languages found in {@link InternationalizationHandler.init}.
 */
export type DynamicOptions<T extends InitOptions> = (
  namespaces: string[],
  languages: string[],
) => T;

/**
 * The options used in {@link InternationalizationHandler}.
 */
export interface InternationalizationOptions {
  /**
   * Used as the default 2nd to last fallback locale if no other is found. It's only followed by
   * `'en-US'`.
   */
  defaultName?: string;

  /**
   * The options passed to `backend` in `i18next.init`.
   */
  backend?: Backend.Options;

  /**
   * The options passed to `i18next.init`.
   */
  i18next?: InitOptions | DynamicOptions<InitOptions>;

  /**
   * The directory in which `@wolfstar/i18next-backend` should search for files.
   * @default `rootDirectory/languages`
   */
  defaultLanguageDirectory?: string;

  /**
   * The default value to be used if a specific language key isn't found. Defaults to
   * `'default:default'`.
   */
  defaultMissingKey?: string;

  /**
   * The default namespace that is prefixed to all keys that don't specify it. Defaults to
   * `'default'`.
   */
  defaultNS?: string;

  /**
   * Array of formatters to add to i18next.
   * @default []
   */
  formatters?: I18nextFormatter[];

  /**
   * Reload languages and namespaces when updating the languages directory.
   */
  hmr?: HMROptions;

  /**
   * A function that is to be used to retrieve the language for the current context.
   *
   * If this is not set, then the language will always be resolved from the interaction's locales.
   *
   * This will be inserted for {@link InternationalizationHandler.fetchLanguage}.
   * @default () => null
   */
  fetchLanguage?: (context: InternationalizationContext) => Awaitable<string | null>;
}

/**
 * Context for {@link InternationalizationHandler.fetchLanguage} functions. This context enables
 * implementation of per-guild, per-channel, and per-user localization.
 */
export interface InternationalizationContext {
  /** The ID of the guild the interaction was sent from, or `null` when sent from a DM. */
  guildId: string | null;
  /** The ID of the channel the interaction was sent from, or `null` when it was not provided. */
  channelId: string | null;
  /** The ID of the user that sent the interaction, or `null` when it was not provided. */
  userId: string | null;
  /** The locale the guild the interaction was sent from is configured with. */
  interactionGuildLocale?: LocaleString;
  /** The locale the user that sent the interaction is configured with. */
  interactionLocale?: LocaleString;
}

export interface InternationalizationClientOptions {
  i18n?: InternationalizationOptions;
}

/**
 * Represents a formatter that is added to i18next with `i18next.services.formatter.add` or
 * `i18next.services.formatter.addCached`, depending on the `cached` property.
 *
 * @see {@link https://www.i18next.com/translation-function/formatting#adding-custom-format-function}
 */
export type I18nextFormatter = I18nextNamedFormatter | I18nextNamedCachedFormatter;

/**
 * Represents a formatter that is added to i18next with `i18next.services.formatter.add`.
 *
 * @see {@link https://www.i18next.com/translation-function/formatting#adding-custom-format-function}
 */
export interface I18nextNamedFormatter {
  cached?: false;
  name: string;
  format(value: any, lng: string | undefined, options: any): string;
}

/**
 * Represents a cached formatter that is added to i18next with `i18next.services.formatter.addCached`.
 *
 * @see {@link https://www.i18next.com/translation-function/formatting#adding-custom-format-function}
 */
export interface I18nextNamedCachedFormatter {
  cached: true;
  name: string;
  format(lng: string | undefined, options: any): (value: any) => string;
}

export interface LocalizedData {
  value: string;
  localizations: LocalizationMap;
}

export interface BuilderWithName {
  setName(name: string): this;
  setNameLocalizations(localizedNames: LocalizationMap | null): this;
}

export interface BuilderWithDescription {
  setDescription(description: string): this;
  setDescriptionLocalizations(localizedDescriptions: LocalizationMap | null): this;
}

export type BuilderWithNameAndDescription = BuilderWithName & BuilderWithDescription;

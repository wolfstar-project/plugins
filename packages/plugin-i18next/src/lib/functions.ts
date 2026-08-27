import { Collection } from "@discordjs/collection";
import { container } from "@sapphire/pieces";
import { lazy, type NonNullObject } from "@sapphire/utilities";
import {
  Locale,
  type APIApplicationCommandOptionChoice,
  type LocaleString,
} from "discord-api-types/v10";
import type {
  AppendKeyPrefix,
  DefaultNamespace,
  InterpolationMap,
  Namespace,
  ParseKeys,
  TFunction,
  TFunctionReturn,
  TFunctionReturnOptionalDetails,
  TOptions,
  TOptionsBase,
} from "i18next";
import type {
  $Dictionary,
  $SpecialObject,
  BuilderWithDescription,
  BuilderWithName,
  BuilderWithNameAndDescription,
  Interaction,
  InternationalizationContext,
  LocalePrefixKey,
  LocalizedData,
  Target,
  TypedFT,
  TypedT,
} from "./types";

/**
 * Brands a translation key with the type it resolves to.
 * @param k The i18next key.
 * @example
 * ```typescript
 * export const InvalidInput = T('path/to/file:invalidInput');
 * ```
 */
export function T<TCustom = string>(k: string): TypedT<TCustom> {
  return k as TypedT<TCustom>;
}

/**
 * Brands a translation key with both its interpolation arguments and the type it resolves to.
 * @param k The i18next key.
 * @example
 * ```typescript
 * export const AddResult = FT<{ left: number; right: number; result: number }>('path/to/file:addResult');
 * ```
 */
export function FT<TArgs extends NonNullObject = NonNullObject, TReturn = string>(
  k: string,
): TypedFT<TArgs, TReturn> {
  return k as TypedFT<TArgs, TReturn>;
}

/**
 * Every locale Discord supports.
 */
export const supportedLanguages = new Set(Object.values(Locale)) as ReadonlySet<LocaleString>;

/**
 * Checks whether the given language is a locale Discord supports.
 * @param language The language to check.
 */
export function isSupportedDiscordLocale(language: string): language is LocaleString {
  return supportedLanguages.has(language as LocaleString);
}

/**
 * Resolves the loaded language that best matches the user's locale, falling back to the guild's and
 * then to `'en-US'`.
 * @param interaction The interaction to read the locales from.
 */
export function getSupportedUserLanguageName(interaction: Interaction): LocaleString {
  const { languages } = container.i18n;
  if (languages.has(interaction.locale)) return interaction.locale;
  if (interaction.guild_locale && languages.has(interaction.guild_locale)) {
    return interaction.guild_locale;
  }
  return "en-US";
}

/**
 * Resolves the `TFunction` for {@link getSupportedUserLanguageName}.
 * @param interaction The interaction to read the locales from.
 */
export function getSupportedUserLanguageT(interaction: Interaction): TFunction {
  return container.i18n.getT(getSupportedUserLanguageName(interaction));
}

/**
 * Resolves the loaded language that best matches the guild's locale, falling back to the user's one
 * when the interaction was not sent from a guild, and then to `'en-US'`.
 * @param interaction The interaction to read the locales from.
 */
export function getSupportedLanguageName(interaction: Interaction): LocaleString {
  const { languages } = container.i18n;
  if (interaction.guild_id) {
    if (interaction.guild_locale && languages.has(interaction.guild_locale)) {
      return interaction.guild_locale;
    }
  } else if (languages.has(interaction.locale)) {
    return interaction.locale;
  }
  return "en-US";
}

/**
 * Resolves the `TFunction` for {@link getSupportedLanguageName}.
 * @param interaction The interaction to read the locales from.
 */
export function getSupportedLanguageT(interaction: Interaction): TFunction {
  return container.i18n.getT(getSupportedLanguageName(interaction));
}

/**
 * Builds the {@link InternationalizationContext} for an interaction.
 * @internal
 */
function getContext(interaction: Interaction): InternationalizationContext {
  return {
    guildId: interaction.guild_id ?? null,
    channelId: interaction.channel_id ?? null,
    userId: interaction.user?.id ?? interaction.member?.user.id ?? null,
    interactionGuildLocale: interaction.guild_locale,
    interactionLocale: interaction.locale,
  };
}

/**
 * Retrieves the language name for a target, using {@link InternationalizationHandler.fetchLanguage}.
 *
 * If that hook is not defined or returns a nullish value, there will be a series of fallback
 * attempts in the following descending order:
 * 1. The result of {@link getSupportedLanguageName}, if it is a loaded language.
 * 2. {@link InternationalizationOptions.defaultName}.
 * 3. `'en-US'`.
 * @param target The target to fetch the language from.
 */
export async function fetchLanguage(target: Target): Promise<string> {
  const language = await container.i18n.fetchLanguage(getContext(target));
  return (
    language ?? getSupportedLanguageName(target) ?? container.i18n.options.defaultName ?? "en-US"
  );
}

/**
 * Retrieves the language-assigned function from i18next designated to a target's preferred language.
 * @param target The target to fetch the language from.
 */
export async function fetchT(target: Target): Promise<TFunction> {
  return container.i18n.getT(await fetchLanguage(target));
}

/**
 * Resolves a key and its parameters using {@link fetchLanguage}, meaning a custom
 * {@link InternationalizationHandler.fetchLanguage} hook (for example, a per-guild database lookup)
 * is honoured.
 *
 * @remarks
 * Use {@link resolveKey} when the language can be resolved from the interaction payload alone, it
 * is synchronous and does not hit the hook.
 * @param target The target to fetch the language key from.
 */
export async function fetchKey<
  const Key extends ParseKeys<Ns, TOpt, undefined>,
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
    TOpt["returnObjects"] extends true ? $SpecialObject : string,
  const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt & InterpolationMap<Ret>,
>(
  target: Target,
  ...[key, defaultValueOrOptions, optionsOrUndefined]:
    | [key: Key | Key[], options?: ActualOptions]
    | [key: string | string[], options: TOpt & $Dictionary & { defaultValue: string }]
    | [key: string | string[], defaultValue: string, options?: TOpt & $Dictionary]
): Promise<TFunctionReturnOptionalDetails<Ret, TOpt>> {
  const parsedOptions =
    typeof defaultValueOrOptions === "string" ? optionsOrUndefined : defaultValueOrOptions;
  const language =
    typeof parsedOptions?.lng === "string" ? parsedOptions.lng : await fetchLanguage(target);

  if (typeof defaultValueOrOptions === "string") {
    return container.i18n.format<Key, TOpt, Ns, Ret>(
      language,
      key,
      defaultValueOrOptions,
      optionsOrUndefined,
    );
  }

  return container.i18n.format<Key, TOpt, Ns, Ret>(language, key, undefined, defaultValueOrOptions);
}

/**
 * Resolves a key with the user's language, as resolved by {@link getSupportedUserLanguageName}.
 */
export function resolveUserKey<TReturn>(
  interaction: Interaction,
  key: TypedT<TReturn>,
  options?: TOptionsBase | string,
): TReturn;
export function resolveUserKey<TReturn>(
  interaction: Interaction,
  key: TypedT<TReturn>,
  defaultValue: TReturn,
  options?: TOptionsBase | string,
): TReturn;
export function resolveUserKey<TArgs extends NonNullObject, TReturn>(
  interaction: Interaction,
  key: TypedFT<TArgs, TReturn>,
  options?: TOptions<TArgs>,
): TReturn;
export function resolveUserKey<TArgs extends NonNullObject, TReturn>(
  interaction: Interaction,
  key: TypedFT<TArgs, TReturn>,
  defaultValue: TReturn,
  options?: TOptions<TArgs>,
): TReturn;
export function resolveUserKey(
  interaction: Interaction,
  key: string | string[],
  ...args: [any?, any?]
): string;
export function resolveUserKey(interaction: Interaction, ...args: [any, any?, any?]) {
  return (getSupportedUserLanguageT(interaction) as (...args: any[]) => unknown)(...args);
}

/**
 * Resolves a key with the guild's language, as resolved by {@link getSupportedLanguageName}.
 */
export function resolveKey<TReturn>(
  interaction: Interaction,
  key: TypedT<TReturn>,
  options?: TOptionsBase | string,
): TReturn;
export function resolveKey<TReturn>(
  interaction: Interaction,
  key: TypedT<TReturn>,
  defaultValue: TReturn,
  options?: TOptionsBase | string,
): TReturn;
export function resolveKey<TArgs extends NonNullObject, TReturn>(
  interaction: Interaction,
  key: TypedFT<TArgs, TReturn>,
  options?: TOptions<TArgs>,
): TReturn;
export function resolveKey<TArgs extends NonNullObject, TReturn>(
  interaction: Interaction,
  key: TypedFT<TArgs, TReturn>,
  defaultValue: TReturn,
  options?: TOptions<TArgs>,
): TReturn;
export function resolveKey(
  interaction: Interaction,
  key: string | string[],
  ...args: [any?, any?]
): string;
export function resolveKey(interaction: Interaction, ...args: [any, any?, any?]) {
  return (getSupportedLanguageT(interaction) as (...args: any[]) => unknown)(...args);
}

const getLocales = lazy(() => {
  const locales = new Collection<LocaleString, TFunction>();

  for (const [locale, t] of container.i18n.languages) {
    if (!isSupportedDiscordLocale(locale)) {
      process.emitWarning("Unsupported Discord locale", {
        code: "UNSUPPORTED_LOCALE",
        detail: `'${locale}' is not assignable to type LocaleString`,
      });
      continue;
    }

    locales.set(locale, t);
  }

  return locales;
});

const getDefaultT = lazy(() => {
  const defaultLocale = container.i18n.options.defaultName ?? "en-US";

  if (!isSupportedDiscordLocale(defaultLocale)) {
    throw new TypeError(
      `Unsupported Discord locale found:\n'${defaultLocale}' is not within the list of ${[...supportedLanguages]}`,
    );
  }

  const defaultT = getLocales().get(defaultLocale);
  if (defaultT) return defaultT;
  throw new TypeError(`Could not find ${defaultLocale}`);
});

/**
 * Gets the value and the localizations from a language key.
 * @param key The key to get the localizations from.
 * @returns The retrieved data.
 * @remarks This should be called **strictly** after loading the locales.
 */
export function getLocalizedData<
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
>(key: ParseKeys<Ns, TOpt, KPrefix> | TypedT): LocalizedData {
  const locales = getLocales();
  const defaultT = getDefaultT();

  return {
    value: defaultT(key as never),
    localizations: Object.fromEntries(locales.map((t, locale) => [locale, t(key as never)])),
  };
}

/**
 * Applies the localized names on the builder, calling `setName` and `setNameLocalizations`.
 * @param builder The builder to apply the localizations to.
 * @param key The key to get the localizations from.
 * @returns The updated builder.
 */
export function applyNameLocalizedBuilder<
  T extends BuilderWithName,
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
>(builder: T, key: ParseKeys<Ns, TOpt, KPrefix> | TypedT) {
  const result = getLocalizedData(key);
  return builder.setName(result.value).setNameLocalizations(result.localizations);
}

/**
 * Applies the localized descriptions on the builder, calling `setDescription` and
 * `setDescriptionLocalizations`.
 * @param builder The builder to apply the localizations to.
 * @param key The key to get the localizations from.
 * @returns The updated builder.
 */
export function applyDescriptionLocalizedBuilder<
  T extends BuilderWithDescription,
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
>(builder: T, key: ParseKeys<Ns, TOpt, KPrefix> | TypedT) {
  const result = getLocalizedData(key);
  return builder.setDescription(result.value).setDescriptionLocalizations(result.localizations);
}

/**
 * Applies the localized names and descriptions on the builder, calling
 * {@link applyNameLocalizedBuilder} and {@link applyDescriptionLocalizedBuilder}.
 *
 * @param builder The builder to apply the localizations to.
 * @param params The root key, or the key for the name and the key for the description.
 * @returns The updated builder. You can chain subsequent builder methods on this.
 *
 * @remarks
 * If only 2 parameters were passed, `name` will be defined as `${root}Name` and `description` as
 * `${root}Description`, being `root` the second parameter in the function, after `builder`.
 *
 * @example
 * ```typescript
 * // Both keys given explicitly:
 * applyLocalizedBuilder(builder, 'commands/names:userinfo', 'commands/descriptions:userinfo');
 * ```
 *
 * @example
 * ```typescript
 * // Root key only, resolves `commands/userinfo:nameName` and `commands/userinfo:nameDescription`:
 * applyLocalizedBuilder(builder, 'commands/userinfo:name');
 * ```
 */
export function applyLocalizedBuilder<
  T extends BuilderWithNameAndDescription,
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
>(
  builder: T,
  ...params:
    | [root: LocalePrefixKey]
    | [
        name: ParseKeys<Ns, TOpt, KPrefix> | TypedT,
        description: ParseKeys<Ns, TOpt, KPrefix> | TypedT,
      ]
): T {
  type LocalKeysType = ParseKeys<Ns, TOpt, KPrefix> | TypedT;

  const [localeName, localeDescription] =
    params.length === 1
      ? [`${params[0]}Name` as LocalKeysType, `${params[0]}Description` as LocalKeysType]
      : params;

  applyNameLocalizedBuilder(builder, localeName);
  applyDescriptionLocalizedBuilder(builder, localeDescription);

  return builder;
}

/**
 * Constructs an object that can be passed into `setChoices` for a String or Number option with
 * localized names.
 *
 * @param key The i18next key for the name of the choice.
 * @param options The remaining choice options. This should _at least_ include the `value` key.
 * @returns An object with anything provided through `options`, with `name` and `name_localizations`
 * added.
 */
export function createLocalizedChoice<
  ValueType = string | number,
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
>(
  key: ParseKeys<Ns, TOpt, KPrefix> | TypedT,
  options: Omit<APIApplicationCommandOptionChoice<ValueType>, "name" | "name_localizations">,
): APIApplicationCommandOptionChoice<ValueType> {
  const result = getLocalizedData(key);

  return {
    ...options,
    name: result.value,
    name_localizations: result.localizations,
  };
}

/**
 * Constructs a select menu option with a localized `name`, spreading any extra value on top.
 * @param key The i18next key for the name of the select option.
 * @param value The additional select option properties.
 */
export function createSelectMenuChoiceName<V extends NonNullObject>(
  key: TypedT,
  value?: V,
): createSelectMenuChoiceName.Result<V> {
  const result = getLocalizedData(key);
  return {
    ...value,
    name: result.value,
    name_localizations: result.localizations,
  } as createSelectMenuChoiceName.Result<V>;
}

export namespace createSelectMenuChoiceName {
  export type Result<V> = V & {
    name: string;
    name_localizations: import("discord-api-types/v10").LocalizationMap;
  };
}

import { Collection } from "@discordjs/collection";
import { container } from "@sapphire/pieces";
import type { NonNullObject } from "@sapphire/utilities";
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
} from "i18next";
import type {
  $Dictionary,
  $SpecialObject,
  BuilderWithDescription,
  BuilderWithName,
  BuilderWithNameAndDescription,
  InternationalizationContext,
  LocalePrefixKey,
  LocalizedData,
  Target,
} from "./types";

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
 * Resolves the fallback language to use when none of a target's locales is loaded.
 *
 * {@link InternationalizationOptions.defaultName} wins as long as it is both a Discord locale and a
 * loaded language; otherwise `'en-US'` is used.
 * @internal
 */
function getFallbackLanguageName(): LocaleString {
  const { languages, options } = container.i18n;
  const { defaultName } = options;

  return defaultName && isSupportedDiscordLocale(defaultName) && languages.has(defaultName)
    ? defaultName
    : "en-US";
}

/**
 * Narrows a locale to a loaded Discord locale, or `null` when it is neither.
 * @internal
 */
function getLoadedLocale(locale: string | undefined): LocaleString | null {
  if (!locale) return null;
  return isSupportedDiscordLocale(locale) && container.i18n.languages.has(locale) ? locale : null;
}

/**
 * Builds the {@link InternationalizationContext} for any supported target.
 *
 * @remarks
 * The members of {@link Target} are told apart structurally, since the framework receives raw
 * payloads rather than class instances: an interaction has `locale`, a message has `channel_id`, a
 * channel has `type`, and anything left is a guild.
 * @internal
 */
function resolveContext(target: Target): InternationalizationContext {
  if ("locale" in target) {
    return {
      guildId: target.guild_id ?? null,
      channelId: target.channel_id ?? null,
      userId: target.user?.id ?? target.member?.user.id ?? null,
      interactionGuildLocale: target.guild_locale,
      interactionLocale: target.locale,
      preferredLocale: target.guild_locale,
    };
  }

  if ("channel_id" in target) {
    return {
      guildId: target.guild_id ?? null,
      channelId: target.channel_id,
      userId: target.author?.id ?? null,
    };
  }

  if ("type" in target) {
    return {
      guildId: target.guild_id ?? null,
      channelId: target.id,
      userId: null,
    };
  }

  return {
    guildId: target.id,
    channelId: null,
    userId: null,
    preferredLocale: target.preferred_locale,
  };
}

/**
 * @internal
 */
function getSupportedLanguageNameFromContext(context: InternationalizationContext): LocaleString {
  // Guild-scoped: the guild's locale is what matters, and the user's is deliberately ignored.
  // Outside a guild there is no guild locale to prefer, so the user's one is used instead.
  const preferred = context.guildId
    ? getLoadedLocale(context.preferredLocale)
    : getLoadedLocale(context.interactionLocale);

  return preferred ?? getFallbackLanguageName();
}

/**
 * @internal
 */
function getSupportedUserLanguageNameFromContext(
  context: InternationalizationContext,
): LocaleString {
  return (
    getLoadedLocale(context.interactionLocale) ??
    getLoadedLocale(context.preferredLocale) ??
    getFallbackLanguageName()
  );
}

/**
 * Resolves the loaded language that best matches the user's locale, falling back to the guild's one,
 * then to {@link InternationalizationOptions.defaultName}, and finally to `'en-US'`.
 *
 * @remarks
 * Only an {@link Interaction} carries a user locale. For a {@link GuildTarget} this is equivalent to
 * {@link getSupportedLanguageName}, and a {@link ChannelTarget} or {@link MessageTarget} always
 * resolves to the fallback.
 * @param target The target to read the locales from.
 */
export function getSupportedUserLanguageName(target: Target): LocaleString {
  return getSupportedUserLanguageNameFromContext(resolveContext(target));
}

/**
 * Resolves the `TFunction` for {@link getSupportedUserLanguageName}.
 *
 * @remarks
 * Pass the key and its options straight after the target to resolve it in one call; the bound
 * function is only returned when no key is given. Keys of a namespace other than the default one
 * carry their `<namespace>:` prefix, or the namespace is passed through the `ns` option.
 * @param target The target to read the locales from.
 */
export function getSupportedUserLanguageT(target: Target): TFunction;
/**
 * Resolves a key with the user's language, as resolved by {@link getSupportedUserLanguageName}.
 * @param target The target to read the locales from.
 * @param key The key or keys to retrieve the content from.
 * @param options The interpolation options.
 */
export function getSupportedUserLanguageT<
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
): TFunctionReturnOptionalDetails<Ret, TOpt>;
export function getSupportedUserLanguageT(target: Target, ...args: [any?, any?, any?]) {
  const t = container.i18n.getT(getSupportedUserLanguageName(target));
  return args.length === 0 ? t : (t as (...rest: any[]) => unknown)(...args);
}

/**
 * Resolves the loaded language that best matches the guild's locale, falling back to the user's one
 * when the target does not belong to a guild, then to
 * {@link InternationalizationOptions.defaultName}, and finally to `'en-US'`.
 *
 * @remarks
 * The guild locale comes from `guild_locale` on an {@link Interaction} and from `preferred_locale`
 * on a {@link GuildTarget}. A {@link ChannelTarget} and a {@link MessageTarget} carry no locale, so
 * they resolve to the fallback unless a custom
 * {@link InternationalizationHandler.fetchLanguage} hook is used through {@link fetchLanguage}.
 * @param target The target to read the locales from.
 */
export function getSupportedLanguageName(target: Target): LocaleString {
  return getSupportedLanguageNameFromContext(resolveContext(target));
}

/**
 * Resolves the `TFunction` for {@link getSupportedLanguageName}.
 *
 * @remarks
 * Pass the key and its options straight after the target to resolve it in one call; the bound
 * function is only returned when no key is given. Keys of a namespace other than the default one
 * carry their `<namespace>:` prefix, or the namespace is passed through the `ns` option.
 * @param target The target to read the locales from.
 */
export function getSupportedLanguageT(target: Target): TFunction;
/**
 * Resolves a key with the guild's language, as resolved by {@link getSupportedLanguageName}.
 * @param target The target to read the locales from.
 * @param key The key or keys to retrieve the content from.
 * @param options The interpolation options.
 */
export function getSupportedLanguageT<
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
): TFunctionReturnOptionalDetails<Ret, TOpt>;
export function getSupportedLanguageT(target: Target, ...args: [any?, any?, any?]) {
  const t = container.i18n.getT(getSupportedLanguageName(target));
  return args.length === 0 ? t : (t as (...rest: any[]) => unknown)(...args);
}

/**
 * Retrieves the language name for a target, using {@link InternationalizationHandler.fetchLanguage}.
 *
 * If that hook is not defined or returns a nullish value, the language is resolved from the
 * locales the target carries through {@link getSupportedLanguageName}, which itself falls back to
 * {@link InternationalizationOptions.defaultName} and then to `'en-US'`.

 * @remarks
 * This is the only helper that can resolve a language for a {@link ChannelTarget} or a
 * {@link MessageTarget}, since those payloads carry no locale and the hook receives their
 * `guildId` and `channelId`.
 * @param target The target to fetch the language from.
 */
export async function fetchLanguage(target: Target): Promise<string> {
  const context = resolveContext(target);
  const language = await container.i18n.fetchLanguage(context);
  return language ?? getSupportedLanguageNameFromContext(context);
}

/**
 * Retrieves the language-assigned function from i18next designated to a target's preferred language.
 *
 * @remarks
 * Use {@link fetchKey} to resolve a key in a single call.
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
 * Use {@link getSupportedLanguageT} when the language can be resolved from the target payload
 * alone, it is synchronous and does not hit the hook.
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

let cachedLocales: Collection<LocaleString, TFunction> | null = null;
let cachedLocalesSize = -1;

/**
 * The loaded languages Discord supports, keyed by locale.
 *
 * @remarks
 * Memoized on the size of `container.i18n.languages` so that locales discovered by a hot reload
 * (see {@link InternationalizationHandler.reloadResources}) are picked up without a restart.
 * @internal
 */
function getLocales(): Collection<LocaleString, TFunction> {
  const { languages } = container.i18n;
  if (cachedLocales && cachedLocalesSize === languages.size) return cachedLocales;

  const locales = new Collection<LocaleString, TFunction>();

  for (const [locale, t] of languages) {
    if (!isSupportedDiscordLocale(locale)) {
      process.emitWarning("Unsupported Discord locale", {
        code: "UNSUPPORTED_LOCALE",
        detail: `'${locale}' is not assignable to type LocaleString`,
      });
      continue;
    }

    locales.set(locale, t);
  }

  cachedLocales = locales;
  cachedLocalesSize = languages.size;
  return locales;
}

/**
 * @internal
 */
function getDefaultT(): TFunction {
  const defaultLocale = container.i18n.options.defaultName ?? "en-US";

  if (!isSupportedDiscordLocale(defaultLocale)) {
    throw new TypeError(
      `Unsupported Discord locale found:\n'${defaultLocale}' is not within the list of ${[...supportedLanguages]}`,
    );
  }

  const defaultT = getLocales().get(defaultLocale);
  if (defaultT) return defaultT;
  throw new TypeError(`Could not find ${defaultLocale}`);
}

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
>(key: ParseKeys<Ns, TOpt, KPrefix>): LocalizedData {
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
>(builder: T, key: ParseKeys<Ns, TOpt, KPrefix>) {
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
>(builder: T, key: ParseKeys<Ns, TOpt, KPrefix>) {
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
    | [name: ParseKeys<Ns, TOpt, KPrefix>, description: ParseKeys<Ns, TOpt, KPrefix>]
): T {
  type LocalKeysType = ParseKeys<Ns, TOpt, KPrefix>;

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
  key: ParseKeys<Ns, TOpt, KPrefix>,
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
export function createSelectMenuChoiceName<
  V extends NonNullObject,
  const TOpt extends TOptions = TOptions,
  Ns extends Namespace = DefaultNamespace,
  KPrefix = undefined,
>(key: ParseKeys<Ns, TOpt, KPrefix>, value?: V): createSelectMenuChoiceName.Result<V> {
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

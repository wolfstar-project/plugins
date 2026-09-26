/**
 * Compatibility shims for the `@wolfstar/http-framework-i18n` helpers that were replaced by i18next's
 * native TypeScript support, so a migration only has to rename the module specifier. Everything here
 * is deprecated: see the README's "Migrating off `T` / `FT` / `resolve*`" section for the
 * replacements.
 */
import type { NonNullObject } from "@sapphire/utilities";
import type { TOptions, TOptionsBase } from "i18next";
import { getSupportedLanguageT, getSupportedUserLanguageT } from "./functions";
import type { Target } from "./types";

/**
 * A key branded with the type it resolves to.
 *
 * @deprecated Use the key itself, typed by the `CustomTypeOptions` augmentation
 * `@wolfstar/i18next-type-generator` emits, or `ParseKeys` from `i18next`.
 */
export type TypedT<TCustom = string> = string & { __type__: TCustom };

/**
 * A key branded with its interpolation arguments and the type it resolves to.
 *
 * @deprecated Use the key itself: its interpolation options are inferred from the locale files by
 * the `CustomTypeOptions` augmentation `@wolfstar/i18next-type-generator` emits.
 */
export type TypedFT<TArgs extends NonNullObject = NonNullObject, TReturn = string> = string & {
  __args__: TArgs;
  __return__: TReturn;
};

/**
 * Brands a key with the type it resolves to. It is returned unchanged at runtime.
 *
 * @deprecated Use the key itself, typed by the `CustomTypeOptions` augmentation
 * `@wolfstar/i18next-type-generator` emits.
 * @param key The key to brand.
 */
export function T<TCustom = string>(key: string): TypedT<TCustom> {
  return key as TypedT<TCustom>;
}

/**
 * Brands a key with its interpolation arguments and the type it resolves to. It is returned
 * unchanged at runtime.
 *
 * @deprecated Use the key itself: its interpolation options are inferred from the locale files by
 * the `CustomTypeOptions` augmentation `@wolfstar/i18next-type-generator` emits.
 * @param key The key to brand.
 */
export function FT<TArgs extends NonNullObject = NonNullObject, TReturn = string>(
  key: string,
): TypedFT<TArgs, TReturn> {
  return key as TypedFT<TArgs, TReturn>;
}

/**
 * Resolves a key with the guild's language, as resolved by `getSupportedLanguageName`.
 *
 * @deprecated Use {@link getSupportedLanguageT} with the key and its options instead.
 * @param target The target to read the locales from.
 * @param key The key to resolve.
 * @param options The i18next options.
 */
export function resolveKey<TReturn>(
  target: Target,
  key: TypedT<TReturn>,
  options?: TOptionsBase | string,
): TReturn;
/**
 * @deprecated Use {@link getSupportedLanguageT} with the key, `defaultValue` and options instead.
 */
export function resolveKey<TReturn>(
  target: Target,
  key: TypedT<TReturn>,
  defaultValue: TReturn,
  options?: TOptionsBase | string,
): TReturn;
/**
 * @deprecated Use {@link getSupportedLanguageT} with the key and its interpolation options instead.
 */
export function resolveKey<TArgs extends NonNullObject, TReturn>(
  target: Target,
  key: TypedFT<TArgs, TReturn>,
  options?: TOptions<TArgs>,
): TReturn;
/**
 * @deprecated Use {@link getSupportedLanguageT} with the key, `defaultValue` and interpolation
 * options instead.
 */
export function resolveKey<TArgs extends NonNullObject, TReturn>(
  target: Target,
  key: TypedFT<TArgs, TReturn>,
  defaultValue: TReturn,
  options?: TOptions<TArgs>,
): TReturn;
export function resolveKey(target: Target, ...args: [any, any?, any?]): unknown {
  return (getSupportedLanguageT(target) as (...rest: any[]) => unknown)(...args);
}

/**
 * Resolves a key with the user's language, as resolved by `getSupportedUserLanguageName`.
 *
 * @deprecated Use {@link getSupportedUserLanguageT} with the key and its options instead.
 * @param target The target to read the locales from.
 * @param key The key to resolve.
 * @param options The i18next options.
 */
export function resolveUserKey<TReturn>(
  target: Target,
  key: TypedT<TReturn>,
  options?: TOptionsBase | string,
): TReturn;
/**
 * @deprecated Use {@link getSupportedUserLanguageT} with the key, `defaultValue` and options
 * instead.
 */
export function resolveUserKey<TReturn>(
  target: Target,
  key: TypedT<TReturn>,
  defaultValue: TReturn,
  options?: TOptionsBase | string,
): TReturn;
/**
 * @deprecated Use {@link getSupportedUserLanguageT} with the key and its interpolation options
 * instead.
 */
export function resolveUserKey<TArgs extends NonNullObject, TReturn>(
  target: Target,
  key: TypedFT<TArgs, TReturn>,
  options?: TOptions<TArgs>,
): TReturn;
/**
 * @deprecated Use {@link getSupportedUserLanguageT} with the key, `defaultValue` and interpolation
 * options instead.
 */
export function resolveUserKey<TArgs extends NonNullObject, TReturn>(
  target: Target,
  key: TypedFT<TArgs, TReturn>,
  defaultValue: TReturn,
  options?: TOptions<TArgs>,
): TReturn;
export function resolveUserKey(target: Target, ...args: [any, any?, any?]): unknown {
  return (getSupportedUserLanguageT(target) as (...rest: any[]) => unknown)(...args);
}

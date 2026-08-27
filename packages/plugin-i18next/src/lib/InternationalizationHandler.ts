import { getRootData } from "@sapphire/pieces";
import { Result } from "@sapphire/result";
import { isFunction, type Awaitable } from "@sapphire/utilities";
import { Backend, type PathResolvable } from "@wolfstar/i18next-backend";
import i18next, {
  type AppendKeyPrefix,
  type DefaultNamespace,
  type InterpolationMap,
  type Namespace,
  type ParseKeys,
  type TFunction,
  type TFunctionProcessReturnValue,
  type TFunctionReturn,
  type TFunctionReturnOptionalDetails,
  type TOptions,
} from "i18next";
import type { PathLike } from "node:fs";
import { opendir } from "node:fs/promises";
import { join } from "node:path";
import type {
  $Dictionary,
  $NoInfer,
  $SpecialObject,
  InternationalizationContext,
  InternationalizationOptions,
} from "./types";

/**
 * A generalized class for handling `i18next` JSON files and their discovery.
 */
export class InternationalizationHandler {
  /**
   * Describes whether {@link InternationalizationHandler.init} has been run and languages are
   * loaded in {@link InternationalizationHandler.languages}.
   */
  public languagesLoaded = false;

  /**
   * A `Set` of initially loaded namespaces.
   */
  public namespaces = new Set<string>();

  /**
   * A `Map` of `i18next` language functions keyed by their language code.
   */
  public readonly languages = new Map<string, TFunction>();

  /**
   * The options {@link InternationalizationHandler} was initialized with.
   */
  public readonly options: InternationalizationOptions;

  /**
   * The directory passed to `@wolfstar/i18next-backend`. Also used in
   * {@link InternationalizationHandler.walkRootDirectory}.
   */
  public readonly languagesDirectory: string;

  /**
   * The backend options for `@wolfstar/i18next-backend` used by `i18next`.
   */
  protected readonly backendOptions: Backend.Options;

  /**
   * @param options The options that `i18next`, `@wolfstar/i18next-backend`, and
   * {@link InternationalizationHandler} should use.
   */
  public constructor(options?: InternationalizationOptions) {
    this.options = options ?? { i18next: { ignoreJSONStructure: false } };
    this.languagesDirectory =
      this.options.defaultLanguageDirectory ?? join(getRootData().root, "languages");

    const languagePaths = new Set<PathResolvable>([
      join(this.languagesDirectory, "{{lng}}", "{{ns}}.json"),
      ...(options?.backend?.paths ?? []),
    ]);

    this.backendOptions = {
      paths: [...languagePaths],
      ...this.options.backend,
    };

    if (isFunction(this.options.fetchLanguage)) {
      this.fetchLanguage = this.options.fetchLanguage;
    }
  }

  /**
   * The method to be overridden by the developer.
   *
   * @remarks
   * In the event that `fetchLanguage` is not defined or returns null / undefined, the interaction's
   * locales are used instead.
   * @returns A string for the desired language or null for no match.
   * @example
   * ```typescript
   * // Always use the same language (no per-guild configuration):
   * container.i18n.fetchLanguage = () => 'en-US';
   * ```
   * @example
   * ```typescript
   * // Retrieving the language from an ORM:
   * container.i18n.fetchLanguage = async (context) => {
   *   if (!context.guildId) return null;
   *   const guild = await driver.getRepository(GuildEntity).findOne({ id: context.guildId });
   *   return guild?.language ?? 'en-US';
   * };
   * ```
   */
  public fetchLanguage: (context: InternationalizationContext) => Awaitable<string | null> = () =>
    null;

  /**
   * Initializes the handler by loading in the namespaces, passing the data to i18next, and filling
   * in {@link InternationalizationHandler.languages}.
   */
  public async init() {
    const { namespaces, languages } = await this.walkRootDirectory(this.languagesDirectory);
    const userOptions = isFunction(this.options.i18next)
      ? this.options.i18next(namespaces, languages)
      : this.options.i18next;
    const ignoreJSONStructure = userOptions?.ignoreJSONStructure ?? false;
    const skipOnVariables = userOptions?.interpolation?.skipOnVariables ?? false;

    i18next.use(Backend);
    await i18next.init({
      backend: this.backendOptions,
      fallbackLng: this.options.defaultName ?? "en-US",
      initImmediate: false,
      interpolation: {
        escapeValue: false,
        ...userOptions?.interpolation,
        skipOnVariables,
      },
      load: "all",
      defaultNS: this.options.defaultNS ?? "default",
      ns: namespaces,
      preload: languages,
      ...userOptions,
      ignoreJSONStructure,
    });

    this.namespaces = new Set(namespaces);
    for (const item of languages) {
      this.languages.set(item, i18next.getFixedT(item));
    }
    this.languagesLoaded = true;

    const formatter = i18next.services.formatter!;
    for (const { name, format, cached } of this.options.formatters ?? []) {
      if (cached) formatter.addCached(name, format);
      else formatter.add(name, format);
    }
  }

  /**
   * Retrieve a raw `TFunction` from the passed locale.
   * @param locale The language to be used.
   */
  public getT(locale: string) {
    if (!this.languagesLoaded) {
      throw new Error(
        "Cannot call this method until InternationalizationHandler#init has been called",
      );
    }

    const t = this.languages.get(locale);
    if (t) return t;
    throw new ReferenceError(`Invalid language (${locale})`);
  }

  /**
   * Localizes a content given one or more keys and i18next options.
   * @param locale The language to be used.
   * @param key The key or keys to retrieve the content from.
   * @param options The interpolation options.
   * @see {@link https://www.i18next.com/overview/api#t}
   * @returns The localized content.
   */
  public format<
    const Key extends ParseKeys<Ns, TOpt, undefined>,
    const TOpt extends TOptions = TOptions,
    Ns extends Namespace = DefaultNamespace,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
      TOpt["returnObjects"] extends true ? $SpecialObject : string,
    const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt & InterpolationMap<Ret>,
  >(
    locale: string,
    key: Key | Key[],
    options?: ActualOptions,
  ): TFunctionReturnOptionalDetails<Ret, TOpt>;

  /**
   * Localizes a content given one or more keys and i18next options.
   * @param locale The language to be used.
   * @param key The key or keys to retrieve the content from.
   * @param options The interpolation options as well as a `defaultValue` for the key and any
   * key/value pairs.
   * @see {@link https://www.i18next.com/overview/api#t}
   * @returns The localized content.
   */
  public format<
    const Key extends ParseKeys<Ns, TOpt, undefined>,
    const TOpt extends TOptions = TOptions,
    Ns extends Namespace = DefaultNamespace,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
      TOpt["returnObjects"] extends true ? $SpecialObject : string,
  >(
    locale: string,
    key: string | string[],
    options: TOpt & $Dictionary & { defaultValue: string },
  ): TFunctionReturnOptionalDetails<Ret, TOpt>;

  /**
   * Localizes a content given one or more keys and i18next options.
   * @param locale The language to be used.
   * @param key The key or keys to retrieve the content from.
   * @param defaultValue The default value to use if the key is not found.
   * @param options The interpolation options.
   * @see {@link https://www.i18next.com/overview/api#t}
   * @returns The localized content.
   */
  public format<
    const Key extends ParseKeys<Ns, TOpt, undefined>,
    const TOpt extends TOptions = TOptions,
    Ns extends Namespace = DefaultNamespace,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
      TOpt["returnObjects"] extends true ? $SpecialObject : string,
  >(
    locale: string,
    key: string | string[],
    defaultValue: string | undefined,
    options?: TOpt & $Dictionary,
  ): TFunctionReturnOptionalDetails<Ret, TOpt>;

  /**
   * Localizes a content given one or more keys and i18next options.
   * @param locale The language to be used.
   *
   * @remarks
   * This function also has additional parameters for `key`, `defaultValue`, and `options`, however
   * TSDoc does not let us document those while matching the implementation signature. See the
   * overloads for this method for the documentation on those parameters.
   *
   * @see {@link https://www.i18next.com/overview/api#t}
   * @returns The localized content.
   */
  public format<
    const Key extends ParseKeys<Ns, TOpt, undefined>,
    const TOpt extends TOptions = TOptions,
    Ns extends Namespace = DefaultNamespace,
    Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
      TOpt["returnObjects"] extends true ? $SpecialObject : string,
    const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt & InterpolationMap<Ret>,
    DefaultValue extends string = never,
  >(
    locale: string,
    ...[key, defaultValueOrOptions, optionsOrUndefined]:
      | [key: Key | Key[], options?: ActualOptions]
      | [key: string | string[], options: TOpt & $Dictionary & { defaultValue: string }]
      | [
          key: string | string[],
          defaultValue: DefaultValue | undefined,
          options?: TOpt & $Dictionary,
        ]
  ): TFunctionReturnOptionalDetails<
    TFunctionProcessReturnValue<$NoInfer<Ret>, DefaultValue>,
    TOpt
  > {
    const language = this.getT(locale);

    // `defaultValueOrOptions` holds the default value only when it is a string; otherwise it holds
    // the options object and `optionsOrUndefined` is not provided.
    const hasDefaultValue = typeof defaultValueOrOptions === "string";
    const options = (hasDefaultValue ? optionsOrUndefined : defaultValueOrOptions) ?? {};
    const defaultValue = hasDefaultValue
      ? defaultValueOrOptions
      : this.options.defaultMissingKey
        ? language(this.options.defaultMissingKey, { replace: { key } })
        : "";

    return language(
      key as never,
      {
        defaultValue,
        ...(options as TOpt),
      } as never,
    ) as TFunctionReturnOptionalDetails<
      TFunctionProcessReturnValue<$NoInfer<Ret>, DefaultValue>,
      TOpt
    >;
  }

  /**
   * Walks the root languages directory, collecting every language and namespace found in it.
   * @param directory The directory that should be walked.
   */
  public async walkRootDirectory(directory: PathLike) {
    const languages = new Set<string>();
    const namespaces = new Set<string>();

    const dir = await opendir(directory);
    for await (const entry of dir) {
      // If the entry is not a directory, skip:
      if (!entry.isDirectory()) continue;

      // Load the directory:
      languages.add(entry.name);

      for await (const namespace of this.walkLocaleDirectory(join(dir.path, entry.name), "")) {
        namespaces.add(namespace);
      }
    }

    return { namespaces: [...namespaces], languages: [...languages] };
  }

  /**
   * Reloads the languages and namespaces registered in i18next, used by the HMR watcher registered
   * in `@wolfstar/plugin-i18next/register`.
   */
  public async reloadResources() {
    const result = await Result.fromAsync(async () => {
      let languages = this.options.hmr?.languages;
      let namespaces = this.options.hmr?.namespaces;
      if (!languages || !namespaces) {
        const languageDirectoryResult = await this.walkRootDirectory(this.languagesDirectory);
        languages ??= languageDirectoryResult.languages;
        namespaces ??= languageDirectoryResult.namespaces;
      }

      await i18next.reloadResources(languages, namespaces);
      console.info("[plugin-i18next] Reloaded language resources.");
    });

    result.inspectErr((error: unknown) =>
      console.error("[plugin-i18next] Failed to reload language resources.", error),
    );
  }

  /**
   * Walks a single locale directory, yielding every namespace found in it.
   *
   * @remarks
   * Skips any file that does not end with `.json`.
   * @param directory The directory that should be walked.
   * @param ns The current namespace.
   */
  private async *walkLocaleDirectory(directory: string, ns: string): AsyncGenerator<string> {
    const dir = await opendir(directory);
    for await (const entry of dir) {
      if (entry.isDirectory()) {
        yield* this.walkLocaleDirectory(join(dir.path, entry.name), `${ns}${entry.name}/`);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        yield `${ns}${entry.name.slice(0, -5)}`;
      }
    }
  }
}

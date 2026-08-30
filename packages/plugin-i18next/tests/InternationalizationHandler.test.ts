import { container } from "@sapphire/pieces";
import type { LocalizationMap } from "discord-api-types/v10";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  applyLocalizedBuilder,
  createLocalizedChoice,
  fetchLanguage,
  fetchT,
  getLocalizedData,
  getSupportedLanguageName,
  getSupportedLanguageT,
  getSupportedUserLanguageName,
  getSupportedUserLanguageT,
  InternationalizationHandler,
  isSupportedDiscordLocale,
  type BuilderWithNameAndDescription,
  type Interaction,
} from "../src/index";

const languagesDirectory = fileURLToPath(new URL("fixtures/languages", import.meta.url));

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    locale: "es-ES",
    guild_locale: "en-US",
    guild_id: "737141877803057244",
    ...overrides,
  } as Interaction;
}

class StubBuilder implements BuilderWithNameAndDescription {
  public name: string | null = null;
  public nameLocalizations: LocalizationMap | null = null;
  public description: string | null = null;
  public descriptionLocalizations: LocalizationMap | null = null;

  public setName(name: string) {
    this.name = name;
    return this;
  }

  public setNameLocalizations(localizedNames: LocalizationMap | null) {
    this.nameLocalizations = localizedNames;
    return this;
  }

  public setDescription(description: string) {
    this.description = description;
    return this;
  }

  public setDescriptionLocalizations(localizedDescriptions: LocalizationMap | null) {
    this.descriptionLocalizations = localizedDescriptions;
    return this;
  }
}

beforeAll(async () => {
  container.i18n = new InternationalizationHandler({
    defaultLanguageDirectory: languagesDirectory,
    defaultMissingKey: "default:default",
    formatters: [{ name: "shout", format: (value: string) => `${value.toUpperCase()}!` }],
  });

  await container.i18n.init();
});

describe("InternationalizationHandler", () => {
  test("GIVEN an initialized handler THEN it loads every language and namespace", () => {
    expect(container.i18n.languagesLoaded).toBe(true);
    expect([...container.i18n.languages.keys()].toSorted()).toEqual(["en-US", "es-ES"]);
    expect([...container.i18n.namespaces].toSorted()).toEqual(["commands/ping", "default"]);
  });

  test("GIVEN an unknown locale THEN getT throws", () => {
    expect(() => container.i18n.getT("fr")).toThrow(ReferenceError);
  });

  test("GIVEN a namespace THEN getT binds the returned function to it", () => {
    expect(container.i18n.getT("en-US", "commands/ping")("success")).toBe("Pong!");
    expect(container.i18n.getT("es-ES", "commands/ping")("success")).toBe("¡Pong!");
  });

  test("GIVEN a known key THEN format resolves it", () => {
    expect(container.i18n.format("en-US", "commands/ping:success")).toBe("Pong!");
    expect(container.i18n.format("es-ES", "commands/ping:success")).toBe("¡Pong!");
  });

  test("GIVEN interpolation options THEN format applies them", () => {
    expect(
      container.i18n.format("en-US", "commands/ping:successWithLatency", { latency: 42 }),
    ).toBe("Pong! Took me 42ms to reply");
  });

  test("GIVEN a missing key THEN format falls back to defaultMissingKey", () => {
    expect(container.i18n.format("en-US", "commands/ping:missing")).toBe(
      "Missing key: commands/ping:missing",
    );
  });

  test("GIVEN a registered formatter THEN i18next applies it", () => {
    expect(
      container.i18n.format("en-US", "commands/ping:successWithLatency", {
        latency: 42,
        defaultValue: "{{value, shout}}",
        value: "hello",
      }),
    ).toBe("Pong! Took me 42ms to reply");
    expect(
      container.i18n.format("en-US", "unknown:key", "{{value, shout}}", { value: "hello" }),
    ).toBe("HELLO!");
  });
});

describe("language resolution", () => {
  test("GIVEN a guild interaction THEN the guild locale wins", () => {
    expect(getSupportedLanguageName(makeInteraction())).toBe("en-US");
  });

  test("GIVEN a DM interaction THEN the user locale wins", () => {
    expect(getSupportedLanguageName(makeInteraction({ guild_id: undefined }))).toBe("es-ES");
  });

  test("GIVEN any interaction THEN the user locale is preferred by the user helpers", () => {
    expect(getSupportedUserLanguageName(makeInteraction())).toBe("es-ES");
  });

  test("GIVEN an unloaded locale THEN it falls back to en-US", () => {
    expect(
      getSupportedUserLanguageName(makeInteraction({ locale: "fr", guild_locale: "fr" })),
    ).toBe("en-US");
  });

  test("GIVEN a Discord locale THEN isSupportedDiscordLocale narrows it", () => {
    expect(isSupportedDiscordLocale("en-US")).toBe(true);
    expect(isSupportedDiscordLocale("xx-XX")).toBe(false);
  });
});

describe("key resolution", () => {
  test("GIVEN a key THEN getSupportedLanguageT uses the guild language", () => {
    expect(getSupportedLanguageT(makeInteraction(), "commands/ping:success")).toBe("Pong!");
  });

  test("GIVEN a key THEN getSupportedUserLanguageT uses the user language", () => {
    expect(getSupportedUserLanguageT(makeInteraction(), "commands/ping:success")).toBe("¡Pong!");
  });

  test("GIVEN no key THEN the helpers return the bound function", () => {
    expect(getSupportedUserLanguageT(makeInteraction())("commands/ping:success")).toBe("¡Pong!");
  });

  test("GIVEN an ns option THEN the key is resolved within it", () => {
    expect(getSupportedUserLanguageT(makeInteraction(), "success", { ns: "commands/ping" })).toBe(
      "¡Pong!",
    );
  });

  test("GIVEN interpolation options THEN they are applied", () => {
    expect(
      getSupportedUserLanguageT(makeInteraction(), "commands/ping:successWithLatency", {
        latency: 7,
      }),
    ).toBe("¡Pong! Tardé 7ms en responder");
  });

  test("GIVEN no fetchLanguage hook THEN fetchLanguage falls back to the interaction locales", async () => {
    await expect(fetchLanguage(makeInteraction())).resolves.toBe("en-US");
    await expect(fetchT(makeInteraction()).then((t) => t("commands/ping:success"))).resolves.toBe(
      "Pong!",
    );
  });

  test("GIVEN a fetchLanguage hook THEN it takes precedence", async () => {
    const previous = container.i18n.fetchLanguage;
    container.i18n.fetchLanguage = (context) => (context.guildId ? "es-ES" : null);

    try {
      await expect(fetchLanguage(makeInteraction())).resolves.toBe("es-ES");
    } finally {
      container.i18n.fetchLanguage = previous;
    }
  });
});

describe("builder localization", () => {
  test("GIVEN a key THEN getLocalizedData returns every localization", () => {
    expect(getLocalizedData("commands/ping:name")).toEqual({
      value: "ping",
      localizations: { "en-US": "ping", "es-ES": "ping" },
    });
  });

  test("GIVEN a root key THEN applyLocalizedBuilder appends Name and Description", () => {
    const builder = applyLocalizedBuilder(new StubBuilder(), "commands/ping:name");

    expect(builder.name).toBe("ping");
    expect(builder.description).toBe("Checks whether the bot is alive");
    expect(builder.descriptionLocalizations).toEqual({
      "en-US": "Checks whether the bot is alive",
      "es-ES": "Comprueba si el bot está vivo",
    });
  });

  test("GIVEN a key THEN createLocalizedChoice keeps the extra options", () => {
    expect(createLocalizedChoice("commands/ping:name", { value: "ping" })).toEqual({
      value: "ping",
      name: "ping",
      name_localizations: { "en-US": "ping", "es-ES": "ping" },
    });
  });
});

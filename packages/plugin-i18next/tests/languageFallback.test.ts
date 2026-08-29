import { container } from "@sapphire/pieces";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  fetchLanguage,
  fetchT,
  getSupportedLanguageName,
  getSupportedUserLanguageName,
  InternationalizationHandler,
  resolveKey,
  resolveUserKey,
  T,
  type Interaction,
} from "../src/index";

const languagesDirectory = fileURLToPath(new URL("fixtures/languages-es-only", import.meta.url));

const Success = T("commands/ping:success");

/**
 * An interaction whose locales are both unloaded, so every helper has to fall back.
 */
function makeUnmatchedInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    locale: "fr",
    guild_locale: "fr",
    guild_id: "737141877803057244",
    ...overrides,
  } as Interaction;
}

beforeAll(async () => {
  container.i18n = new InternationalizationHandler({
    defaultLanguageDirectory: languagesDirectory,
    defaultName: "es-ES",
  });

  await container.i18n.init();
});

describe("defaultName fallback", () => {
  test("GIVEN only es-ES loaded THEN it is the only language", () => {
    expect([...container.i18n.languages.keys()]).toEqual(["es-ES"]);
  });

  test("GIVEN unmatched locales THEN the guild helper falls back to defaultName", () => {
    expect(getSupportedLanguageName(makeUnmatchedInteraction())).toBe("es-ES");
  });

  test("GIVEN unmatched locales THEN the user helper falls back to defaultName", () => {
    expect(getSupportedUserLanguageName(makeUnmatchedInteraction())).toBe("es-ES");
  });

  test("GIVEN a DM interaction with an unmatched locale THEN it falls back to defaultName", () => {
    expect(getSupportedLanguageName(makeUnmatchedInteraction({ guild_id: undefined }))).toBe(
      "es-ES",
    );
  });

  test("GIVEN unmatched locales THEN fetchLanguage and fetchT do not throw", async () => {
    await expect(fetchLanguage(makeUnmatchedInteraction())).resolves.toBe("es-ES");
    await expect(
      fetchT(makeUnmatchedInteraction()).then((t) => t("commands/ping:success")),
    ).resolves.toBe("¡Pong!");
  });

  test("GIVEN unmatched locales THEN the resolve helpers do not throw", () => {
    expect(resolveKey(makeUnmatchedInteraction(), Success)).toBe("¡Pong!");
    expect(resolveUserKey(makeUnmatchedInteraction(), Success)).toBe("¡Pong!");
  });

  test("GIVEN an unloaded defaultName THEN it falls back to en-US", () => {
    const previous = container.i18n.options.defaultName;
    container.i18n.options.defaultName = "de";

    try {
      expect(getSupportedLanguageName(makeUnmatchedInteraction())).toBe("en-US");
    } finally {
      container.i18n.options.defaultName = previous;
    }
  });
});

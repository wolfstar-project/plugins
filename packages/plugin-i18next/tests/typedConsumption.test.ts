/**
 * Exercises the public API against a real `CustomTypeOptions` augmentation, generated from
 * `fixtures/languages/en-US` by `@wolfstar/i18next-type-generator` (regenerate with
 * `i18next-type-generator tests/fixtures/languages/en-US tests/fixtures/@types/i18next.d.ts`),
 * plus the hand-written `defaultNS` augmentation the generator's README says to add separately.
 *
 * @remarks
 * `tsconfig.consumption.json` type-checks this file, `src` and the fixture together — `pnpm test`
 * only proves these calls work at runtime, since Vitest transforms TypeScript without checking it.
 * Both are required: this is the regression test for the `Ns` defaults documented on
 * {@link AnyNamespace}, which only reject namespace-prefixed keys once real, literal resources are
 * in scope; the package's own fixture-less tests never exercised that path.
 */
import "./fixtures/@types/i18next.d.ts";
import "./fixtures/@types/i18next-options.d.ts";
import { container } from "@sapphire/pieces";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  applyLocalizedBuilder,
  createLocalizedChoice,
  fetchKey,
  getLocalizedData,
  getSupportedLanguageT,
  getSupportedUserLanguageT,
  InternationalizationHandler,
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
  public nameLocalizations = null;
  public description: string | null = null;
  public descriptionLocalizations = null;

  public setName(name: string) {
    this.name = name;
    return this;
  }

  public setNameLocalizations(localizedNames: null) {
    this.nameLocalizations = localizedNames;
    return this;
  }

  public setDescription(description: string) {
    this.description = description;
    return this;
  }

  public setDescriptionLocalizations(localizedDescriptions: null) {
    this.descriptionLocalizations = localizedDescriptions;
    return this;
  }
}

beforeAll(async () => {
  container.i18n = new InternationalizationHandler({
    defaultLanguageDirectory: languagesDirectory,
    defaultMissingKey: "default:default",
  });

  await container.i18n.init();
});

describe("typed consumption", () => {
  test("GIVEN a fully-qualified key THEN getSupportedLanguageT resolves it", () => {
    expect(getSupportedLanguageT(makeInteraction(), "commands/ping:success")).toBe("Pong!");
  });

  test("GIVEN interpolation options THEN getSupportedUserLanguageT applies them", () => {
    expect(
      getSupportedUserLanguageT(makeInteraction(), "commands/ping:successWithLatency", {
        latency: "7",
      }),
    ).toBe("¡Pong! Tardé 7ms en responder");
  });

  test("GIVEN a namespace THEN container.i18n.getT binds unprefixed keys to it", () => {
    expect(container.i18n.getT("en-US", "commands/ping")("success")).toBe("Pong!");
  });

  test("GIVEN a fully-qualified key THEN container.i18n.format resolves it", () => {
    expect(container.i18n.format("en-US", "commands/ping:success")).toBe("Pong!");
  });

  test("GIVEN a fully-qualified key THEN fetchKey resolves it", async () => {
    await expect(fetchKey(makeInteraction(), "commands/ping:success")).resolves.toBe("Pong!");
  });

  test("GIVEN a fully-qualified key THEN getLocalizedData resolves it", () => {
    expect(getLocalizedData("commands/ping:name")).toEqual({
      value: "ping",
      localizations: { "en-US": "ping", "es-ES": "ping" },
    });
  });

  test("GIVEN a fully-qualified key THEN createLocalizedChoice resolves it", () => {
    expect(createLocalizedChoice("commands/ping:name", { value: "ping" })).toEqual({
      value: "ping",
      name: "ping",
      name_localizations: { "en-US": "ping", "es-ES": "ping" },
    });
  });

  test("GIVEN a root key THEN applyLocalizedBuilder resolves Name and Description", () => {
    const builder = applyLocalizedBuilder(new StubBuilder(), "commands/ping:name");
    expect(builder.name).toBe("ping");
    expect(builder.description).toBe("Checks whether the bot is alive");
  });
});

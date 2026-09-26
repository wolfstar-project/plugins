import { container } from "@sapphire/pieces";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, expectTypeOf, test } from "vitest";
import * as i18n from "../src/index";
import {
  FT,
  InternationalizationHandler,
  resolveKey,
  resolveUserKey,
  T,
  type Interaction,
  type TypedFT,
  type TypedT,
} from "../src/index";

const languagesDirectory = fileURLToPath(new URL("fixtures/languages", import.meta.url));

const interaction = {
  locale: "es-ES",
  guild_locale: "en-US",
  guild_id: "737141877803057244",
} as Interaction;

beforeAll(async () => {
  container.i18n = new InternationalizationHandler({
    defaultLanguageDirectory: languagesDirectory,
    defaultName: "en-US",
  });

  await container.i18n.init();
});

describe("http-framework-i18n compatibility helpers", () => {
  test("GIVEN the package index THEN T, FT, resolveKey and resolveUserKey are exported", () => {
    expect(Object.keys(i18n)).toEqual(
      expect.arrayContaining(["T", "FT", "resolveKey", "resolveUserKey"]),
    );
  });

  test("GIVEN T or FT THEN the key is returned unchanged", () => {
    const success = T("commands/ping:success");
    const successWithLatency = FT<{ latency: number }>("commands/ping:successWithLatency");

    expect(success).toBe("commands/ping:success");
    expect(successWithLatency).toBe("commands/ping:successWithLatency");
    expectTypeOf(success).toEqualTypeOf<TypedT<string>>();
    expectTypeOf(successWithLatency).toEqualTypeOf<TypedFT<{ latency: number }, string>>();
  });

  test("GIVEN resolveKey THEN the guild's language is used", () => {
    expect(resolveKey(interaction, T("commands/ping:success"))).toBe("Pong!");
    expect(
      resolveKey(interaction, FT<{ latency: number }>("commands/ping:successWithLatency"), {
        latency: 42,
      }),
    ).toBe("Pong! Took me 42ms to reply");
  });

  test("GIVEN resolveUserKey THEN the user's language is used", () => {
    expect(resolveUserKey(interaction, T("commands/ping:success"))).toBe("¡Pong!");
    expect(
      resolveUserKey(interaction, FT<{ latency: number }>("commands/ping:successWithLatency"), {
        latency: 42,
      }),
    ).toBe("¡Pong! Tardé 42ms en responder");
  });

  test("GIVEN a missing key and a default value THEN the default value is returned", () => {
    expect(resolveKey(interaction, T("commands/ping:missing"), "Fallback")).toBe("Fallback");
  });
});

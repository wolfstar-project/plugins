import { container } from "@sapphire/pieces";
import {
  ChannelType,
  type APIChannel,
  type APIGuild,
  type APIMessage,
} from "discord-api-types/v10";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import {
  fetchLanguage,
  fetchT,
  getSupportedLanguageName,
  getSupportedLanguageT,
  getSupportedUserLanguageName,
  InternationalizationHandler,
  resolveKey,
  resolveUserKey,
  T,
  type ChannelTarget,
  type GuildTarget,
  type Interaction,
  type MessageTarget,
} from "../src/index";

const languagesDirectory = fileURLToPath(new URL("fixtures/languages", import.meta.url));

const Success = T("commands/ping:success");

const GuildId = "737141877803057244";

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    locale: "es-ES",
    guild_locale: "en-US",
    guild_id: GuildId,
    ...overrides,
  } as Interaction;
}

beforeAll(async () => {
  container.i18n = new InternationalizationHandler({
    defaultLanguageDirectory: languagesDirectory,
    defaultName: "en-US",
  });

  await container.i18n.init();
});

describe("guild target", () => {
  const guild: GuildTarget = { id: GuildId, preferred_locale: "es-ES" };

  test("GIVEN a guild THEN its preferred locale is used", () => {
    expect(getSupportedLanguageName(guild)).toBe("es-ES");
    expect(getSupportedLanguageT(guild)("commands/ping:success")).toBe("¡Pong!");
  });

  test("GIVEN a guild THEN the user helper falls back to its preferred locale", () => {
    expect(getSupportedUserLanguageName(guild)).toBe("es-ES");
  });

  test("GIVEN a guild THEN the resolve helpers use it", () => {
    expect(resolveKey(guild, Success)).toBe("¡Pong!");
    expect(resolveUserKey(guild, Success)).toBe("¡Pong!");
  });

  test("GIVEN an unloaded preferred locale THEN it falls back to defaultName", () => {
    expect(getSupportedLanguageName({ id: GuildId, preferred_locale: "fr" })).toBe("en-US");
  });

  test("GIVEN a partial guild THEN it falls back to defaultName", () => {
    expect(getSupportedLanguageName({ id: GuildId })).toBe("en-US");
  });

  test("GIVEN an APIGuild payload THEN it is accepted", () => {
    const payload = { id: GuildId, preferred_locale: "es-ES" } as unknown as APIGuild;
    expect(getSupportedLanguageName(payload)).toBe("es-ES");
  });

  test("GIVEN a guild THEN fetchLanguage passes its id to the hook", async () => {
    const previous = container.i18n.fetchLanguage;
    container.i18n.fetchLanguage = (context) => (context.guildId === GuildId ? "es-ES" : null);

    try {
      await expect(fetchLanguage({ id: GuildId })).resolves.toBe("es-ES");
      await expect(fetchT({ id: GuildId }).then((t) => t("commands/ping:success"))).resolves.toBe(
        "¡Pong!",
      );
    } finally {
      container.i18n.fetchLanguage = previous;
    }
  });
});

describe("channel target", () => {
  const channel: ChannelTarget = { id: "1", type: ChannelType.GuildText, guild_id: GuildId };

  test("GIVEN a channel THEN it carries no locale and falls back", () => {
    expect(getSupportedLanguageName(channel)).toBe("en-US");
  });

  test("GIVEN an APIChannel payload THEN it is accepted", () => {
    const payload = { id: "1", type: ChannelType.DM } as unknown as APIChannel;
    expect(getSupportedLanguageName(payload)).toBe("en-US");
  });

  test("GIVEN a channel THEN the hook receives its ids", async () => {
    const previous = container.i18n.fetchLanguage;
    container.i18n.fetchLanguage = (context) =>
      context.guildId === GuildId && context.channelId === "1" ? "es-ES" : null;

    try {
      await expect(fetchLanguage(channel)).resolves.toBe("es-ES");
    } finally {
      container.i18n.fetchLanguage = previous;
    }
  });
});

describe("message target", () => {
  const message: MessageTarget = {
    id: "2",
    channel_id: "1",
    guild_id: GuildId,
    author: { id: "3" },
  };

  test("GIVEN a message THEN it carries no locale and falls back", () => {
    expect(getSupportedLanguageName(message)).toBe("en-US");
  });

  test("GIVEN an APIMessage payload THEN it is accepted", () => {
    const payload = {
      id: "2",
      channel_id: "1",
      author: { id: "3" },
    } as unknown as APIMessage;
    expect(getSupportedLanguageName(payload)).toBe("en-US");
  });

  test("GIVEN a message THEN the hook receives its author as the user", async () => {
    const previous = container.i18n.fetchLanguage;
    container.i18n.fetchLanguage = (context) => (context.userId === "3" ? "es-ES" : null);

    try {
      await expect(fetchLanguage(message)).resolves.toBe("es-ES");
    } finally {
      container.i18n.fetchLanguage = previous;
    }
  });
});

describe("interaction target", () => {
  test("GIVEN an interaction THEN the existing behaviour is unchanged", () => {
    expect(getSupportedLanguageName(makeInteraction())).toBe("en-US");
    expect(getSupportedUserLanguageName(makeInteraction())).toBe("es-ES");
    expect(getSupportedLanguageName(makeInteraction({ guild_id: undefined }))).toBe("es-ES");
  });

  test("GIVEN an interaction THEN it is not mistaken for another target", async () => {
    const previous = container.i18n.fetchLanguage;
    const seen: Array<string | null> = [];
    container.i18n.fetchLanguage = (context) => {
      seen.push(context.interactionLocale ?? null, context.preferredLocale ?? null);
      return null;
    };

    try {
      await fetchLanguage(makeInteraction());
      expect(seen).toEqual(["es-ES", "en-US"]);
    } finally {
      container.i18n.fetchLanguage = previous;
    }
  });
});

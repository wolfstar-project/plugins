import { createInMemoryCache, memberKey, roleKey } from "@wolfstar/plugin-cache";
import { ApplicationFlags, ChannelType } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { GatewayClient } from "../src/GatewayClient.js";
import { ApplicationFlagsBitField } from "../src/util/flags.js";
import { Colors } from "../src/util/Colors.js";
import {
  computePositions,
  discordSort,
  getSortableGroupTypes,
  moveElementInArray,
  parseEmoji,
  resolveColor,
  resolvePartialEmoji,
  transformResolved,
} from "../src/util/Util.js";

describe("resolveColor", () => {
  test("GIVEN a number THEN it is returned as is", () => {
    expect(resolveColor(0x5865f2)).toBe(0x5865f2);
  });

  test("GIVEN a hex string with or without # THEN it is parsed", () => {
    expect(resolveColor("#5865F2")).toBe(0x5865f2);
    expect(resolveColor("5865f2" as `#${string}`)).toBe(0x5865f2);
  });

  test("GIVEN a named color THEN its value is returned", () => {
    expect(resolveColor("Blurple")).toBe(Colors.Blurple);
    expect(resolveColor("Default")).toBe(0);
  });

  test("GIVEN an RGB tuple THEN it is packed into a number", () => {
    expect(resolveColor([0x58, 0x65, 0xf2])).toBe(0x5865f2);
  });

  test("GIVEN Random THEN a color within range is returned", () => {
    const color = resolveColor("Random");
    expect(Number.isInteger(color)).toBe(true);
    expect(color).toBeGreaterThanOrEqual(0);
    expect(color).toBeLessThanOrEqual(0xffffff);
  });

  test("GIVEN an unknown name THEN it throws a TypeError", () => {
    expect(() => resolveColor("NotAColor" as "Red")).toThrow(TypeError);
  });

  test("GIVEN a number out of range THEN it throws a RangeError", () => {
    expect(() => resolveColor(0x1000000)).toThrow(RangeError);
    expect(() => resolveColor(-1)).toThrow(RangeError);
  });
});

describe("ApplicationFlagsBitField", () => {
  test("GIVEN flag names THEN they resolve to bigint bits", () => {
    expect(ApplicationFlagsBitField.resolve("GatewayPresence")).toBe(
      BigInt(ApplicationFlags.GatewayPresence),
    );
    expect(new ApplicationFlagsBitField(["Embedded"]).toJSON()).toBe(ApplicationFlags.Embedded);
  });
});

describe("parseEmoji", () => {
  test.each([
    ["🐺", { animated: false, name: "🐺", id: undefined }],
    [encodeURIComponent("🐺"), { animated: false, name: "🐺", id: undefined }],
    ["<:howl:123456789012345678>", { animated: false, name: "howl", id: "123456789012345678" }],
    ["<a:howl:123456789012345678>", { animated: true, name: "howl", id: "123456789012345678" }],
    ["howl:123456789012345678", { animated: false, name: "howl", id: "123456789012345678" }],
    ["a:howl:123456789012345678", { animated: true, name: "howl", id: "123456789012345678" }],
  ])("GIVEN %s THEN it parses to %o", (text, expected) => {
    expect(parseEmoji(text)).toStrictEqual(expected);
  });

  test("GIVEN a string with a colon that is no custom emoji THEN it returns null", () => {
    expect(parseEmoji("not:an-emoji")).toBeNull();
  });
});

describe("resolvePartialEmoji", () => {
  test("GIVEN an emoji ID THEN only the ID is kept", () => {
    expect(resolvePartialEmoji("123456789012345678")).toStrictEqual({ id: "123456789012345678" });
  });

  test("GIVEN a string THEN it is parsed", () => {
    expect(resolvePartialEmoji("<a:howl:123456789012345678>")).toStrictEqual({
      animated: true,
      name: "howl",
      id: "123456789012345678",
    });
  });

  test("GIVEN an object THEN its id, name, and animated flag are kept", () => {
    expect(resolvePartialEmoji({ id: "123456789012345678", name: "howl" })).toStrictEqual({
      id: "123456789012345678",
      name: "howl",
      animated: false,
    });
  });

  test("GIVEN an object with neither id nor name THEN it returns null", () => {
    expect(resolvePartialEmoji({ id: null, name: null })).toBeNull();
  });
});

describe("discordSort", () => {
  test("GIVEN roles THEN they are sorted by position, the newer first among equal positions", () => {
    const roles = [
      { id: "30", position: 1 },
      { id: "10", position: 0 },
      { id: "20", position: 1 },
    ];

    expect(discordSort(roles).map((role) => role.id)).toEqual(["10", "30", "20"]);
    expect(roles.map((role) => role.id)).toEqual(["30", "10", "20"]);
  });

  test("GIVEN channels THEN they are sorted by position, the older first among equal positions", () => {
    const channels = [
      { id: "30", position: 1, type: ChannelType.GuildText },
      { id: "10", position: 2, type: ChannelType.GuildText },
      { id: "20", position: 1, type: ChannelType.GuildText },
    ];

    expect(discordSort(channels).map((channel) => channel.id)).toEqual(["20", "30", "10"]);
  });
});

describe("getSortableGroupTypes", () => {
  test("GIVEN a text-like, voice, or category type THEN its group is returned", () => {
    expect(getSortableGroupTypes(ChannelType.GuildForum)).toContain(ChannelType.GuildText);
    expect(getSortableGroupTypes(ChannelType.GuildStageVoice)).toEqual([
      ChannelType.GuildVoice,
      ChannelType.GuildStageVoice,
    ]);
    expect(getSortableGroupTypes(ChannelType.GuildCategory)).toEqual([ChannelType.GuildCategory]);
  });

  test("GIVEN another type THEN it is alone in its group", () => {
    expect(getSortableGroupTypes(ChannelType.GuildDirectory)).toEqual([ChannelType.GuildDirectory]);
  });
});

describe("moveElementInArray", () => {
  test("GIVEN an index THEN the element moves there", () => {
    const array = ["a", "b", "c"];
    expect(moveElementInArray(array, "a", 2)).toBe(2);
    expect(array).toEqual(["b", "c", "a"]);
  });

  test("GIVEN an offset THEN the element moves by it", () => {
    const array = ["a", "b", "c"];
    expect(moveElementInArray(array, "c", -1, true)).toBe(1);
    expect(array).toEqual(["a", "c", "b"]);
  });

  test("GIVEN a target out of range or a missing element THEN the array is untouched", () => {
    const array = ["a", "b"];
    expect(moveElementInArray(array, "a", 5)).toBe(0);
    expect(moveElementInArray(array, "z", 0)).toBe(-1);
    expect(array).toEqual(["a", "b"]);
  });
});

describe("computePositions", () => {
  test("GIVEN a move THEN every sibling gets its index as position", () => {
    expect(computePositions("a", 1, false, [{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
      { id: "c", position: 2 },
    ]);
  });
});

describe("transformResolved", () => {
  const guildId = "100000000000000010";
  const user = {
    id: "600000000000000600",
    username: "wolf",
    discriminator: "0",
    global_name: null,
    avatar: null,
  };

  async function createClient() {
    const client = new GatewayClient({
      discordPublicKey: "0".repeat(64),
      discordToken: "test-token",
      clientId: "266624760782258186",
      intents: 0,
      cache: createInMemoryCache(),
    });
    const cache = client.cache!;
    await cache.users.set(user.id, user);
    await cache.members.set(memberKey(guildId, user.id), {
      user,
      roles: [],
      joined_at: "2026-01-01T00:00:00.000Z",
      guild_id: guildId,
    } as never);
    await cache.roles.set(roleKey(guildId, "300000000000000030"), {
      id: "300000000000000030",
      name: "Alpha",
      permissions: "0",
      position: 1,
      guild_id: guildId,
    } as never);
    return client;
  }

  test("GIVEN IDs THEN the cached ones are resolved and the others skipped", async () => {
    const client = await createClient();

    const resolved = await transformResolved(
      { client, guildId },
      {
        users: [user.id, "1"],
        members: [user.id],
        roles: ["300000000000000030", "300000000000000030"],
        channels: ["200000000000000020"],
      },
    );

    expect([...resolved.users!.keys()]).toEqual([user.id]);
    expect(resolved.members!.get(user.id)?.id).toBe(user.id);
    expect([...resolved.roles!.values()].map((role) => role.name)).toEqual(["Alpha"]);
    expect(resolved.channels!.size).toBe(0);
  });

  test("GIVEN raw data THEN it is built when not cached, without writing the cache", async () => {
    const client = await createClient();
    const other = { ...user, id: "600000000000000601", username: "howl" };

    const resolved = await transformResolved(
      { client, guildId },
      {
        users: [other],
        members: [{ user: other, roles: [], joined_at: "2026-01-01T00:00:00.000Z" } as never],
        channels: [
          { id: "200000000000000020", type: ChannelType.GuildText, name: "general" } as never,
        ],
      },
    );

    expect(resolved.users!.get(other.id)?.username).toBe("howl");
    expect(resolved.members!.get(other.id)?.guildId).toBe(guildId);
    expect(resolved.channels!.get("200000000000000020")?.id).toBe("200000000000000020");
    expect(await client.cache!.users.get(other.id)).toBeUndefined();
  });

  test("GIVEN no guild THEN members and roles are not resolved", async () => {
    const client = await createClient();

    const resolved = await transformResolved(
      { client },
      { users: [user.id], members: [user.id], roles: ["300000000000000030"] },
    );

    expect(resolved.users!.size).toBe(1);
    expect(resolved.members).toBeUndefined();
    expect(resolved.roles).toBeUndefined();
  });
});

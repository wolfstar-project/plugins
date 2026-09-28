import { ApplicationFlags } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { ApplicationFlagsBitField } from "../src/util/flags.js";
import { Colors } from "../src/util/Colors.js";
import { parseEmoji, resolveColor, resolvePartialEmoji } from "../src/util/Util.js";

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

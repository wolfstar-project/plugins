import { ApplicationFlags } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { ApplicationFlagsBitField } from "../src/util/flags.js";
import { Colors } from "../src/util/Colors.js";
import { resolveColor } from "../src/util/Util.js";

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

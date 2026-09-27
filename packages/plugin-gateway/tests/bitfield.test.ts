import { MessageFlags, PermissionFlagsBits, UserFlags } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { BitField } from "../src/util/BitField.js";
import { IntentsBitField, MessageFlagsBitField, UserFlagsBitField } from "../src/util/flags.js";
import { PermissionsBitField } from "../src/util/PermissionsBitField.js";

describe("BitField", () => {
  test("GIVEN the re-exported and derived classes THEN they share @discordjs/structures' base", () => {
    expect(new MessageFlagsBitField()).toBeInstanceOf(BitField);
    expect(new PermissionsBitField()).toBeInstanceOf(BitField);
    expect(new UserFlagsBitField()).toBeInstanceOf(BitField);
  });

  test("GIVEN flag names, numbers, strings, and bitfields THEN they all resolve to the same bits", () => {
    const bits = BigInt(MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds);

    expect(MessageFlagsBitField.resolve(["Ephemeral", "SuppressEmbeds"])).toBe(bits);
    expect(MessageFlagsBitField.resolve(String(bits) as `${bigint}`)).toBe(bits);
    expect(MessageFlagsBitField.resolve(new MessageFlagsBitField(bits))).toBe(bits);
    expect(new MessageFlagsBitField().bitField).toBe(0n);
  });

  test("GIVEN a derived flags bitfield THEN has, any, missing, toArray, and serialize agree", () => {
    const flags = new UserFlagsBitField(["Staff", "Partner"]);

    expect(flags.has("Staff")).toBe(true);
    expect(flags.has(["Staff", "Partner"])).toBe(true);
    expect(flags.has("Hypesquad")).toBe(false);
    expect(flags.any(["Hypesquad", "Partner"])).toBe(true);
    expect(flags.equals(UserFlags.Staff | UserFlags.Partner)).toBe(true);
    expect(flags.missing(["Staff", "Hypesquad"])).toEqual(["Hypesquad"]);
    expect(flags.toArray()).toEqual(["Staff", "Partner"]);
    expect(flags.serialize().Staff).toBe(true);
    expect(flags.serialize().Hypesquad).toBe(false);
    // Reverse enum entries (`"1": "Staff"`) must never leak as flags.
    expect(Object.keys(flags.serialize()).every((key) => Number.isNaN(Number(key)))).toBe(true);
  });

  test("GIVEN a frozen bitfield THEN add and remove return copies", () => {
    const flags = new MessageFlagsBitField("Ephemeral").freeze();
    const added = flags.add("SuppressEmbeds");

    expect(added).not.toBe(flags);
    expect(added.has("SuppressEmbeds")).toBe(true);
    expect(flags.has("SuppressEmbeds")).toBe(false);
    expect(flags.bitField).toBe(BigInt(MessageFlags.Ephemeral));
  });

  test("GIVEN intents THEN they resolve from names", () => {
    const intents = new IntentsBitField(["Guilds", "GuildMessages"]);

    expect(intents.toArray()).toEqual(["Guilds", "GuildMessages"]);
    expect(Number(intents.bitField)).toBe(1 | (1 << 9));
  });
});

describe("PermissionsBitField", () => {
  test("GIVEN permissions THEN they resolve to bigints", () => {
    const permissions = new PermissionsBitField(["SendMessages", "ViewChannel"]);

    expect(permissions.bitField).toBe(
      PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel,
    );
    expect(PermissionsBitField.resolve("8")).toBe(PermissionFlagsBits.Administrator);
    expect(permissions.toArray()).toEqual(["ViewChannel", "SendMessages"]);
  });

  test("GIVEN Administrator THEN every permission is granted unless checkAdmin is false", () => {
    const admin = new PermissionsBitField("Administrator");

    expect(admin.has("BanMembers")).toBe(true);
    expect(admin.has("BanMembers", false)).toBe(false);
    expect(admin.any(["BanMembers", "KickMembers"])).toBe(true);
    expect(admin.missing(["BanMembers"])).toEqual([]);
    expect(admin.missing(["BanMembers"], false)).toEqual(["BanMembers"]);
  });

  test("GIVEN the constants THEN they match Discord's values", () => {
    expect(PermissionsBitField.All).toBe(
      Object.values(PermissionFlagsBits).reduce((all, bit) => all | bit, 0n),
    );
    expect(PermissionsBitField.Default).toBe(104_324_673n);
  });
});

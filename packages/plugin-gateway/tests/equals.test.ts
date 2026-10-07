import { ChannelType, OverwriteType, StickerFormatType } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  createChannel,
  Embed,
  Guild,
  GuildEmoji,
  GuildMember,
  Role,
  SoundboardSound,
  Sticker,
  User,
} from "../src/index.js";

const guildId = "100000000000000010";

function sticker(extra: object = {}) {
  return {
    id: "700000000000000070",
    name: "howl",
    description: "a wolf howling",
    tags: "wolf",
    type: 2,
    format_type: StickerFormatType.PNG,
    available: true,
    guild_id: guildId,
    ...extra,
  } as never;
}

function emoji(extra: object = {}) {
  return {
    id: "800000000000000080",
    name: "howl",
    roles: ["1", "2"],
    managed: false,
    available: true,
    require_colons: true,
    guild_id: guildId,
    ...extra,
  } as never;
}

function sound(extra: object = {}) {
  return {
    sound_id: "900000000000000090",
    name: "awoo",
    volume: 1,
    emoji_id: null,
    emoji_name: "🐺",
    guild_id: guildId,
    available: true,
    user: { id: "266624760782258186" },
    ...extra,
  } as never;
}

function channel(extra: object = {}) {
  return {
    id: "200000000000000020",
    type: ChannelType.GuildText,
    name: "general",
    topic: null,
    guild_id: guildId,
    position: 1,
    parent_id: null,
    permission_overwrites: [],
    ...extra,
  } as never;
}

function thread(extra: object = {}) {
  return {
    id: "400000000000000040",
    type: ChannelType.PublicThread,
    name: "pack",
    guild_id: guildId,
    parent_id: "200000000000000020",
    ...extra,
  } as never;
}

const overwrite = (id: string, allow = "0", deny = "0") => ({
  id,
  type: OverwriteType.Role,
  allow,
  deny,
});

describe("Sticker#equals", () => {
  test("GIVEN stickers or raw stickers THEN their data is compared", () => {
    const base = new Sticker(sticker());
    expect(base.equals(new Sticker(sticker()))).toBe(true);
    expect(base.equals(sticker())).toBe(true);
    expect(base.equals(new Sticker(sticker({ name: "renamed" })))).toBe(false);
    expect(base.equals(sticker({ tags: "pack" }))).toBe(false);
    expect(base.equals(new Sticker(sticker({ available: false })))).toBe(false);
    expect(base.equals(new Sticker(sticker({ sort_value: 3 })))).toBe(false);
  });

  test("GIVEN a raw sticker THEN only the ID, description, name, and tags are compared", () => {
    const base = new Sticker(sticker());
    expect(base.equals(sticker({ available: false, sort_value: 3 }))).toBe(true);
    expect(base.equals(sticker({ description: "other" }))).toBe(false);
    expect(base.equals(sticker({ id: "1" }))).toBe(false);
  });

  test("GIVEN a foreign argument THEN it is false rather than a throw", () => {
    const base = new Sticker(sticker());
    expect(base.equals(null)).toBe(false);
    expect(base.equals(undefined)).toBe(false);
    expect(base.equals("howl")).toBe(false);
    expect(base.equals({})).toBe(false);
  });
});

describe("GuildEmoji#equals", () => {
  test("GIVEN emojis or raw emojis THEN their data is compared", () => {
    const base = new GuildEmoji(emoji());
    expect(base.equals(new GuildEmoji(emoji()))).toBe(true);
    expect(base.equals(emoji({ roles: ["2", "1"] }))).toBe(true);
    expect(base.equals(new GuildEmoji(emoji({ name: "renamed" })))).toBe(false);
    expect(base.equals(emoji({ roles: ["1"] }))).toBe(false);
    expect(base.equals(new GuildEmoji(emoji({ managed: true })))).toBe(false);
    expect(base.equals(new GuildEmoji(emoji({ available: false })))).toBe(false);
  });

  test("GIVEN a raw emoji THEN only the ID, name, and roles are compared", () => {
    const base = new GuildEmoji(emoji());
    expect(base.equals(emoji({ managed: true, available: false }))).toBe(true);
    expect(base.equals(emoji({ name: "renamed" }))).toBe(false);
    expect(base.equals(emoji({ roles: undefined }))).toBe(false);
  });

  test("GIVEN a foreign argument THEN it is false rather than a throw", () => {
    const base = new GuildEmoji(emoji());
    expect(base.equals(null)).toBe(false);
    expect(base.equals(42)).toBe(false);
    expect(base.equals({ name: "howl" })).toBe(false);
  });
});

describe("SoundboardSound#equals", () => {
  test("GIVEN sounds or raw sounds THEN their data is compared", () => {
    const base = new SoundboardSound(sound());
    expect(base.equals(new SoundboardSound(sound()))).toBe(true);
    expect(base.equals(sound())).toBe(true);
    expect(base.equals(sound({ name: "renamed" }))).toBe(false);
    expect(base.equals(sound({ volume: 0.5 }))).toBe(false);
    expect(base.equals(sound({ emoji_name: null }))).toBe(false);
    expect(base.equals(sound({ available: false }))).toBe(false);
    expect(base.equals(sound({ user: { id: "1" } }))).toBe(false);
  });

  test("GIVEN a foreign argument THEN it is false rather than a throw", () => {
    const base = new SoundboardSound(sound());
    expect(base.equals(null)).toBe(false);
    expect(base.equals({ id: "900000000000000090" })).toBe(false);
  });
});

describe("GuildChannel#equals", () => {
  test("GIVEN channels or raw channels THEN their data is compared", () => {
    const base = createChannel(channel()) as { equals(other: unknown): boolean };
    expect(base.equals(createChannel(channel()))).toBe(true);
    expect(base.equals(channel())).toBe(true);
    expect(base.equals(channel({ name: "renamed" }))).toBe(false);
    expect(base.equals(channel({ topic: "howls" }))).toBe(false);
    expect(base.equals(channel({ position: 2 }))).toBe(false);
    expect(base.equals(channel({ type: ChannelType.GuildAnnouncement }))).toBe(false);
    // discord.js does not compare the category.
    expect(base.equals(channel({ parent_id: "5" }))).toBe(true);
  });

  test("GIVEN permission overwrites THEN they are compared in any order", () => {
    const base = createChannel(
      channel({ permission_overwrites: [overwrite("1", "8"), overwrite("2", "0", "16")] }),
    ) as { equals(other: unknown): boolean };
    const reordered = channel({
      permission_overwrites: [overwrite("2", "0", "16"), overwrite("1", "8")],
    });
    expect(base.equals(reordered)).toBe(true);
    expect(base.equals(channel({ permission_overwrites: [overwrite("1", "8")] }))).toBe(false);
    expect(
      base.equals(
        channel({ permission_overwrites: [overwrite("1", "8"), overwrite("2", "0", "32")] }),
      ),
    ).toBe(false);
  });

  test("GIVEN a thread THEN the mixin applies too", () => {
    const base = createChannel(thread()) as { equals(other: unknown): boolean };
    expect(base.equals(thread())).toBe(true);
    expect(base.equals(thread({ name: "renamed" }))).toBe(false);
  });

  test("GIVEN a foreign argument THEN it is false rather than a throw", () => {
    const base = createChannel(channel()) as { equals(other: unknown): boolean };
    expect(base.equals(null)).toBe(false);
    expect(base.equals(undefined)).toBe(false);
    expect(base.equals("general")).toBe(false);
    expect(base.equals({ name: "general" })).toBe(false);
  });
});

function guild(extra: object = {}) {
  return {
    id: guildId,
    name: "Pack",
    icon: null,
    splash: null,
    discovery_splash: null,
    owner_id: "1",
    member_count: 10,
    large: false,
    verification_level: 1,
    features: ["COMMUNITY", "NEWS"],
    afk_timeout: 60,
    ...extra,
  } as never;
}

function user(extra: object = {}) {
  return {
    id: "266624760782258186",
    username: "wolf",
    discriminator: "0",
    global_name: null,
    avatar: null,
    ...extra,
  } as never;
}

function member(extra: object = {}) {
  return {
    guild_id: guildId,
    user: user(),
    nick: null,
    avatar: null,
    banner: null,
    roles: ["1", "2"],
    joined_at: "2026-01-01T00:00:00.000Z",
    flags: 0,
    ...extra,
  } as never;
}

function role(extra: object = {}) {
  return {
    id: "300000000000000030",
    guild_id: guildId,
    name: "pack",
    color: 1,
    colors: { primary_color: 1, secondary_color: null, tertiary_color: null },
    hoist: false,
    position: 1,
    permissions: "8",
    managed: false,
    ...extra,
  } as never;
}

function colors(extra: object) {
  return { colors: { primary_color: 1, secondary_color: null, tertiary_color: null, ...extra } };
}

function primaryGuild(tag: string) {
  return { primary_guild: { identity_guild_id: "1", identity_enabled: true, tag, badge: "b" } };
}

function nameplate(label: string) {
  return { nameplate: { sku_id: "1", asset: "a", label, palette: "crimson" } };
}

describe("Guild#equals", () => {
  test("GIVEN guilds THEN the fields discord.js compares are compared", () => {
    const base = new Guild(guild());
    expect(base.equals(new Guild(guild()))).toBe(true);
    expect(base.equals(new Guild(guild({ name: "renamed" })))).toBe(false);
    expect(base.equals(new Guild(guild({ member_count: 11 })))).toBe(false);
    expect(base.equals(new Guild(guild({ large: true })))).toBe(false);
    expect(base.equals(new Guild(guild({ unavailable: true })))).toBe(false);
    expect(base.equals(new Guild(guild({ verification_level: 2 })))).toBe(false);
    expect(base.equals(new Guild(guild({ features: ["NEWS", "COMMUNITY"] })))).toBe(false);
    // Not part of the discord.js comparison.
    expect(base.equals(new Guild(guild({ afk_timeout: 300 })))).toBe(true);
  });

  test("GIVEN anything but a guild THEN it is false", () => {
    const base = new Guild(guild());
    expect(base.equals(null)).toBe(false);
    expect(base.equals(guild())).toBe(false);
  });
});

describe("GuildMember#equals", () => {
  test("GIVEN members THEN the fields discord.js compares are compared", () => {
    const base = new GuildMember(member());
    const decoration = { avatar_decoration_data: { asset: "a", sku_id: "1" } };
    expect(base.equals(new GuildMember(member()))).toBe(true);
    expect(base.equals(new GuildMember(member({ nick: "alpha" })))).toBe(false);
    expect(base.equals(new GuildMember(member({ banner: "b" })))).toBe(false);
    expect(base.equals(new GuildMember(member({ pending: true })))).toBe(false);
    expect(base.equals(new GuildMember(member({ roles: ["2", "1"] })))).toBe(false);
    expect(base.equals(new GuildMember(member({ joined_at: undefined })))).toBe(false);
    expect(base.equals(new GuildMember(member(decoration)))).toBe(false);
    expect(base.equals(new GuildMember(member({ collectibles: nameplate("a") })))).toBe(false);
  });

  test("GIVEN anything but a member THEN it is false", () => {
    const base = new GuildMember(member());
    expect(base.equals(null)).toBe(false);
    expect(base.equals(member())).toBe(false);
  });
});

describe("Role#equals", () => {
  test("GIVEN roles THEN the fields discord.js compares are compared", () => {
    const base = new Role(role());
    expect(base.equals(new Role(role()))).toBe(true);
    expect(base.equals(new Role(role({ name: "renamed" })))).toBe(false);
    expect(base.equals(new Role(role(colors({ primary_color: 2 }))))).toBe(false);
    expect(base.equals(new Role(role(colors({ secondary_color: 2 }))))).toBe(false);
    expect(base.equals(new Role(role(colors({ tertiary_color: 2 }))))).toBe(false);
    expect(base.equals(new Role(role({ permissions: "16" })))).toBe(false);
    expect(base.equals(new Role(role({ position: 2 })))).toBe(false);
    expect(base.equals(new Role(role({ unicode_emoji: "x" })))).toBe(false);
    expect(base.equals(null)).toBe(false);
  });
});

describe("User#equals", () => {
  test("GIVEN users THEN the fields discord.js compares are compared", () => {
    const base = new User(user());
    const decoration = { avatar_decoration_data: { asset: "a", sku_id: "1" } };
    const tagged = new User(user(primaryGuild("WOLF")));
    expect(base.equals(new User(user()))).toBe(true);
    expect(base.equals(new User(user({ global_name: "Wolf" })))).toBe(false);
    expect(base.equals(new User(user({ public_flags: 1 })))).toBe(false);
    expect(base.equals(new User(user({ accent_color: 1 })))).toBe(false);
    expect(base.equals(new User(user(decoration)))).toBe(false);
    expect(base.equals(new User(user({ collectibles: nameplate("a") })))).toBe(false);
    expect(base.equals(tagged)).toBe(false);
    expect(tagged.equals(new User(user(primaryGuild("PACK"))))).toBe(false);
    expect(base.equals(null)).toBe(false);
  });
});

describe("Embed#equals", () => {
  const raw = {
    title: "a",
    description: "b",
    color: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
    author: { name: "wolf" },
    footer: { text: "pack" },
    fields: [{ name: "n", value: "v" }],
  };

  test("GIVEN embeds THEN their raw data is compared in depth", () => {
    const base = new Embed(raw);
    expect(base.equals(new Embed({ ...raw }))).toBe(true);
    expect(base.equals(new Embed({ ...raw, type: "rich" as never }))).toBe(false);
  });

  test("GIVEN a raw embed THEN the fields discord.js compares are compared", () => {
    const base = new Embed(raw);
    expect(base.equals(raw)).toBe(true);
    // A missing inline is false, the timestamp is compared as a date, and the type is ignored.
    expect(base.equals({ ...raw, fields: [{ name: "n", value: "v", inline: false }] })).toBe(true);
    expect(base.equals({ ...raw, timestamp: "2026-01-01T00:00:00+00:00" })).toBe(true);
    expect(base.equals({ ...raw, type: "rich" as never })).toBe(true);
    expect(base.equals({ ...raw, title: "c" })).toBe(false);
    expect(base.equals({ ...raw, color: undefined })).toBe(false);
    expect(base.equals({ ...raw, author: { name: "fox" } })).toBe(false);
    expect(base.equals({ ...raw, footer: { text: "den" } })).toBe(false);
    expect(base.equals({ ...raw, image: { url: "https://example.com/a.png" } })).toBe(false);
    expect(base.equals({ ...raw, fields: [{ name: "n", value: "v", inline: true }] })).toBe(false);
    expect(base.equals({ ...raw, provider: { name: "p" } })).toBe(false);
    expect(base.equals(null)).toBe(false);
  });
});

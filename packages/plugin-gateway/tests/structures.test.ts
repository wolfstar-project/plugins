import { ChannelType } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { Channel, kClone, kPatch, Role, snowflakeTimestamp, User } from "../src/index.js";

const data = {
  id: "266624760782258186",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

describe("Structure", () => {
  test("GIVEN kPatch THEN the data is merged in place", () => {
    const user = new User(data);

    expect(user[kPatch]({ username: "renamed" })).toBe(user);
    expect(user.username).toBe("renamed");
    expect(user.id).toBe(data.id);
  });

  test("GIVEN kClone THEN the clone is independent from the original", () => {
    const user = new User(data);
    const clone = user[kClone]({ username: "clone" });

    expect(clone).toBeInstanceOf(User);
    expect(clone.username).toBe("clone");
    expect(user.username).toBe("wolf");
  });

  test("GIVEN toJSON THEN a copy of the raw data is returned", () => {
    const user = new User(data);

    expect(user.toJSON()).toEqual(data);
    expect(user.toJSON()).not.toBe(user.toJSON());
  });

  test("GIVEN the input data is mutated THEN the structure is unaffected", () => {
    const raw = { ...data };
    const user = new User(raw);
    raw.username = "mutated";

    expect(user.username).toBe("wolf");
  });
});

describe("User", () => {
  test("GIVEN no avatar THEN the default avatar is used", () => {
    const user = new User(data);

    expect(user.avatarURL()).toBeNull();
    expect(user.displayAvatarURL()).toMatch(
      /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/,
    );
    expect(user.displayName).toBe("wolf");
    expect(`${user}`).toBe(`<@${data.id}>`);
  });

  test("GIVEN an animated avatar THEN the URL defaults to gif", () => {
    const user = new User({ ...data, avatar: "a_hash" });

    expect(user.avatarURL({ size: 64 })).toBe(
      `https://cdn.discordapp.com/avatars/${data.id}/a_hash.gif?size=64`,
    );
    expect(user.avatarURL({ extension: "webp" })).toBe(
      `https://cdn.discordapp.com/avatars/${data.id}/a_hash.webp`,
    );
  });

  test("GIVEN a snowflake THEN its timestamp is extracted", () => {
    expect(new User(data).createdTimestamp).toBe(snowflakeTimestamp(data.id));
    expect(snowflakeTimestamp(data.id)).toBe(1_483_638_696_619);
  });
});

describe("Channel", () => {
  test("GIVEN a thread THEN isThread is true", () => {
    const thread = new Channel({
      id: "1",
      type: ChannelType.PublicThread,
      name: "thread",
    } as never);

    expect(thread.isThread()).toBe(true);
    expect(thread.isDMBased()).toBe(false);
    expect(thread.name).toBe("thread");
  });

  test("GIVEN a DM THEN fields it does not have fall back", () => {
    const dm = new Channel({ id: "1", type: ChannelType.DM, recipients: [] } as never);

    expect(dm.isDMBased()).toBe(true);
    expect(dm.guildId).toBeNull();
    expect(dm.topic).toBeNull();
    expect(dm.nsfw).toBe(false);
    expect(`${dm}`).toBe("<#1>");
  });
});

describe("Role", () => {
  test("GIVEN permissions THEN they are exposed as a bigint", () => {
    const role = new Role({
      id: "1",
      guild_id: "2",
      name: "admin",
      color: 0,
      hoist: false,
      position: 1,
      permissions: "8",
      managed: false,
      mentionable: true,
      flags: 0,
    } as never);

    expect(role.permissions).toBe(8n);
    expect(`${role}`).toBe("<@&1>");
  });
});

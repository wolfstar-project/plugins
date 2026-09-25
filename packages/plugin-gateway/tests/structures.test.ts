import { ChannelType } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  AnnouncementChannel,
  ForumChannel,
  MediaChannel,
  BaseChannel,
  Channel,
  DMChannel,
  kClone,
  kPatch,
  Mixin,
  PublicThreadChannel,
  Role,
  snowflakeTimestamp,
  TextChannel,
  User,
} from "../src/index.js";

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

  test("GIVEN an animated avatar THEN the URL is a gif unless forced static", () => {
    const user = new User({ ...data, avatar: "a_hash" });

    expect(user.avatarURL({ size: 64 })).toBe(
      `https://cdn.discordapp.com/avatars/${data.id}/a_hash.gif?size=64`,
    );
    expect(user.avatarURL({ forceStatic: true })).toBe(
      `https://cdn.discordapp.com/avatars/${data.id}/a_hash.webp`,
    );
  });

  test("GIVEN a snowflake THEN its timestamp is extracted", () => {
    expect(new User(data).createdTimestamp).toBe(snowflakeTimestamp(data.id));
    expect(snowflakeTimestamp(data.id)).toBe(1_483_638_696_619);
  });
});

describe("Channel", () => {
  test("GIVEN announcement, forum, and media channels THEN their slowmode is exposed", () => {
    const channels = [
      new AnnouncementChannel({
        id: "1",
        type: ChannelType.GuildAnnouncement,
        rate_limit_per_user: 5,
      } as never),
      new ForumChannel({ id: "2", type: ChannelType.GuildForum, rate_limit_per_user: 5 } as never),
      new MediaChannel({ id: "3", type: ChannelType.GuildMedia, rate_limit_per_user: 5 } as never),
    ];

    expect(channels.map((channel) => channel.rateLimitPerUser)).toEqual([5, 5, 5]);
  });

  test("GIVEN a text channel THEN its mixins expose the guild channel fields", () => {
    const channel = new TextChannel({
      id: "1",
      type: ChannelType.GuildText,
      guild_id: "2",
      name: "general",
      topic: "hello",
      parent_id: "3",
      position: 4,
      rate_limit_per_user: 5,
    } as never);

    expect(channel).toBeInstanceOf(Channel);
    expect(channel.guildId).toBe("2");
    expect(channel.name).toBe("general");
    expect(channel.topic).toBe("hello");
    expect(channel.parentId).toBe("3");
    expect(channel.position).toBe(4);
    expect(channel.rateLimitPerUser).toBe(5);
    expect(channel.nsfw).toBe(false);
    expect(channel.isThread()).toBe(false);
    expect(`${channel}`).toBe("<#1>");
  });

  test("GIVEN a public thread THEN its thread metadata is exposed", () => {
    const thread = new PublicThreadChannel({
      id: "1",
      type: ChannelType.PublicThread,
      name: "thread",
      owner_id: "9",
      applied_tags: ["7"],
      thread_metadata: {
        archived: true,
        locked: false,
        auto_archive_duration: 60,
        archive_timestamp: "2024-01-01T00:00:00.000Z",
      },
    } as never);

    expect(thread.isThread()).toBe(true);
    expect(thread.name).toBe("thread");
    expect(thread.ownerId).toBe("9");
    expect(thread.appliedTagIds).toEqual(["7"]);
    expect(thread.archived).toBe(true);
    expect(thread.archiveTimestamp).toBe(Date.parse("2024-01-01T00:00:00.000Z"));
    expect(thread.autoArchiveDuration).toBe(60);
  });

  test("GIVEN a DM THEN its recipients are users", () => {
    const dm = new DMChannel({ id: "1", type: ChannelType.DM, recipients: [data] } as never);

    expect(dm.isDMBased()).toBe(true);
    expect(dm.recipients[0]).toBeInstanceOf(User);
    expect(dm.recipients[0]!.username).toBe("wolf");
    expect(dm).not.toHaveProperty("topic");
  });

  test("GIVEN kClone on a mixed channel THEN the clone keeps its class and mixins", () => {
    const channel = new TextChannel({ id: "1", type: ChannelType.GuildText, name: "a" } as never);
    const clone = channel[kClone]({ name: "b" } as never);

    expect(clone).toBeInstanceOf(TextChannel);
    expect(clone.name).toBe("b");
    expect(channel.name).toBe("a");
  });

  test("GIVEN an unknown channel type THEN it falls back to BaseChannel", () => {
    const channel = new BaseChannel({ id: "1", type: 99 } as never);

    expect(channel.type).toBe(99);
    expect(typeof channel.fetch).toBe("function");
  });
});

describe("Mixin", () => {
  test("GIVEN conflicting members THEN the target and the earlier mixins win", () => {
    class First {
      public get value() {
        return "first";
      }

      public only() {
        return "only";
      }
    }

    class Second {
      public get value() {
        return "second";
      }
    }

    class Own {
      public get value() {
        return "own";
      }
    }

    class Target {
      public readonly kind = "target";
    }
    Mixin(Target, [First, Second]);
    Mixin(Own, [First]);

    expect((new Target() as First).value).toBe("first");
    expect((new Target() as First).only()).toBe("only");
    expect(new Own().value).toBe("own");
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

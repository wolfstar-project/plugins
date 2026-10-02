import { describe, expect, test } from "vitest";
import { ChannelType } from "discord-api-types/v10";
import { createChannel, GuildMember, Message, type TextChannel } from "../src/index.js";

// No client is constructed in this file: the getters have no cache to read.
describe("lazy relations without a client", () => {
  test("GIVEN no client was constructed THEN relation getters are null, without throwing", () => {
    const message = new Message({ id: "3", channel_id: "20", guild_id: "10" } as never);
    const member = new GuildMember({ guild_id: "10", roles: [] } as never);

    expect(message.guild).toBeNull();
    expect(message.channel).toBeNull();
    expect(member.guild).toBeNull();
    expect(member.voice).toBeNull();

    const channel = createChannel({
      id: "20",
      type: ChannelType.GuildText,
      guild_id: "10",
      parent_id: "19",
    } as never) as TextChannel;
    expect(channel.guild).toBeNull();
    expect(channel.parent).toBeNull();
    expect(channel.permissionsLocked).toBeNull();
  });
});

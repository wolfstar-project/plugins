import { describe, expect, test } from "vitest";
import {
  GatewayError,
  GatewayErrorCodes,
  GatewayErrorMessages,
  GatewayRangeError,
  GatewaySessionStoreError,
  GatewayTypeError,
  GuildChannelInfoTimeoutError,
  GuildMembersTimeoutError,
  getGatewayClient,
} from "../src/index.js";

describe("GatewayErrorCodes", () => {
  test("GIVEN the messages THEN every code is keyed by itself", () => {
    expect(Object.keys(GatewayErrorCodes)).toEqual(Object.keys(GatewayErrorMessages));
    for (const [key, code] of Object.entries(GatewayErrorCodes)) expect(code).toBe(key);
    expect(Object.isFrozen(GatewayErrorCodes)).toBe(true);
  });
});

describe("GatewayError", () => {
  test("GIVEN a string message THEN it is used as is", () => {
    const error = new GatewayError(GatewayErrorCodes.NotGuildSticker);

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("NotGuildSticker");
    expect(error.message).toBe("Only guild stickers can be edited or deleted");
    expect(error.name).toBe("GatewayError [NotGuildSticker]");
    expect(error.stack).toMatch(/^GatewayError \[NotGuildSticker\]: Only guild stickers/);
  });

  test("GIVEN a message function THEN it is formatted with the arguments", () => {
    const error = new GatewayError(GatewayErrorCodes.ChannelGuildUnknown, "1");
    expect(error.message).toBe("Channel 1 has no known guild");
  });

  test("GIVEN the TypeError and RangeError variants THEN they extend the matching builtin", () => {
    const type = new GatewayTypeError(GatewayErrorCodes.MessageContentType);
    const range = new GatewayRangeError(GatewayErrorCodes.MessageNonceLength);

    expect(type).toBeInstanceOf(TypeError);
    expect(type.name).toBe("GatewayTypeError [MessageContentType]");
    expect(range).toBeInstanceOf(RangeError);
    expect(range.name).toBe("GatewayRangeError [MessageNonceLength]");
  });

  test("GIVEN a subclass THEN its name and code are kept", () => {
    const cause = new Error("down");
    const store = new GatewaySessionStoreError("set", 2, cause);
    const timeout = new GuildMembersTimeoutError("1", "n", 1000);

    expect(store).toBeInstanceOf(GatewayError);
    expect(store.name).toBe("GatewaySessionStoreError [SessionStoreFailed]");
    expect(store.message).toBe("Cannot write the session of shard 2 in the session store");
    expect(store.cause).toBe(cause);
    expect(timeout.code).toBe(GatewayErrorCodes.GuildMembersTimeout);

    const info = new GuildChannelInfoTimeoutError("1", 1000);
    expect(info).toBeInstanceOf(GatewayError);
    expect(info.name).toBe("GuildChannelInfoTimeoutError [GuildChannelInfoTimeout]");
    expect(info.message).toBe("Requesting the channel info of guild 1 took longer than 1000ms");
  });

  test("GIVEN a thrown error of the package THEN it carries its code", () => {
    expect(() => getGatewayClient()).toThrow(
      expect.objectContaining({ code: GatewayErrorCodes.ClientNotConstructed }),
    );
  });
});

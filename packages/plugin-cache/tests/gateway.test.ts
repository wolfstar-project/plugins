import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { attachCacheToGateway, createInMemoryCache } from "../src/index.js";

describe("attachCacheToGateway", () => {
  test("caches dispatches and stops when detached", async () => {
    const cache = createInMemoryCache();
    let listener: ((payload: GatewayDispatchPayload, shardId: number) => void) | undefined;
    const gateway = {
      on: vi.fn((_event: "dispatch", callback: typeof listener) => {
        listener = callback;
      }),
      off: vi.fn((_event: "dispatch", callback: typeof listener) => {
        if (listener === callback) listener = undefined;
      }),
    };
    const detach = attachCacheToGateway(gateway, cache);
    const payload = {
      op: GatewayOpcodes.Dispatch,
      s: 1,
      t: GatewayDispatchEvents.UserUpdate,
      d: { id: "1", username: "wolf", discriminator: "0", global_name: null, avatar: null },
    } as GatewayDispatchPayload;

    listener!(payload, 0);
    await vi.waitFor(() => expect(cache.users.get("1")?.username).toBe("wolf"));

    detach();
    expect(listener).toBeUndefined();
    expect(gateway.off).toHaveBeenCalledWith("dispatch", expect.any(Function));
  });
});

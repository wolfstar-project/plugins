import { Client, container } from "@wolfstar/http-framework";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Server } from "../src/lib/structures/http/Server";
import apiPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

function createClient(options: Partial<ConstructorParameters<typeof Client>[0]>): Client {
  return new Client({ ...base, ...options });
}

afterEach(() => vi.restoreAllMocks());

describe("apiPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((apiPlugin() as { name: string }).name).toBe("@wolfstar/plugin-api");
  });

  test("GIVEN a client THEN the server is created and its stores registered", () => {
    createClient({ plugins: [apiPlugin({ automaticallyConnect: false })] });

    expect(container.server).toBeInstanceOf(Server);
    expect(container.stores.get("routes")).toBe(container.server.routes);
    expect(container.stores.get("middlewares")).toBe(container.server.middlewares);
  });

  test("GIVEN factory options THEN the server uses them", () => {
    createClient({ plugins: [apiPlugin({ prefix: "/api", automaticallyConnect: false })] });

    expect(container.server.options.prefix).toBe("/api");
  });

  test("GIVEN only ClientOptions.api THEN the server uses it, as with ./register", () => {
    createClient({
      api: { prefix: "/client", automaticallyConnect: false },
      plugins: [apiPlugin()],
    });

    expect(container.server.options.prefix).toBe("/client");
  });

  test("GIVEN neither factory nor client options THEN the server gets the defaults", () => {
    createClient({ plugins: [apiPlugin()] });

    expect(container.server.options).toEqual({});
  });

  test("GIVEN ClientOptions.api THEN it is merged over the factory options", () => {
    createClient({
      api: { prefix: "/client", automaticallyConnect: false },
      plugins: [apiPlugin({ prefix: "/factory", origin: "https://example.com" })],
    });

    expect(container.server.options).toEqual({
      prefix: "/client",
      origin: "https://example.com",
      automaticallyConnect: false,
    });
  });

  test("GIVEN the client options THEN the plugin does not mutate them", () => {
    const clientOptions = { ...base, api: { prefix: "/client" } };

    createClient({
      ...clientOptions,
      plugins: [apiPlugin({ origin: "https://example.com", automaticallyConnect: false })],
    });

    expect(clientOptions.api).toEqual({ prefix: "/client" });
  });

  test("GIVEN postListen WHEN automaticallyConnect is false in the factory options THEN it does not connect", async () => {
    const plugin = apiPlugin({ automaticallyConnect: false });
    const client = createClient({ plugins: [plugin] });
    const connect = vi.spyOn(container.server, "connect").mockResolvedValue(undefined as never);

    await plugin.postListen!(client, client.options);

    expect(connect).not.toHaveBeenCalled();
  });

  test("GIVEN postListen WHEN ClientOptions.api disables automaticallyConnect over the factory THEN it does not connect", async () => {
    const plugin = apiPlugin({ automaticallyConnect: true });
    const client = createClient({
      api: { automaticallyConnect: false },
      plugins: [plugin],
    });
    const connect = vi.spyOn(container.server, "connect").mockResolvedValue(undefined as never);

    await plugin.postListen!(client, client.options);

    expect(connect).not.toHaveBeenCalled();
  });

  test("GIVEN postListen WHEN automaticallyConnect is unset THEN it connects", async () => {
    const plugin = apiPlugin();
    const client = createClient({ plugins: [plugin] });
    const connect = vi.spyOn(container.server, "connect").mockResolvedValue(undefined as never);

    await plugin.postListen!(client, client.options);

    expect(connect).toHaveBeenCalledOnce();
  });

  test("GIVEN postListen WHEN listen options come from the factory THEN the server listens on them", async () => {
    const plugin = apiPlugin({ listenOptions: { port: 0, host: "127.0.0.1" } });
    const client = createClient({ plugins: [plugin] });

    try {
      await plugin.postListen!(client, client.options);

      expect(container.server.server.listening).toBe(true);
      const address = container.server.server.address();
      expect(address).toMatchObject({ address: "127.0.0.1" });
    } finally {
      if (container.server.server.listening) await container.server.disconnect();
    }
  });
});

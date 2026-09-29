import { container } from "@sapphire/pieces";
import { createServer, type Server as NetServer } from "node:net";
import { Server, ServerEvent } from "../src/lib/structures/http/Server";

function listenOnFreePort(): Promise<{ blocker: NetServer; port: number }> {
  return new Promise((resolve) => {
    const blocker = createServer();
    blocker.listen(0, "127.0.0.1", () => {
      const address = blocker.address();
      resolve({ blocker, port: typeof address === "object" && address ? address.port : 0 });
    });
  });
}

describe("Server", () => {
  const previous = (container as unknown as { server?: unknown }).server;

  afterEach(() => {
    (container as unknown as { server?: unknown }).server = previous;
  });

  it("given a port already in use then connect rejects with EADDRINUSE (Review Focus 1)", async () => {
    const { blocker, port } = await listenOnFreePort();
    try {
      const server = new Server({ listenOptions: { port, host: "127.0.0.1" } });
      await expect(server.connect()).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it("given an error listener then server errors are forwarded to it instead of throwing", async () => {
    const { blocker, port } = await listenOnFreePort();
    try {
      const server = new Server({ listenOptions: { port, host: "127.0.0.1" } });
      const received: Error[] = [];
      server.on(ServerEvent.Error, (error) => {
        received.push(error);
      });
      await expect(server.connect()).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(received[0]).toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it("given connect then disconnect the server starts and stops cleanly", async () => {
    const server = new Server({ listenOptions: { port: 0, host: "127.0.0.1" } });
    await server.connect();
    await server.disconnect();
  });
});

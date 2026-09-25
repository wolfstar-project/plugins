// A shard of the integration tests. It registers the resolve hook itself, so it also works as a worker thread.
import "./register.mjs";

const { ShardClient } = await import("../../src/index.ts");
const { threadId } = await import("node:worker_threads");

const client = new ShardClient();
client.setRequestHandler(async (body, { signal }) => {
  if (body?.type === "slow") {
    // Answers only once aborted, reporting the abort to the manager.
    return new Promise((resolve) => {
      signal.addEventListener("abort", () => {
        void client.send({ aborted: body.from }).then(() => resolve(null));
      });
    });
  }

  if (body?.type === "askAndCrash") {
    void client
      .request({ type: "slow", from: client.id }, { to: body.to, timeout: 60_000 })
      .catch(() => null);
    setTimeout(() => process.exit(1), 200);
    return null;
  }

  if (body?.type === "ask")
    return client.request({ type: "hello", from: client.id }, { to: body.to });
  if (body?.type === "hello") return `hello ${body.from} from ${client.id}`;
  return {
    id: client.id,
    shards: client.shards,
    pid: process.pid,
    threadId,
    token: process.env.DISCORD_TOKEN ?? null,
    body,
  };
});
client.on("message", (body, from) => void client.send({ echo: body, from }));
await client.ready();

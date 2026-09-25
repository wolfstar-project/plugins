// A shard of the integration tests. It registers the resolve hook itself, so it also works as a worker thread.
import "./register.mjs";

const { ShardClient } = await import("../../src/index.ts");
const { threadId } = await import("node:worker_threads");

const client = new ShardClient();
client.setRequestHandler(async (body) => {
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

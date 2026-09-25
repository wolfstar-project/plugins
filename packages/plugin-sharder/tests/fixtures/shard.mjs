// A shard of the integration tests. It registers the resolve hook itself, so it also works as a worker thread.
import "./register.mjs";

const { ShardClient } = await import("../../src/index.ts");
const { threadId } = await import("node:worker_threads");

const client = new ShardClient();
client.setRequestHandler((body) => ({
  id: client.id,
  shards: client.shards,
  pid: process.pid,
  threadId,
  body,
}));
client.on("message", (body, from) => void client.send({ echo: body, from }));
await client.ready();

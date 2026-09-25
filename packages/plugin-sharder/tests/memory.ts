import type { ChannelData } from "../src/messages/MessageHandler.js";
import {
  ShardClient,
  type ChannelStrategy,
  type ClientTransport,
  type ShardClientOptions,
  type ShardContext,
  type ShardTransport,
  type ShardTransportEvents,
} from "../src/index.js";

/**
 * What a test shard runs, with the number of times its shard was spawned before.
 */
export type ShardScript = (client: ShardClient, spawns: number) => void;

/**
 * Runs every shard in the test's own thread, over an in-memory channel.
 */
export class MemoryStrategy implements ChannelStrategy {
  public readonly transport = "worker";
  public readonly clients: ShardClient[] = [];
  readonly #spawns = new Map<number, number>();
  readonly #exits = new Map<number, (code: number | null) => void>();
  readonly #script: ShardScript;
  readonly #options: Omit<ShardClientOptions, "context" | "transport">;

  public constructor(
    script: ShardScript,
    options: Omit<ShardClientOptions, "context" | "transport"> = {},
  ) {
    this.#script = script;
    this.#options = options;
  }

  /**
   * Stops a shard without it signalling anything, like a crash.
   *
   * @param id The ID of the shard.
   * @param code The exit code.
   */
  public crash(id: number, code: number): void {
    this.#exits.get(id)?.(code);
  }

  public spawn(context: ShardContext, events: ShardTransportEvents): ShardTransport {
    let alive = true;
    let deliver: ((data: ChannelData) => void) | null = null;
    const exit = (code: number | null) => {
      if (!alive) return;
      alive = false;
      events.exit(code);
    };

    const transport: ClientTransport = {
      send: async (data) => {
        if (alive) queueMicrotask(() => alive && events.message(data));
      },
      onMessage: (listener) => {
        deliver = listener;
      },
      onDisconnect: () => undefined,
      exit,
    };

    this.#exits.set(context.id, exit);
    const spawns = this.#spawns.get(context.id) ?? 0;
    this.#spawns.set(context.id, spawns + 1);
    setImmediate(() => {
      if (!alive) return;
      const client = new ShardClient({ ...this.#options, context, transport });
      this.clients.push(client);
      this.#script(client, spawns);
    });

    return {
      send: async (data) => {
        if (alive) queueMicrotask(() => alive && deliver?.(data));
      },
      kill: async () => exit(null),
    };
  }
}

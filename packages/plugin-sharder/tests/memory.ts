import {
  ShardClient,
  type ChannelStrategy,
  type ClientTransport,
  type ShardClientOptions,
  type ShardContext,
  type ShardTransport,
  type ShardTransportEvents,
  type SpawnOptions,
} from "../src/index.js";

/**
 * What a test shard runs, with the number of times its channel was spawned before.
 */
export type ShardScript = (client: ShardClient, spawns: number) => void;

interface Running {
  exit(code: number | null): void;
  muted: boolean;
}

/**
 * Runs every shard in the test's own thread, over an in-memory channel.
 */
export class MemoryStrategy implements ChannelStrategy {
  public readonly name = "memory";
  public readonly clients: ShardClient[] = [];
  public readonly spawned: { context: ShardContext; options: SpawnOptions }[] = [];
  readonly #spawns = new Map<number, number>();
  readonly #running = new Map<number, Running>();
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
   */
  public crash(id: number, code: number): void {
    this.#running.get(id)?.exit(code);
  }

  /**
   * Drops everything a shard sends, like a frozen process.
   */
  public mute(id: number): void {
    const running = this.#running.get(id);
    if (running) running.muted = true;
  }

  /**
   * The last client spawned for a channel.
   */
  public client(id: number): ShardClient {
    return this.clients.findLast((client) => client.id === id)!;
  }

  public spawn(
    context: ShardContext,
    events: ShardTransportEvents,
    options: SpawnOptions,
  ): ShardTransport {
    let alive = true;
    let deliver: ((data: unknown) => void) | null = null;
    const running: Running = {
      muted: false,
      exit: (code) => {
        if (!alive) return;
        alive = false;
        events.exit(code);
      },
    };

    const transport: ClientTransport = {
      send: async (data) => {
        if (alive && !running.muted) queueMicrotask(() => alive && events.message(data));
      },
      onMessage: (listener) => {
        deliver = listener;
      },
      onDisconnect: () => undefined,
      exit: running.exit,
    };

    this.#running.set(context.id, running);
    this.spawned.push({ context, options });
    const spawns = this.#spawns.get(context.id) ?? 0;
    this.#spawns.set(context.id, spawns + 1);
    setImmediate(() => {
      if (!alive) return;
      const client = new ShardClient({ ...this.#options, context, transport });
      this.clients.push(client);
      this.#script(client, spawns);
    });

    return {
      pid: 1,
      send: async (data) => {
        if (alive) queueMicrotask(() => alive && deliver?.(data));
      },
      kill: async () => running.exit(null),
    };
  }
}

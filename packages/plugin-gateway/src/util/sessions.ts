import type { GatewaySessionInfo, GatewaySessionStore } from "@wolfstar/plugin-cache";
import { GatewaySessionStoreError } from "./errors.js";

/**
 * Sits between `@discordjs/ws` and a {@link GatewaySessionStore}, which `@discordjs/ws` would otherwise read on every
 * dispatch and heartbeat, and write on every sequence change, while holding the dispatch back.
 *
 * @remarks
 * The session of a shard is read from the store once, when the shard first connects, then served from memory. Writes
 * never hold a dispatch back either: they run in the background, one at a time per shard, and the ones queued while a
 * write is in flight collapse into a single write of the latest session. A stored sequence is therefore slightly
 * behind after a crash, which Discord handles by replaying the dispatches since then.
 *
 * @internal
 */
export class GatewaySessionMirror {
  readonly #store: GatewaySessionStore;
  readonly #timeout: number | null;
  readonly #onError: (error: GatewaySessionStoreError) => void;
  readonly #sessions = new Map<number, GatewaySessionInfo | null>();
  // The shards with a write waiting for the one in flight, and the session it will write.
  readonly #pending = new Map<number, GatewaySessionInfo | null>();
  readonly #writes = new Map<number, Promise<void>>();

  public constructor(
    store: GatewaySessionStore,
    timeout: number | null,
    onError: (error: GatewaySessionStoreError) => void,
  ) {
    this.#store = store;
    this.#timeout = timeout;
    this.#onError = onError;
  }

  public async get(shardId: number): Promise<GatewaySessionInfo | null> {
    if (this.#sessions.has(shardId)) return this.#sessions.get(shardId)!;

    const session = await this.read(shardId);
    // A session written while reading is newer than the stored one.
    if (!this.#sessions.has(shardId)) this.#sessions.set(shardId, session);
    return this.#sessions.get(shardId)!;
  }

  public set(shardId: number, info: GatewaySessionInfo | null): void {
    this.#sessions.set(shardId, info);

    const queued = this.#pending.has(shardId);
    this.#pending.set(shardId, info);
    if (queued) return;

    const previous = this.#writes.get(shardId) ?? Promise.resolve();
    this.#writes.set(
      shardId,
      previous.then(() => this.write(shardId)),
    );
  }

  /**
   * Resolves once every session written so far reached the store.
   */
  public async flush(): Promise<void> {
    await Promise.all(this.#writes.values());
  }

  private async read(shardId: number): Promise<GatewaySessionInfo | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const read = Promise.resolve(this.#store.get(shardId));
      if (this.#timeout === null) return await read;

      const timeout = this.#timeout;
      // A hanging store (e.g. a Redis client queueing commands while reconnecting) must not hold the shard back.
      return await Promise.race([
        read,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Timed out after ${timeout}ms`)), timeout);
        }),
      ]);
    } catch (error) {
      // Identifying costs more than resuming, but a shard that cannot tell its session still connects.
      this.#onError(new GatewaySessionStoreError("get", shardId, error));
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async write(shardId: number): Promise<void> {
    const info = this.#pending.get(shardId)!;
    this.#pending.delete(shardId);
    try {
      await this.#store.set(shardId, info);
    } catch (error) {
      this.#onError(new GatewaySessionStoreError("set", shardId, error));
    }
  }
}

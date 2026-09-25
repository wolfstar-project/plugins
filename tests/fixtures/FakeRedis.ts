import type { RedisClientLike, RedisTransactionLike } from "@wolfstar/plugin-cache";

function score(value: string | number): number {
  if (value === "+inf") return Infinity;
  if (value === "-inf") return -Infinity;
  return Number(value);
}

/**
 * A minimal in-memory Redis, honouring `PX` expirations through `Date.now()`.
 *
 * @remarks
 * Set {@link FakeRedis.failure} to make every command reject, simulating an outage, and
 * {@link FakeRedis.abortTransactions} to make `exec` resolve to `null`, like a transaction aborted by `WATCH`.
 */
export class FakeRedis implements RedisClientLike {
  public readonly strings = new Map<string, { value: string; expiresAt: number }>();
  public readonly sortedSets = new Map<string, Map<string, number>>();
  public failure: Error | null = null;
  public abortTransactions = false;

  public async get(key: string) {
    this.check();
    return this.read(key);
  }

  public async mget(...keys: string[]) {
    this.check();
    return keys.map((key) => this.read(key));
  }

  public async set(key: string, value: string, _mode?: "PX", milliseconds?: number) {
    this.check();
    return this.setSync(key, value, milliseconds);
  }

  public async del(...keys: string[]) {
    this.check();
    return this.delSync(keys);
  }

  public async exists(...keys: string[]) {
    this.check();
    return keys.filter((key) => this.read(key) !== null).length;
  }

  public async zadd(key: string, ...scoreMembers: (string | number)[]) {
    this.check();
    return this.zaddSync(key, scoreMembers);
  }

  public async zrem(key: string, ...members: string[]) {
    this.check();
    return this.zremSync(key, members);
  }

  public async zrange(key: string, _start: string, _stop: string) {
    this.check();
    return [...this.sortedSet(key).entries()]
      .toSorted(([, a], [, b]) => a - b)
      .map(([member]) => member);
  }

  public async zcard(key: string) {
    this.check();
    return this.sortedSet(key).size;
  }

  public async zremrangebyscore(key: string, min: number | string, max: number | string) {
    this.check();
    return this.zremrangebyscoreSync(key, min, max);
  }

  public multi(): RedisTransactionLike {
    const queue: (() => unknown)[] = [];
    const transaction: RedisTransactionLike = {
      set: (key: string, value: string, _mode?: "PX", milliseconds?: number) => {
        queue.push(() => this.setSync(key, value, milliseconds));
        return transaction;
      },
      del: (...keys: string[]) => {
        queue.push(() => this.delSync(keys));
        return transaction;
      },
      zadd: (key: string, ...scoreMembers: (string | number)[]) => {
        queue.push(() => this.zaddSync(key, scoreMembers));
        return transaction;
      },
      zrem: (key: string, ...members: string[]) => {
        queue.push(() => this.zremSync(key, members));
        return transaction;
      },
      zremrangebyscore: (key: string, min: number | string, max: number | string) => {
        queue.push(() => this.zremrangebyscoreSync(key, min, max));
        return transaction;
      },
      exec: async () => {
        this.check();
        if (this.abortTransactions) return null;
        return queue.map((command) => [null, command()] as [null, unknown]);
      },
    } as RedisTransactionLike;
    return transaction;
  }

  private check() {
    if (this.failure) throw this.failure;
  }

  private setSync(key: string, value: string, milliseconds?: number) {
    this.strings.set(key, {
      value,
      expiresAt: milliseconds === undefined ? Infinity : Date.now() + milliseconds,
    });
    return "OK";
  }

  private delSync(keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      if ((this.read(key) !== null && this.strings.delete(key)) || this.sortedSets.delete(key))
        deleted++;
    }
    return deleted;
  }

  private zaddSync(key: string, scoreMembers: (string | number)[]) {
    const set = this.sortedSet(key);
    for (let index = 0; index < scoreMembers.length; index += 2) {
      set.set(String(scoreMembers[index + 1]), score(scoreMembers[index]!));
    }
    return scoreMembers.length / 2;
  }

  private zremSync(key: string, members: string[]) {
    const set = this.sortedSet(key);
    return members.filter((member) => set.delete(member)).length;
  }

  private zremrangebyscoreSync(key: string, min: number | string, max: number | string) {
    const set = this.sortedSet(key);
    let removed = 0;
    for (const [member, value] of set) {
      if (value >= score(min) && value <= score(max)) {
        set.delete(member);
        removed++;
      }
    }
    return removed;
  }

  private read(key: string): string | null {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  private sortedSet(key: string) {
    let set = this.sortedSets.get(key);
    if (!set) this.sortedSets.set(key, (set = new Map()));
    return set;
  }
}

import { EventEmitter } from "node:events";

/**
 * In-memory stand-ins for the parts of `bullmq` the handler touches, installed with `vi.mock("bullmq")`. They record
 * their calls instead of talking to Redis.
 */

export interface FakeJob {
  id: string;
  name: string;
  data: unknown;
  opts: unknown;
  remove: () => Promise<void>;
}

/** Thrown by a processor to tell the worker the job was moved elsewhere and must be left alone. */
export class DelayedError extends Error {
  public constructor(message = "delayed") {
    super(message);
    this.name = "DelayedError";
  }
}

export interface Call {
  method: string;
  args: unknown[];
}

export const ConnectionErrorMessage = "connect ECONNREFUSED";

export function isNotConnectionError(error: Error): boolean {
  return error.message !== ConnectionErrorMessage;
}

export class Queue extends EventEmitter {
  public static instances: Queue[] = [];

  public readonly calls: Call[] = [];
  public readonly jobs = new Map<string, FakeJob>();
  public readonly schedulers = new Map<
    string,
    { key: string; repeat: unknown; template: unknown }
  >();
  public closed = false;
  #nextId = 1;

  public constructor(
    public readonly name: string,
    public readonly opts: unknown,
  ) {
    super();
    Queue.instances.push(this);
  }

  public async add(name: string, data: unknown, opts?: unknown): Promise<FakeJob> {
    this.calls.push({ method: "add", args: [name, data, opts] });
    return this.#createJob(name, data, opts);
  }

  public async upsertJobScheduler(
    key: string,
    repeat: unknown,
    template: { name: string; data: unknown; opts?: unknown },
  ): Promise<FakeJob> {
    this.calls.push({ method: "upsertJobScheduler", args: [key, repeat, template] });
    this.schedulers.set(key, { key, repeat, template });
    return this.#createJob(template.name, template.data, template.opts);
  }

  public async removeJobScheduler(key: string): Promise<boolean> {
    this.calls.push({ method: "removeJobScheduler", args: [key] });
    return this.schedulers.delete(key);
  }

  public async getJob(id: string): Promise<FakeJob | undefined> {
    return this.jobs.get(id);
  }

  public async getJobs(...args: unknown[]): Promise<FakeJob[]> {
    this.calls.push({ method: "getJobs", args });
    return [...this.jobs.values()];
  }

  public async getJobSchedulers(...args: unknown[]): Promise<unknown[]> {
    this.calls.push({ method: "getJobSchedulers", args });
    return [...this.schedulers.values()];
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  #createJob(name: string, data: unknown, opts: unknown): FakeJob {
    const id = String(this.#nextId++);
    const job: FakeJob = {
      id,
      name,
      data,
      opts,
      remove: async () => void this.jobs.delete(id),
    };
    this.jobs.set(id, job);
    return job;
  }
}

export class Worker extends EventEmitter {
  public static instances: Worker[] = [];

  public runs = 0;
  public closed = false;
  /** What `run()` settles with; a pending promise by default, like a worker that keeps consuming. */
  public runResult: Promise<void> = new Promise(() => {});

  public constructor(
    public readonly name: string,
    public readonly processor: (
      job: { name: string; data: unknown },
      token?: string,
    ) => Promise<unknown>,
    public readonly opts: Record<string, unknown>,
  ) {
    super();
    Worker.instances.push(this);
  }

  public run(): Promise<void> {
    this.runs++;
    return this.runResult;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

export function resetBullmq(): void {
  Queue.instances.length = 0;
  Worker.instances.length = 0;
}

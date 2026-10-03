import { container } from "@wolfstar/http-framework";
import { Stopwatch } from "@sapphire/stopwatch";
import {
  isNotConnectionError,
  Queue,
  Worker,
  type Job,
  type JobSchedulerTemplateOptions,
  type JobsOptions,
  type QueueOptions,
  type RepeatOptions,
  type WorkerOptions,
} from "bullmq";
import type { ScheduledTaskCustomJobOptions } from "./structures/ScheduledTask.js";
import type { ScheduledTaskStore } from "./structures/ScheduledTaskStore.js";
import { ScheduledTaskEvents } from "./types/ScheduledTaskEvents.js";
import type {
  BullClient,
  ScheduledTaskCreateRepeatedTask,
  ScheduledTaskHandlerOptions,
  ScheduledTaskListOptions,
  ScheduledTaskListRepeatedOptions,
  ScheduledTaskListRepeatedReturnType,
  ScheduledTasksJob,
  ScheduledTasksKeys,
  ScheduledTasksKeysNoPayload,
  ScheduledTasksPayload,
  ScheduledTasksResolvable,
  ScheduledTasksResolvablePayload,
  ScheduledTasksTaskOptions,
} from "./types/ScheduledTaskTypes.js";

export class ScheduledTaskHandler {
  /**
   * The queue options for the scheduled task handler.
   */
  public readonly options: QueueOptions;

  /**
   * The name of the queue associated with the scheduled task handler.
   */
  public readonly queue: string;

  #client: BullClient;
  #worker: Worker;
  #started = false;

  public constructor(options: ScheduledTaskHandlerOptions) {
    this.queue = options.queue ?? "scheduled-tasks";
    this.options = options.bull;

    this.#client = new Queue(this.queue, this.options);
    // `autorun: false`: the worker only starts consuming in `start()`, once the task pieces are loaded. A worker
    // that ran from here would take jobs whose piece is not in the store yet, and they would be lost as not found.
    this.#worker = new Worker(
      this.queue,
      async (job) => this.run({ name: job.name as ScheduledTasksKeys, payload: job.data }),
      { ...toWorkerOptions(this.options), autorun: false },
    );

    this.#client.on("error", (error) => {
      if (isNotConnectionError(error)) {
        container.client.emit(ScheduledTaskEvents.ScheduledTaskStrategyClientError, error);
      } else {
        container.client.emit(ScheduledTaskEvents.ScheduledTaskStrategyConnectError, error);
      }
    });
    this.#worker.on("error", (error) => this.#emitWorkerError(error));
  }

  public get client(): BullClient {
    return this.#client;
  }

  /**
   * Starts the worker, which runs the tasks as their jobs become due. Calling it again does nothing.
   *
   * @remarks
   * The plugin calls it from `postListen`, after the task pieces are loaded.
   */
  public start(): void {
    if (this.#started) return;
    this.#started = true;

    // `run()` only settles when the worker closes, so it is not awaited.
    this.#worker.run().catch((error: Error) => this.#emitWorkerError(error));
  }

  /**
   * Closes the internal client and worker.
   */
  public async close(): Promise<void> {
    await Promise.all([this.#client.close(), this.#worker.close()]);
  }

  /**
   * Creates a scheduled task.
   *
   * @param task - The task to be scheduled.
   * @param options - The options for the task, or the delay in milliseconds.
   *
   * @remarks
   * A repeated task is a BullMQ job scheduler whose id is the task's name: creating it again replaces its schedule,
   * and the returned job is its next run.
   */
  public async create<T extends ScheduledTasksResolvable>(
    task: T,
    options?: ScheduledTasksTaskOptions | number,
  ): Promise<ScheduledTasksJob<T>> {
    const { name: taskName, payload } = this.resolveTask(task);

    if (options === undefined || options === null) {
      return this.#client.add(taskName, payload) as Promise<ScheduledTasksJob<T>>;
    }

    if (typeof options === "number") {
      options = { repeated: false, delay: options };
    }

    const { repeated, pattern, interval, delay, customJobOptions, timezone } = options;

    if (repeated) {
      const repeat: Omit<RepeatOptions, "key"> = interval
        ? { every: interval }
        : { pattern, tz: timezone };

      return this.#client.upsertJobScheduler(taskName, repeat, {
        name: taskName,
        data: payload,
        opts: toSchedulerTemplateOptions(customJobOptions),
      }) as Promise<ScheduledTasksJob<T>>;
    }

    const jobOptions: JobsOptions = { delay, ...customJobOptions };
    return this.#client.add(taskName, payload, jobOptions) as Promise<ScheduledTasksJob<T>>;
  }

  /**
   * Creates repeated tasks.
   *
   * @param tasks - An optional array of tasks to create. If not provided, it will create tasks based on the stored repeated tasks.
   */
  public async createRepeated(tasks?: ScheduledTaskCreateRepeatedTask[]): Promise<void> {
    tasks ??= this.store.repeatedTasks.map((piece) => ({
      name: piece.name as ScheduledTasksKeysNoPayload,
      options: {
        repeated: true,
        ...(piece.interval
          ? { interval: piece.interval, customJobOptions: piece.customJobOptions }
          : {
              pattern: piece.pattern!,
              timezone: piece.timezone,
              customJobOptions: piece.customJobOptions,
            }),
      },
    }));

    for (const task of tasks) {
      await this.create(task.name, task.options);
    }
  }

  /**
   * Deletes a scheduled task by its ID.
   *
   * @param id - The ID of the task to delete.
   *
   * @remarks
   * This removes a job. To stop a repeated task, use {@link ScheduledTaskHandler.deleteRepeated}.
   */
  public async delete(id: string): Promise<void> {
    const job = await this.#client.getJob(id);
    return job?.remove();
  }

  /**
   * Deletes a repeated task: its job scheduler and the next run it had queued.
   *
   * @param name - The name of the repeated task.
   * @returns Whether a repeated task of that name existed.
   */
  public deleteRepeated(name: string): Promise<boolean> {
    return this.#client.removeJobScheduler(name);
  }

  /**
   * Retrieves a list of scheduled tasks based on the provided options.
   *
   * @param options - The options for filtering the list of scheduled tasks.
   */
  public list(options: ScheduledTaskListOptions): Promise<Job<unknown>[]> {
    const { types, start, end, asc } = options;

    return this.#client.getJobs(types, start, end, asc);
  }

  /**
   * Retrieves a list of repeated scheduled tasks based on the provided options.
   *
   * @param options - The options for filtering the list of repeated scheduled tasks.
   */
  public listRepeated(
    options: ScheduledTaskListRepeatedOptions = {},
  ): Promise<ScheduledTaskListRepeatedReturnType> {
    const { start, end, asc } = options;

    return this.#client.getJobSchedulers(start, end, asc);
  }

  /**
   * Retrieves a scheduled task by its ID.
   *
   * @param id - The ID of the scheduled task to retrieve.
   */
  public async get<T extends ScheduledTasksKeys = ScheduledTasksKeys>(
    id: string,
  ): Promise<Job<ScheduledTasksPayload<T>> | undefined> {
    const job = await this.#client.getJob(id);
    return (job as Job<ScheduledTasksPayload<T>> | undefined) ?? undefined;
  }

  /**
   * Runs a scheduled task with the given name and payload.
   *
   * @param task - The name of the scheduled task to run.
   * @returns The duration of the run in milliseconds.
   *
   * @remarks `undefined` will be returned if the task was not found.
   */
  public async run(task: ScheduledTasksResolvable): Promise<number | undefined> {
    const { name: taskName, payload } = this.resolveTask(task);
    const piece = this.store.get(taskName);

    if (!piece) {
      container.client.emit(ScheduledTaskEvents.ScheduledTaskNotFound, taskName, payload);

      return undefined;
    }

    let duration: number;
    try {
      container.client.emit(ScheduledTaskEvents.ScheduledTaskRun, piece, payload);

      const stopwatch = new Stopwatch();
      const result = await piece.run(payload);
      ({ duration } = stopwatch.stop());

      container.client.emit(
        ScheduledTaskEvents.ScheduledTaskSuccess,
        piece,
        payload,
        result,
        duration,
      );
    } catch (error) {
      container.client.emit(ScheduledTaskEvents.ScheduledTaskError, error, piece, payload);
      throw error;
    }

    container.client.emit(ScheduledTaskEvents.ScheduledTaskFinished, piece, duration, payload);

    return duration;
  }

  private get store(): ScheduledTaskStore {
    return container.stores.get("scheduled-tasks");
  }

  private resolveTask(task: ScheduledTasksResolvable): ScheduledTasksResolvablePayload {
    if (typeof task === "string") {
      return { name: task, payload: undefined };
    }

    if ("payload" in task) {
      return { name: task.name, payload: task.payload };
    }

    return { name: task.name, payload: undefined };
  }

  #emitWorkerError(error: Error): void {
    if (isNotConnectionError(error)) {
      container.client.emit(ScheduledTaskEvents.ScheduledTaskStrategyWorkerError, error);
    } else {
      container.client.emit(ScheduledTaskEvents.ScheduledTaskStrategyConnectError, error);
    }
  }
}

/**
 * The queue options a worker has to share with its queue to consume from it: the connection, and above all the key
 * `prefix`, without which the worker would wait on `bull:<queue>` for jobs the queue adds under `<prefix>:<queue>`.
 * The rest of {@link QueueOptions} only concerns the queue.
 */
function toWorkerOptions(options: QueueOptions): WorkerOptions {
  const workerOptions: WorkerOptions = { connection: options.connection };

  // Only the keys that are set: BullMQ spreads the options over its defaults, so an explicit `prefix: undefined`
  // would replace the default `bull` prefix instead of leaving it alone.
  for (const key of SharedQueueOptions) {
    if (options[key] !== undefined) Object.assign(workerOptions, { [key]: options[key] });
  }

  return workerOptions;
}

const SharedQueueOptions = [
  "prefix",
  "blockingConnection",
  "skipVersionCheck",
  "skipWaitingForReady",
  "telemetry",
] as const satisfies readonly (keyof QueueOptions & keyof WorkerOptions)[];

/**
 * A job scheduler's template does not take the options that only make sense for a single job: BullMQ derives the
 * job id and the delay from the schedule itself.
 */
function toSchedulerTemplateOptions(
  options: ScheduledTaskCustomJobOptions | undefined,
): JobSchedulerTemplateOptions | undefined {
  if (options === undefined) return undefined;

  const { jobId: _jobId, delay: _delay, deduplication: _deduplication, ...template } = options;
  return template;
}

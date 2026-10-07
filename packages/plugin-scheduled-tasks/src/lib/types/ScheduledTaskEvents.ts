import type { ScheduledTask } from "../structures/ScheduledTask.js";

/**
 * Events emitted during the process setting up the scheduler and running a task.
 * You can use these events to trace the progress for debugging purposes.
 */
export const ScheduledTaskEvents = {
  /**
   * Event that is emitted if a task piece is not found in the store
   */
  ScheduledTaskNotFound: "scheduledTaskNotFound" as const,
  /**
   * Event that is emitted when a task that waits for the app to be ready was not run because the app was still not
   * ready after the timeout. The job is delayed, which costs it no attempt.
   */
  ScheduledTaskNotReady: "scheduledTaskNotReady" as const,
  /**
   * Event that is emitted before a task's "run" method is called
   */
  ScheduledTaskRun: "scheduledTaskRun" as const,
  /**
   * Event that is emitted when a task's "run" method throws an error
   */
  ScheduledTaskError: "scheduledTaskError" as const,
  /**
   * Event that is emitted when a task's "run" method is successful
   */
  ScheduledTaskSuccess: "scheduledTaskSuccess" as const,
  /**
   * Event that is emitted after {@link ScheduledTaskEvents.ScheduledTaskSuccess}, when a task's "run" method finished
   */
  ScheduledTaskFinished: "scheduledTaskFinished" as const,
  /**
   * Event that is emitted when the scheduler fails to connect to the server (i.e. redis)
   */
  ScheduledTaskStrategyConnectError: "scheduledTaskStrategyConnectError" as const,
  /**
   * Event that is emitted when the scheduled task client encounters an error.
   */
  ScheduledTaskStrategyClientError: "scheduledTaskStrategyClientError" as const,
  /**
   * Event that is emitted when the scheduled task worker encounters an error.
   */
  ScheduledTaskStrategyWorkerError: "scheduledTaskStrategyWorkerError" as const,
};

declare module "@wolfstar/http-framework" {
  interface ClientEvents {
    [ScheduledTaskEvents.ScheduledTaskNotFound]: [task: string, payload: unknown];
    [ScheduledTaskEvents.ScheduledTaskNotReady]: [task: ScheduledTask, payload: unknown];
    [ScheduledTaskEvents.ScheduledTaskRun]: [task: ScheduledTask, payload: unknown];
    [ScheduledTaskEvents.ScheduledTaskError]: [
      error: unknown,
      task: ScheduledTask,
      payload: unknown,
    ];
    [ScheduledTaskEvents.ScheduledTaskSuccess]: [
      task: ScheduledTask,
      payload: unknown,
      result: unknown,
      duration: number,
    ];
    [ScheduledTaskEvents.ScheduledTaskFinished]: [
      task: ScheduledTask,
      duration: number | null,
      payload: unknown,
    ];
    [ScheduledTaskEvents.ScheduledTaskStrategyConnectError]: [error: unknown];
    [ScheduledTaskEvents.ScheduledTaskStrategyClientError]: [error: unknown];
    [ScheduledTaskEvents.ScheduledTaskStrategyWorkerError]: [error: unknown];
  }
}

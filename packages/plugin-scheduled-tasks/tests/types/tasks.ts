// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: tasks registered by
// augmenting `ScheduledTasks` must type the payload of `create`, `run` and `ScheduledTask#run`.
import {
  ScheduledTask,
  type ScheduledTaskHandler,
  type ScheduledTaskHandlerOptions,
  type ScheduledTasksKeysNoPayload,
  type ScheduledTasksPayload,
} from "../../src/index.js";

declare module "../../src/index.js" {
  interface ScheduledTasks {
    // No payload.
    Sweep: never;
    // Required payload.
    Unmute: { userId: string };
    // Optional payload.
    Log: { moderatorId: string } | undefined;
  }
}

declare const handler: ScheduledTaskHandler;

export const noPayloadKeys: ScheduledTasksKeysNoPayload[] = ["Sweep", "Log"];
// @ts-expect-error -- `Unmute` requires a payload.
export const requiredPayloadKey: ScheduledTasksKeysNoPayload = "Unmute";

export const sweepPayload: ScheduledTasksPayload<"Sweep"> = undefined;
export const unmutePayload: ScheduledTasksPayload<"Unmute"> = { userId: "1" };

export const byName = handler.create("Sweep", 1000);
export const byObject = handler.create({ name: "Log" });
export const withPayload = handler.create({ name: "Unmute", payload: { userId: "1" } });
export const repeated = handler.create("Sweep", { repeated: true, interval: 1000 });

// @ts-expect-error -- `Unmute` cannot be created without its payload.
export const missingPayload = handler.create("Unmute");
// @ts-expect-error -- the payload must match the registered type.
export const wrongPayload = handler.create({ name: "Unmute", payload: { userId: 1 } });
// @ts-expect-error -- unknown task.
export const unknownTask = handler.create("Nope");

export const unmuteJobData: Promise<{ userId: string }> = withPayload.then((job) => job.data);

export class UnmuteTask extends ScheduledTask<"Unmute"> {
  public override run(payload: { userId: string }): string {
    return payload.userId;
  }
}

export class SweepTask extends ScheduledTask<"Sweep"> {
  public constructor(context: ScheduledTask.LoaderContext) {
    super(context, { interval: 60_000 });
  }

  public override run(payload: undefined): void {
    void payload;
  }
}

export class WaitingTask extends ScheduledTask<"Sweep"> {
  public constructor(context: ScheduledTask.LoaderContext) {
    super(context, { pattern: "*/10 * * * *", waitForReady: true });
  }

  public override run(): void {}
}

export const readyOptions: Partial<ScheduledTaskHandlerOptions> = {
  ready: () => true,
  readyTimeout: 30_000,
  readyDelay: 30_000,
};
export const asyncReady: Partial<ScheduledTaskHandlerOptions> = { ready: async () => {} };
// @ts-expect-error -- `ready` returns a boolean, or a promise of one or of nothing.
export const wrongReady: Partial<ScheduledTaskHandlerOptions> = { ready: () => "yes" };

export const isReady: Promise<boolean> = handler.waitForReady(1_000);

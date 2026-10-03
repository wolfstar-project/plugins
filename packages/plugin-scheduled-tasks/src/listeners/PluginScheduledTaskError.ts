import { Listener } from "@wolfstar/http-framework";
import type { ScheduledTask } from "../lib/structures/ScheduledTask.js";
import { ScheduledTaskEvents } from "../lib/types/ScheduledTaskEvents.js";

export class PluginScheduledTaskErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "client", event: ScheduledTaskEvents.ScheduledTaskError });
  }

  public override run(error: unknown, task: ScheduledTask): void {
    const { name, location } = task;
    this.container.logger.error(
      `Encountered error on scheduled task "${name}" at path "${location.full}"`,
      error,
    );
  }
}

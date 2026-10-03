import { Listener } from "@wolfstar/http-framework";
import { ScheduledTaskEvents } from "../lib/types/ScheduledTaskEvents.js";

export class PluginScheduledTaskNotFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "client", event: ScheduledTaskEvents.ScheduledTaskNotFound });
  }

  public override run(task: string): void {
    this.container.logger.error(
      `There was no task found for "${task}", this means the job was scheduled but no piece with that name is loaded.`,
    );
  }
}

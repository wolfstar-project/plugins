import { Listener } from "@wolfstar/http-framework";
import { ScheduledTaskEvents } from "../lib/types/ScheduledTaskEvents.js";

export class PluginScheduledTaskStrategyWorkerErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, {
      emitter: "client",
      event: ScheduledTaskEvents.ScheduledTaskStrategyWorkerError,
    });
  }

  public override run(error: unknown): void {
    this.container.logger.error(`Encountered error on the scheduled tasks worker`, error);
  }
}

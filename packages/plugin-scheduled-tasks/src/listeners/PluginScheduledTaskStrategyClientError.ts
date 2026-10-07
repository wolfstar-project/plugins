import { Listener } from "@wolfstar/http-framework";
import { ScheduledTaskEvents } from "../lib/types/ScheduledTaskEvents.js";

export class PluginScheduledTaskStrategyClientErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, {
      emitter: "client",
      event: ScheduledTaskEvents.ScheduledTaskStrategyClientError,
    });
  }

  public override run(error: unknown): void {
    this.container.logger.error(`Encountered error on the scheduled tasks client`, error);
  }
}

import { Listener } from "@wolfstar/http-framework";
import { ScheduledTaskEvents } from "../lib/types/ScheduledTaskEvents.js";

export class PluginScheduledTaskStrategyConnectErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, {
      emitter: "client",
      event: ScheduledTaskEvents.ScheduledTaskStrategyConnectError,
    });
  }

  public override run(error: unknown): void {
    this.container.logger.error(
      `Encountered an error when trying to connect to the Redis instance`,
      error,
    );
  }
}

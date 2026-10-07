import { container } from "@wolfstar/http-framework";
import { PluginScheduledTaskErrorListener } from "./PluginScheduledTaskError.js";
import { PluginScheduledTaskNotFoundListener } from "./PluginScheduledTaskNotFound.js";
import { PluginScheduledTaskStrategyClientErrorListener } from "./PluginScheduledTaskStrategyClientError.js";
import { PluginScheduledTaskStrategyConnectErrorListener } from "./PluginScheduledTaskStrategyConnectError.js";
import { PluginScheduledTaskStrategyWorkerErrorListener } from "./PluginScheduledTaskStrategyWorkerError.js";

const listeners = {
  PluginScheduledTaskError: PluginScheduledTaskErrorListener,
  PluginScheduledTaskNotFound: PluginScheduledTaskNotFoundListener,
  PluginScheduledTaskStrategyClientError: PluginScheduledTaskStrategyClientErrorListener,
  PluginScheduledTaskStrategyConnectError: PluginScheduledTaskStrategyConnectErrorListener,
  PluginScheduledTaskStrategyWorkerError: PluginScheduledTaskStrategyWorkerErrorListener,
};

/**
 * Registers the built-in scheduled task error listeners into the framework's listener store.
 */
export async function loadListeners(): Promise<void> {
  await Promise.all(
    Object.entries(listeners).map(([name, piece]) =>
      container.stores.loadPiece({ store: "listeners", name, piece }),
    ),
  );
}

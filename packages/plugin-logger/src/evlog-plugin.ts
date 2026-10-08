import { definePlugin, type LogLevel } from "@wolfstar/http-framework";
import { initLogger, log, type DrainContext, type LoggerConfig } from "evlog";
import { createDrainPipeline, type DrainPipelineOptions } from "evlog/pipeline";
import { EvlogTransport } from "./evlog.js";
import {
  attachInteractionLogging,
  useInteractionLogger,
  type EvlogInteractionsOptions,
} from "./evlog-interactions.js";

/**
 * A drain for evlog: a function receiving each event, or a pipeline (what `createDrainPipeline()`
 * returns), which also has a `flush` called when the logger closes.
 */
export type EvlogDrain = NonNullable<LoggerConfig["drain"]> & { flush?(): Promise<void> };

/**
 * A drain receiving events by batch, which is what a drain adapter (`createAxiomDrain()`, ...) is
 * and what {@link EvlogBaseConfig.pipeline `pipeline`} feeds.
 */
export type EvlogBatchDrain = (batch: DrainContext[]) => void | Promise<void>;

export interface EvlogBaseConfig extends Omit<LoggerConfig, "drain"> {
  /**
   * The tag every entry is written under.
   *
   * @default 'http-framework'
   */
  tag?: string;

  /**
   * The lowest level the {@link EvlogTransport} accepts.
   *
   * @default undefined // the logger's level applies
   */
  level?: LogLevel;

  /**
   * Logs every interaction as one evlog wide event (command, component, modal; autocomplete on
   * request), carrying the outcome, the error if any, the duration and who/where it came from.
   * `true` takes the defaults, `false` turns it off.
   *
   * @default true
   */
  interactions?: boolean | EvlogInteractionsOptions;
}

/**
 * The configuration of {@link evlogPlugin}: evlog's `initLogger` options (`env`, `pretty`, `silent`,
 * `minLevel`, `sampling`, `redact`, `plugins`, ...), plus the transport's `tag` and `level`.
 *
 * With `pipeline` set, the `drain` is wrapped in evlog's drain pipeline (batching, retry, bounded
 * buffer) and receives events by batch, like the drain adapters do. Without it, the drain is given
 * to `initLogger` as it is.
 */
export type EvlogConfig =
  | (EvlogBaseConfig & { drain?: EvlogDrain; pipeline?: false })
  | (EvlogBaseConfig & {
      drain: EvlogBatchDrain;
      pipeline: true | DrainPipelineOptions<DrainContext>;
    });

/**
 * The evlog plugin factory: runs evlog's `initLogger` and adds an {@link EvlogTransport} to the
 * logger. The Stars module registers it with the inline `evlog` options, or `evlog: true`.
 *
 * It must run before the logger plugin, which builds the logger from the transports it finds; the
 * Stars module registers them in that order.
 *
 * The transport is added to the ones in `ClientOptions.logger.transports`, nothing else is
 * replaced: evlog prints to the console on its own (see `silent`), so no console transport is
 * added when there is none.
 */
const evlogPlugin = definePlugin((config: EvlogConfig = {}) => {
  const { tag, level, drain, pipeline, interactions = true, ...loggerConfig } = config;

  return {
    name: "@wolfstar/plugin-logger:evlog",
    enforce: "pre",
    preGenericsInitialization(_client, clientOptions) {
      const sink = createSink(drain, pipeline);

      initLogger({ ...loggerConfig, ...(sink && { drain: sink }) });

      clientOptions.logger ??= {};
      clientOptions.logger.transports = [
        ...(clientOptions.logger.transports ?? []),
        new EvlogTransport({
          instance: log,
          tag,
          level,
          drain: sink?.flush ? { flush: () => sink.flush!() } : undefined,
        }),
      ];
    },
    postInitialization(client) {
      if (!interactions) return;

      attachInteractionLogging(client, {
        commands: true,
        autocomplete: false,
        handlers: true,
        ...(interactions === true ? {} : interactions),
      });
    },
  };
});

export default evlogPlugin;

export { useInteractionLogger, type EvlogInteractionsOptions };

/**
 * The options of {@link evlogPlugin} that survive being written in `stars.config`: everything but the
 * drain and evlog's own `plugins`.
 */
export type EvlogInlineOptions = Omit<EvlogBaseConfig, "plugins"> & {
  pipeline?: boolean | DrainPipelineOptions<DrainContext>;
};

/**
 * Gives the evlog plugin its drain, from a file of your own listed in the module's `evlog.drain`
 * option. Stars hands the other `evlog` options (the inline ones from `stars.config`) to the factory
 * this returns, so the file only holds what `stars.config` cannot: the drain, a function.
 *
 * Outside Stars there is no need for it: give the drain to {@link evlogPlugin} directly.
 *
 * @param drain The drain evlog delivers events to. A batch drain, like the adapters, when the inline
 * options set `pipeline`.
 *
 * @example
 * ```ts
 * // src/evlog-drain.ts
 * import { createAxiomDrain } from 'evlog/axiom';
 * import { defineEvlogDrain } from '@wolfstar/plugin-logger/evlog/plugin';
 *
 * export default defineEvlogDrain(createAxiomDrain());
 * ```
 */
export function defineEvlogDrain(drain: EvlogDrain | EvlogBatchDrain) {
  return definePlugin((options: EvlogInlineOptions = {}) =>
    evlogPlugin({ ...options, drain } as EvlogConfig),
  );
}

function createSink(
  drain: EvlogDrain | EvlogBatchDrain | undefined,
  pipeline: boolean | DrainPipelineOptions<DrainContext> | undefined,
): EvlogDrain | undefined {
  if (!drain) return undefined;

  // A drain with a `flush` is already a pipeline: wrapping it again would batch twice.
  if (pipeline && !("flush" in drain)) {
    return createDrainPipeline<DrainContext>(pipeline === true ? undefined : pipeline)(
      drain as EvlogBatchDrain,
    );
  }

  return drain as EvlogDrain;
}

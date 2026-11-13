import {
  context as otelContext,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import {
  DispatchAttributes,
  TRACER_NAME,
  type OpenTelemetryDispatchesOptions,
} from "./attributes.js";

/**
 * The dispatch `GatewayClient#addDispatchWrapper` of `@wolfstar/plugin-gateway` hands to a wrapper. Structural, so this
 * package does not depend on the gateway.
 */
interface WrappedDispatch {
  payload: { t: string; d?: unknown };
  shardId: number;
  partition: string | null;
}

/**
 * The slice of a `GatewayClient` of `@wolfstar/plugin-gateway` this package uses.
 */
export interface DispatchTracingHost {
  addDispatchWrapper(
    wrapper: (dispatch: WrappedDispatch, run: () => Promise<void>) => Promise<void>,
  ): () => void;
}

/**
 * Whether the client is a `GatewayClient` of `@wolfstar/plugin-gateway` 0.17 or later, which can wrap its dispatches.
 *
 * @param client The client.
 */
export function canTraceDispatches(client: object): client is DispatchTracingHost {
  return typeof (client as Partial<DispatchTracingHost>).addDispatchWrapper === "function";
}

/**
 * Opens a span around the processing of each gateway dispatch: its cache writes, its listeners, and whatever they start
 * (`pg`, `ioredis`, `undici`, ...) become its children.
 *
 * @remarks
 * Each span is the root of a trace of its own. `@discordjs/ws` receives every dispatch in the context of the request
 * that opened the WebSocket, so a span started in the active context would put all of the gateway's work in one trace
 * that never ends.
 *
 * @param client The gateway client.
 * @param options Which dispatches get a span.
 * @returns A function that stops opening spans.
 */
export function attachDispatchTracing(
  client: DispatchTracingHost,
  options: Required<OpenTelemetryDispatchesOptions>,
): () => void {
  const tracer = trace.getTracer(TRACER_NAME);
  const ignored = new Set(options.ignore);

  return client.addDispatchWrapper((dispatch, run) => {
    const type = dispatch.payload.t;
    if (ignored.has(type)) return run();

    const guildId = guildOf(dispatch.payload.d) ?? guildOfPartition(dispatch.partition);
    const span = tracer.startSpan(
      `dispatch ${type}`,
      {
        root: true,
        kind: SpanKind.CONSUMER,
        attributes: {
          [DispatchAttributes.Type]: type,
          [DispatchAttributes.ShardId]: dispatch.shardId,
          ...(dispatch.partition !== null && {
            [DispatchAttributes.Partition]: dispatch.partition,
          }),
          ...(guildId !== null && { [DispatchAttributes.GuildId]: guildId }),
        },
      },
      ROOT_CONTEXT,
    );

    return otelContext.with(trace.setSpan(ROOT_CONTEXT, span), async () => {
      try {
        await run();
        span.setAttribute(DispatchAttributes.Outcome, "success");
      } catch (error) {
        const exception = error instanceof Error ? error : String(error);
        span.recordException(exception);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: typeof exception === "string" ? exception : exception.message,
        });
        span.setAttribute(DispatchAttributes.Outcome, "error");
        throw error;
      } finally {
        span.end();
      }
    });
  });
}

function guildOf(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const { guild_id: guildId } = data as { guild_id?: unknown };
  return typeof guildId === "string" ? guildId : null;
}

// `GUILD_CREATE`, `GUILD_UPDATE` and `GUILD_DELETE` carry the guild in `id`, which the gateway already turned into the
// `guild:<id>` partition, as it does for every other dispatch of a guild.
function guildOfPartition(partition: string | null): string | null {
  return partition?.startsWith("guild:") ? partition.slice("guild:".length) : null;
}

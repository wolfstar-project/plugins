import {
  context as otelContext,
  SpanStatusCode,
  trace,
  type ContextManagementToken,
  type Span,
} from "@opentelemetry/api";
import { Events, type Client } from "@wolfstar/http-framework";
import {
  InteractionAttributes,
  TRACER_NAME,
  type OpenTelemetryInteractionsOptions,
} from "./attributes.js";

/**
 * The slice of an interaction the span describes. Structural, as the three kinds of interaction share it.
 */
interface InteractionLike {
  id: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  channel?: { id: string };
}

interface EventContext {
  command?: { name: string };
  handler?: { name: string };
  interaction: InteractionLike;
}

type Listener = (...args: any[]) => void;

interface Run {
  span: Span;
  token: ContextManagementToken;
}

/**
 * Discord's `InteractionType` of a modal submit.
 */
const MODAL_SUBMIT = 5;

/**
 * Opens a span for each command, autocomplete or handler run: it starts with the `*Run` event, is filled with the
 * outcome and the error by the `*Success` and `*Error` events, and ends with the `*Finish` event.
 *
 * The framework's events do not wrap the run, but they are emitted synchronously from the flow that goes on to run it.
 * Attaching the span to the OpenTelemetry context from the `*Run` listener makes it the parent of whatever the code of
 * the command starts (`pg`, `ioredis`, `undici`, ...), and the `*Finish` listener restores the context that was active.
 * That relies on the context manager supporting `context.attach`, as the `AsyncLocalStorageContextManager` the SDK
 * installs does; with one that does not, the spans are still created, but their children are not attached to them.
 *
 * @param client The client whose events are listened to.
 * @param options Which interactions get a span.
 */
export function attachInteractionTracing(
  client: Client,
  options: Required<OpenTelemetryInteractionsOptions>,
): void {
  const on = client.on.bind(client) as (event: string, listener: Listener) => unknown;
  const tracer = trace.getTracer(TRACER_NAME);
  const runs = new WeakMap<object, Run>();

  const groups = [
    [
      options.commands,
      () => "command",
      Events.CommandRun,
      Events.CommandSuccess,
      Events.CommandError,
      Events.CommandFinish,
    ],
    [
      options.autocomplete,
      () => "autocomplete",
      Events.AutocompleteRun,
      Events.AutocompleteSuccess,
      Events.AutocompleteError,
      Events.AutocompleteFinish,
    ],
    [
      options.handlers,
      kindOfHandler,
      Events.InteractionHandlerRun,
      Events.InteractionHandlerSuccess,
      Events.InteractionHandlerError,
      Events.InteractionHandlerFinish,
    ],
  ] as const;

  for (const [enabled, kindOf, run, success, error, finish] of groups) {
    if (!enabled) continue;

    on(run, (event: EventContext) => {
      const { interaction } = event;
      const kind = kindOf(interaction);
      const name = (event.command ?? event.handler)?.name;

      const span = tracer.startSpan(name ? `${kind} ${name}` : kind, {
        attributes: {
          [InteractionAttributes.Kind]: kind,
          [InteractionAttributes.Id]: interaction.id,
          ...(name && { [InteractionAttributes.Name]: name }),
          ...(interaction.guild_id && { [InteractionAttributes.GuildId]: interaction.guild_id }),
          ...((interaction.channel_id ?? interaction.channel?.id) && {
            [InteractionAttributes.ChannelId]: interaction.channel_id ?? interaction.channel?.id,
          }),
        },
      });

      // Not `context.with`: nothing here wraps the command, the flow that emitted this event runs it next.
      const token = otelContext.attach(trace.setSpan(otelContext.active(), span));
      runs.set(event, { span, token });
    });
    on(success, (event: EventContext) => {
      runs.get(event)?.span.setAttribute(InteractionAttributes.Outcome, "success");
    });
    on(error, (reason: unknown, event: EventContext) => {
      const span = runs.get(event)?.span;
      if (!span) return;

      const exception = reason instanceof Error ? reason : String(reason);
      span.recordException(exception);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: typeof exception === "string" ? exception : exception.message,
      });
      span.setAttribute(InteractionAttributes.Outcome, "error");
    });
    on(finish, (event: EventContext) => {
      const entry = runs.get(event);
      if (!entry) return;

      runs.delete(event);
      // Past the finish, the rest of the flow is back in the context it was in before the run.
      entry.token.dispose();
      entry.span.end();
    });
  }
}

function kindOfHandler(interaction: InteractionLike): string {
  return interaction.type === MODAL_SUBMIT ? "modal" : "component";
}

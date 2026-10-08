import { Events, type Client } from "@wolfstar/http-framework";
import { createRequestLogger } from "evlog";
import { createLoggerStorage } from "evlog/toolkit/storage";

/**
 * Which interactions are logged as wide events.
 */
export interface EvlogInteractionsOptions {
  /**
   * Slash, user and message commands.
   *
   * @default true
   */
  commands?: boolean;

  /**
   * Autocomplete requests. Off by default: Discord sends one for every keystroke.
   *
   * @default false
   */
  autocomplete?: boolean;

  /**
   * Message components (buttons, select menus) and modals.
   *
   * @default true
   */
  handlers?: boolean;
}

/**
 * The slice of an interaction the wide event describes. Structural, as the three kinds of
 * interaction share it.
 */
interface InteractionLike {
  id: string;
  type: number;
  guild_id?: string;
  channel_id?: string;
  channel?: { id: string };
  locale?: string;
  member?: { user?: { id: string } };
  user?: { id: string };
}

interface EventContext {
  command?: { name: string };
  handler?: { name: string };
  interaction: InteractionLike;
}

type Listener = (...args: any[]) => void;

const { storage, useLogger } = createLoggerStorage(
  "an interaction. Make sure the evlog plugin is registered before the logger plugin.",
  "@wolfstar/plugin-logger:interaction",
);

/**
 * The evlog request logger of the interaction being handled, to enrich its wide event from the code
 * of a command, an autocomplete or a handler. Throws outside of one, like evlog's `useLogger`.
 *
 * @example
 * ```ts
 * import { useInteractionLogger } from '@wolfstar/plugin-logger/evlog/plugin';
 *
 * useInteractionLogger().set({ cart: { items: 3 } });
 * ```
 */
export const useInteractionLogger = useLogger;

type RequestLogger = ReturnType<typeof createRequestLogger<Record<string, unknown>>>;

/**
 * Discord's `InteractionType` values telling the kinds apart.
 */
const AUTOCOMPLETE = 4;
const MODAL_SUBMIT = 5;

/**
 * Turns the client's interaction lifecycle into evlog wide events: one request logger per command,
 * autocomplete or handler run, created when it starts, filled with its outcome and emitted when it
 * finishes, so the drain, enrichers, sampling and plugins of evlog see a single event per
 * interaction instead of a trail of log lines.
 *
 * The framework's events do not wrap the run of the command, but they are emitted synchronously from
 * the flow that goes on to run it: entering the logger into `AsyncLocalStorage` from the `*Run`
 * listener makes it reachable from the command's code, see {@link useInteractionLogger}. It is emitted
 * by the `*Finish` event.
 *
 * @param client The client whose events are listened to.
 * @param options Which interactions are logged.
 */
export function attachInteractionLogging(
  client: Client,
  options: Required<EvlogInteractionsOptions>,
): void {
  const on = client.on.bind(client) as (event: string, listener: Listener) => unknown;
  const loggers = new WeakMap<object, RequestLogger>();

  const groups = [
    [
      options.commands,
      Events.CommandRun,
      Events.CommandSuccess,
      Events.CommandError,
      Events.CommandFinish,
    ],
    [
      options.autocomplete,
      Events.AutocompleteRun,
      Events.AutocompleteSuccess,
      Events.AutocompleteError,
      Events.AutocompleteFinish,
    ],
    [
      options.handlers,
      Events.InteractionHandlerRun,
      Events.InteractionHandlerSuccess,
      Events.InteractionHandlerError,
      Events.InteractionHandlerFinish,
    ],
  ] as const;

  for (const [enabled, run, success, error, finish] of groups) {
    if (!enabled) continue;

    on(run, (context: EventContext) => {
      const logger = begin(context);
      loggers.set(context, logger);
      // Not `run()`: nothing here wraps the command, the flow that emitted this event runs it next.
      storage.enterWith(logger);
    });
    on(success, (context: EventContext) => {
      loggers.get(context)?.set({ outcome: "success" });
    });
    on(error, (reason: unknown, context: EventContext) => {
      const logger = loggers.get(context);
      logger?.error(reason instanceof Error ? reason : String(reason));
      logger?.set({ outcome: "error" });
    });
    on(finish, (context: EventContext) => {
      const logger = loggers.get(context);
      loggers.delete(context);
      // What `storage.run` ending would do: past the finish, the rest of the flow has no logger.
      storage.enterWith(undefined as never);
      // `emit` reports a failing drain on its own; nothing here may take an interaction down.
      void Promise.resolve(logger?.emit()).catch(() => undefined);
    });
  }
}

function begin({ command, handler, interaction }: EventContext): RequestLogger {
  const logger = createRequestLogger({
    method: methodOf(interaction, command),
    path: (command ?? handler)?.name,
    requestId: interaction.id,
  });

  logger.set({
    guildId: interaction.guild_id,
    channelId: interaction.channel_id ?? interaction.channel?.id,
    userId: (interaction.member?.user ?? interaction.user)?.id,
    locale: interaction.locale,
  });

  return logger;
}

function methodOf(interaction: InteractionLike, command: EventContext["command"]): string {
  if (!command) return interaction.type === MODAL_SUBMIT ? "MODAL" : "COMPONENT";
  return interaction.type === AUTOCOMPLETE ? "AUTOCOMPLETE" : "COMMAND";
}

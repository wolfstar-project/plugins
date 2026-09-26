import type { RequestHandler } from "./requests.js";

/**
 * A request naming a command, the optional command layer on top of raw requests.
 */
export interface CommandRequest<Name extends string = string, Data = unknown> {
  command: Name;
  data: Data;
}

/**
 * The commands a handler answers, by name.
 */
export type Commands<Context = unknown> = Record<
  string,
  (data: any, context: Context & { signal: AbortSignal }) => unknown
>;

/**
 * The reply of a command.
 */
export type CommandReply<C extends Commands<any>, Name extends keyof C> = Awaited<
  ReturnType<C[Name]>
>;

/**
 * Builds a request handler answering {@link CommandRequest}s: the sharder stays raw data (as the RFC settled), and
 * this is the optional, typed layer on top.
 *
 * @param commands The commands, by name.
 * @example
 * ```ts
 * const commands = {
 *   guildCount: () => guilds.size,
 *   guild: (id: string) => guilds.get(id) ?? null,
 * } satisfies Commands;
 *
 * shard.setRequestHandler(createCommandHandler(commands));
 * const counts = await manager.broadcastRequest<CommandReply<typeof commands, "guildCount">>(
 *   command<typeof commands>("guildCount"),
 * );
 * ```
 */
export function createCommandHandler<Context>(
  commands: Commands<Context>,
): RequestHandler<Context> {
  return (body, context) => {
    const request = body as Partial<CommandRequest> | null;
    const run = typeof request?.command === "string" ? commands[request.command] : undefined;
    if (!run || !Object.hasOwn(commands, request!.command!)) {
      throw new RangeError(`Unknown command ${String(request?.command)}`);
    }

    return run(request!.data, context);
  };
}

/**
 * Builds a {@link CommandRequest}.
 *
 * @param name The name of the command.
 * @param data Its argument.
 */
export function command<C extends Commands<any>, Name extends keyof C & string = keyof C & string>(
  name: Name,
  ...data: Parameters<C[Name]>[0] extends undefined ? [] : [data: Parameters<C[Name]>[0]]
): CommandRequest<Name, Parameters<C[Name]>[0]> {
  return { command: name, data: data[0] as Parameters<C[Name]>[0] };
}

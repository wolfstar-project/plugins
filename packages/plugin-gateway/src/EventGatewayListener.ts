import { Listener } from "@wolfstar/http-framework";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { GatewayEventMap, GatewayEventName } from "./util/events.js";

/**
 * A {@link Listener} bound to one of the {@link GatewayEventMap} events of the {@link GatewayClient}, with strongly
 * typed arguments. It is loaded from the `listeners` directory by `client.load()` like any other listener.
 *
 * @example
 * ```typescript
 * // listeners/log-messages.ts
 * import { EventGatewayListener, type Message } from '@wolfstar/plugin-gateway';
 *
 * export class LogMessagesListener extends EventGatewayListener<'messageCreate'> {
 *   public constructor(context: EventGatewayListener.LoaderContext) {
 *     super(context, { event: 'messageCreate' });
 *   }
 *
 *   public override run(message: Message) {
 *     console.log(`${message.author.username}: ${message.content}`);
 *   }
 * }
 * ```
 */
export abstract class EventGatewayListener<
  Event extends GatewayEventName = GatewayEventName,
> extends Listener<EventGatewayListener.ResolvedOptions<Event>> {
  /**
   * Whether this listener unloads itself after its first run.
   */
  public readonly once: boolean;

  public constructor(
    context: EventGatewayListener.LoaderContext,
    options: EventGatewayListener.Options<Event>,
  ) {
    super(context, { ...options, emitter: "client" });
    this.once = options.once ?? false;

    if (this.once) {
      // `_listener` is what the framework's loader strategy attaches to the emitter, wrapping it is the only way to
      // unload the piece on its first run while keeping `run` overridable.
      // oxlint-disable-next-line no-underscore-dangle
      const listener = this._listener;
      // oxlint-disable-next-line no-underscore-dangle
      this._listener = async (...args: readonly unknown[]) => {
        await this.unload();
        return listener(...args);
      };
    }
  }

  public abstract override run(...args: GatewayEventMap[Event]): Awaitable<unknown>;
}

export namespace EventGatewayListener {
  export type LoaderContext = Listener.LoaderContext;

  export interface Options<Event extends GatewayEventName = GatewayEventName> extends Omit<
    Listener.Options,
    "emitter" | "event"
  > {
    /**
     * The event to listen to.
     */
    event: Event;
    /**
     * Whether to unload the listener after its first run.
     *
     * @default false
     */
    once?: boolean;
  }

  export interface ResolvedOptions<Event extends GatewayEventName = GatewayEventName>
    extends Listener.Options {
    event: Event;
    once?: boolean;
  }
}

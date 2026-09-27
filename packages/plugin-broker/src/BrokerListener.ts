import { Listener } from "@wolfstar/http-framework";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { BrokerEventName, BrokerEvents } from "./lib/events.js";
import type { BrokerMessage } from "./lib/types.js";

/**
 * A {@link Listener} bound to one of the {@link BrokerEvents} events of a {@link BrokerConsumer}, with strongly
 * typed payloads. It is loaded from the `listeners` directory by `client.load()` like any other listener.
 *
 * @example
 * ```typescript
 * // listeners/log-messages.ts
 * import { BrokerListener, type BrokerMessage } from '@wolfstar/plugin-broker';
 *
 * export class LogMessagesListener extends BrokerListener<'messageCreate'> {
 *   public constructor(context: BrokerListener.LoaderContext) {
 *     super(context, { event: 'messageCreate' });
 *   }
 *
 *   public override run(payload: BrokerEvents['messageCreate'], message: BrokerMessage) {
 *     console.log(`[${message.id}] ${payload}`);
 *   }
 * }
 * ```
 */
export abstract class BrokerListener<
  Event extends BrokerEventName = BrokerEventName,
> extends Listener<BrokerListener.ResolvedOptions<Event>> {
  /**
   * Whether this listener unloads itself after its first run.
   */
  public readonly once: boolean;

  public constructor(
    context: BrokerListener.LoaderContext,
    options: BrokerListener.Options<Event>,
  ) {
    super(context, { ...options, emitter: options.emitter ?? "broker" });
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

  public abstract override run(
    payload: BrokerEvents[Event],
    message: BrokerMessage,
  ): Awaitable<unknown>;
}

export namespace BrokerListener {
  export type LoaderContext = Listener.LoaderContext;

  export interface Options<Event extends BrokerEventName = BrokerEventName> extends Omit<
    Listener.Options,
    "emitter" | "event"
  > {
    /**
     * The event to listen to.
     */
    event: Event;
    /**
     * The emitter to bind to, resolved the same way as {@link Listener.Options.emitter}.
     *
     * @default "broker"
     */
    emitter?: Listener.Options["emitter"];
    /**
     * Whether to unload the listener after its first run.
     *
     * @default false
     */
    once?: boolean;
  }

  export interface ResolvedOptions<Event extends BrokerEventName = BrokerEventName>
    extends Listener.Options {
    event: Event;
    once?: boolean;
  }
}

import { gatewayOnlyEvents, type DispatchEventName, type GatewayEventName } from "./events.js";
import type { EventGatewayListener } from "../EventGatewayListener.js";

type ListenerConstructor = new (...args: any[]) => EventGatewayListener<any>;

/**
 * Class decorator that binds the decorated {@link EventGatewayListener} to a gateway event, so it does not need to
 * declare a constructor.
 *
 * @example
 * ```typescript
 * import { EventGatewayListener, RegisterAsGatewayListener, type Message } from '@wolfstar/plugin-gateway';
 *
 * @RegisterAsGatewayListener('messageCreate')
 * export class LogMessagesListener extends EventGatewayListener<'messageCreate'> {
 *   public override run(message: Message) {
 *     console.log(`${message.author.username}: ${message.content}`);
 *   }
 * }
 * ```
 *
 * @param event The event to listen to.
 * @param options The additional listener options.
 */
export function RegisterAsGatewayListener<Event extends GatewayEventName>(
  event: Event,
  options: Omit<EventGatewayListener.Options<Event>, "event"> = {},
) {
  return function decorate<T extends ListenerConstructor>(target: T): T {
    // Seen through its instance type, the target is abstract (`run`), even though the decorated class implements it.
    const base = target as unknown as new (...args: any[]) => object;
    return class extends base {
      public constructor(...args: any[]) {
        const [context, baseOptions = {}] = args as [
          EventGatewayListener.LoaderContext,
          Partial<EventGatewayListener.Options<Event>>?,
        ];
        super(context, { ...baseOptions, ...options, event });
      }
    } as unknown as T;
  };
}

/**
 * Like {@link RegisterAsGatewayListener}, for an event that comes from a dispatch, but the listener only runs on one
 * process: the workers replaying the dispatches while the gateway client forwards them (see `forwardGatewayDispatches`
 * from `@wolfstar/plugin-broker`), the gateway client itself otherwise. A bot loading the same pieces on both
 * processes therefore handles each dispatch once, without reading its environment to tell which process it is on.
 *
 * @remarks
 * The decision is made on every emit, so it does not matter whether the forwarding starts before or after the
 * listener is loaded, and stopping it brings the listener back. A `once` listener is not spent while it idles.
 *
 * The events only the gateway client emits (`clientReady`, `shardReady`, `shardResume`, `shardClose`, `shardError`,
 * `dispatch`, `cacheError`, `cacheSweep`) are never replayed on a worker: they are rejected by the types, and the
 * decorator throws for them. Use {@link RegisterAsGatewayListener} for those.
 *
 * Only the dispatches that are forwarded reach the workers: with `forwardGatewayDispatches`'s `events` set, a listener
 * of an event built from another dispatch runs nowhere. A `guildDelete` that `READY` emits for the guilds it no longer
 * lists is not forwarded either (wolfstar-project/plugins#243), so a listener on the workers misses it. Delivery to the
 * workers is at-least-once, so the listener should be idempotent.
 *
 * @example
 * ```typescript
 * import { EventGatewayListener, RegisterAsDispatchListener, type Message } from '@wolfstar/plugin-gateway';
 *
 * @RegisterAsDispatchListener('messageCreate')
 * export class LogMessagesListener extends EventGatewayListener<'messageCreate'> {
 *   public override run(message: Message) {
 *     console.log(`${message.author.username}: ${message.content}`);
 *   }
 * }
 * ```
 *
 * @param event The dispatch event to listen to.
 * @param options The additional listener options.
 * @throws {TypeError} When the event is one only the gateway client emits.
 */
export function RegisterAsDispatchListener<Event extends DispatchEventName>(
  event: Event,
  options: Omit<EventGatewayListener.Options<Event>, "event"> = {},
) {
  if (gatewayOnlyEvents.has(event)) {
    throw new TypeError(
      `The "${event}" event is only emitted by the gateway client, and never reaches a worker: use RegisterAsGatewayListener.`,
    );
  }

  const register = RegisterAsGatewayListener(event, options);
  return function decorate<T extends ListenerConstructor>(target: T): T {
    const base = register(target) as unknown as new (...args: any[]) => DispatchListenerInternals;
    return class extends base {
      public constructor(...args: any[]) {
        super(...args);

        // The outermost wrapper, so a `once` listener is only unloaded by a run that happens.
        // oxlint-disable-next-line no-underscore-dangle
        const listener = this._listener;
        // oxlint-disable-next-line no-underscore-dangle
        this._listener = (...listenerArgs: readonly unknown[]) =>
          this.emitter.forwardsDispatches ? undefined : listener(...listenerArgs);
      }
    } as unknown as T;
  };
}

interface DispatchListenerInternals {
  // Anything but a `GatewayClient` has no flag, and so never forwards.
  emitter: { forwardsDispatches?: boolean };
  _listener: (...args: readonly unknown[]) => unknown;
}

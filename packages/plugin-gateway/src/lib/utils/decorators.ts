import type { GatewayEventName } from "../GatewayEvents.js";
import type { EventGatewayListener } from "../structures/EventGatewayListener.js";

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

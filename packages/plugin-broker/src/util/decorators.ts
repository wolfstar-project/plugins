import type { BrokerListener } from "../BrokerListener.js";
import type { BrokerEventName } from "../lib/events.js";

// `BrokerListener`'s default type parameter is `BrokerEventName`, which is `never` until an application augments
// `BrokerEvents` — an explicit `<any>` argument fails that constraint under strict checking, so this relies on the
// class's own default instead.
type ListenerConstructor = new (...args: any[]) => BrokerListener;

/**
 * Class decorator that binds the decorated {@link BrokerListener} to a broker event, so it does not need to declare
 * a constructor.
 *
 * @example
 * ```typescript
 * import { BrokerListener, RegisterAsBrokerListener, type BrokerMessage } from '@wolfstar/plugin-broker';
 *
 * @RegisterAsBrokerListener('messageCreate')
 * export class LogMessagesListener extends BrokerListener<'messageCreate'> {
 *   public override run(payload: unknown, message: BrokerMessage) {
 *     console.log(`[${message.id}]`, payload);
 *   }
 * }
 * ```
 *
 * @param event The event to listen to.
 * @param options The additional listener options.
 */
export function RegisterAsBrokerListener<Event extends BrokerEventName>(
  event: Event,
  options: Omit<BrokerListener.Options<Event>, "event"> = {},
) {
  return function decorate<T extends ListenerConstructor>(target: T): T {
    // Seen through its instance type, the target is abstract (`run`), even though the decorated class implements it.
    const base = target as unknown as new (...args: any[]) => object;
    return class extends base {
      public constructor(...args: any[]) {
        const [context, baseOptions = {}] = args as [
          BrokerListener.LoaderContext,
          Partial<BrokerListener.Options<Event>>?,
        ];
        super(context, { ...baseOptions, ...options, event });
      }
    } as unknown as T;
  };
}

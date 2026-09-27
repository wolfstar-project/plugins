/**
 * The payload type of every event a {@link BrokerListener} can be registered for, keyed by event name.
 *
 * @remarks
 * Empty by design: augment it in your application to type the events your bot publishes and consumes.
 *
 * @example
 * ```typescript
 * declare module '@wolfstar/plugin-broker' {
 *   interface BrokerEvents {
 *     messageCreate: GatewayMessageCreateDispatchData;
 *   }
 * }
 * ```
 */
export interface BrokerEvents {}

/**
 * The name of any of the events listed in {@link BrokerEvents}.
 */
export type BrokerEventName = keyof BrokerEvents;

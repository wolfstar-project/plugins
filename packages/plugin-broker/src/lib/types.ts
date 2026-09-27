/**
 * A dispatched broker entry, handed to every {@link BrokerListener} alongside its decoded payload.
 */
export interface BrokerMessage {
  /**
   * The Redis stream entry ID.
   */
  readonly id: string;
  /**
   * The event name the entry was published under.
   */
  readonly event: string;
}

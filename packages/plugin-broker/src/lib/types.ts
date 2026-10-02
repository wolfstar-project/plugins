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
  /**
   * The state published next to the payload, decoded with the consumer's codec. Absent when none was published.
   */
  readonly state?: unknown;
  /**
   * The shard the event came from. Absent when none was published.
   */
  readonly shard?: number;
  /**
   * The sequence number of the dispatch on its shard. Absent when none was published.
   */
  readonly sequence?: number;
}

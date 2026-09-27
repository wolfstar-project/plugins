/**
 * The structures a `GatewayClient` builds partially when an event concerns one it has not cached, like discord.js's
 * `Partials`. Pass them to `GatewayClientOptions.partials`.
 *
 * @remarks
 * Unlike discord.js, events are always emitted, even without the matching partial: an uncached entity is `null` then,
 * as it always was. With the partial enabled, it is a structure built from the IDs the dispatch carries instead, whose
 * `partial` is `true`: only its IDs are reliable, and `fetch()` completes it. Partial structures are never written to
 * the cache.
 *
 * `Reaction` and `PollAnswer` are accepted for parity only: the reaction and the poll answer of an uncached message
 * have always been emitted, and are partial whether or not they are enabled.
 */
export const Partials = {
  User: 0,
  Channel: 1,
  GuildMember: 2,
  Message: 3,
  Reaction: 4,
  GuildScheduledEvent: 5,
  ThreadMember: 6,
  Poll: 7,
  PollAnswer: 8,
  SoundboardSound: 9,
} as const;

/**
 * One of the {@link Partials}.
 */
export type Partials = (typeof Partials)[keyof typeof Partials];

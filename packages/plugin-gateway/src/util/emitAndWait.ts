interface ListenerSource {
  rawListeners(event: any): readonly ((...args: any[]) => unknown)[];
}

/**
 * Like `emitter.emit`, but resolves once every listener's returned promise settled, and rejects with the first
 * failure, a synchronous throw included. `emit` hands rejections to the `error` event instead.
 */
export async function emitAndWait(
  emitter: ListenerSource,
  event: string,
  args: readonly unknown[],
): Promise<void> {
  const results: unknown[] = [];
  let failure: { error: unknown } | undefined;

  try {
    // Raw listeners, so a `once` listener still removes itself.
    for (const listener of emitter.rawListeners(event))
      results.push(listener.apply(emitter, args as unknown[]));
  } catch (error) {
    failure = { error };
  }

  const settled = await Promise.allSettled(results);
  if (failure) throw failure.error;

  const rejected = settled.find((result) => result.status === "rejected");
  if (rejected) throw rejected.reason;
}

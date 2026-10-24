import { trace } from "@opentelemetry/api";

/**
 * Exports the spans that are waiting in the batch, for a shutdown path to call before the process exits.
 *
 * @remarks
 * It never rejects, and does nothing when no SDK is running (the preload did not start one, as without an OTLP
 * endpoint), so a shutdown path can call it unconditionally.
 */
export async function flushTraces(): Promise<void> {
  const provider = trace.getTracerProvider() as {
    getDelegate?: () => unknown;
    forceFlush?: () => Promise<void>;
  };
  const delegate = (provider.getDelegate?.() ?? provider) as { forceFlush?: () => Promise<void> };

  try {
    await delegate.forceFlush?.();
  } catch {
    // A failing export must not take a shutdown down.
  }
}

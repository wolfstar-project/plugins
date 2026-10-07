export type Awaitable<T> = T | PromiseLike<T>;

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isNullishOrEmpty(value: unknown): value is "" | null | undefined {
  return isNullish(value) || (value as { length?: unknown }).length === 0;
}

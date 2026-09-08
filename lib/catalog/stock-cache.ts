const TTL_MS = 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };

const cache = new Map<string, CacheEntry<unknown>>();

function read<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) cache.delete(key);
    return null;
  }
  return hit.value as T;
}

export async function cachedFetch<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = TTL_MS,
): Promise<T> {
  const hit = read<T>(key);
  if (hit !== null) return hit;
  cache.set(key, { value: await loader(), expiresAt: Date.now() + ttlMs });
  return read<T>(key)!;
}

export function invalidateStockCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

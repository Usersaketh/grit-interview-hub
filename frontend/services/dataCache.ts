"use client";

interface CacheEntry<T> {
  data: T;
  updatedAt: number;
}

const DEFAULT_TTL_MS = 30_000;

const valueCache = new Map<string, CacheEntry<unknown>>();
const inFlightCache = new Map<string, Promise<unknown>>();

function buildKey(userId: string, resourceKey: string): string {
  return `${userId}::${resourceKey}`;
}

export function getCachedData<T>(
  userId: string,
  resourceKey: string,
  ttlMs = DEFAULT_TTL_MS
): { data: T; isStale: boolean; updatedAt: number } | null {
  const key = buildKey(userId, resourceKey);
  const entry = valueCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.updatedAt;
  return {
    data: entry.data as T,
    isStale: age > ttlMs,
    updatedAt: entry.updatedAt,
  };
}

export function setCachedData<T>(
  userId: string,
  resourceKey: string,
  data: T
): void {
  const key = buildKey(userId, resourceKey);
  valueCache.set(key, { data, updatedAt: Date.now() });
}

export function invalidateUserCache(userId: string, prefix?: string): void {
  const userPrefix = `${userId}::`;
  for (const key of Array.from(valueCache.keys())) {
    if (!key.startsWith(userPrefix)) continue;
    if (!prefix || key.slice(userPrefix.length).startsWith(prefix)) {
      valueCache.delete(key);
    }
  }
  for (const key of Array.from(inFlightCache.keys())) {
    if (!key.startsWith(userPrefix)) continue;
    if (!prefix || key.slice(userPrefix.length).startsWith(prefix)) {
      inFlightCache.delete(key);
    }
  }
}

export function clearAllHubCaches(): void {
  valueCache.clear();
  inFlightCache.clear();
}

export async function fetchWithUserCache<T>(
  userId: string,
  resourceKey: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; ttlMs?: number }
): Promise<T> {
  const key = buildKey(userId, resourceKey);
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  if (!options?.force) {
    const existing = valueCache.get(key);
    if (existing && Date.now() - existing.updatedAt <= ttlMs) {
      return existing.data as T;
    }
  }

  const inflight = inFlightCache.get(key);
  if (inflight && !options?.force) {
    return inflight as Promise<T>;
  }

  const promise = fetcher()
    .then((data) => {
      valueCache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .finally(() => {
      if (inFlightCache.get(key) === promise) {
        inFlightCache.delete(key);
      }
    });

  inFlightCache.set(key, promise);
  return promise;
}

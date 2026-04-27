const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry<T> {
  ts: number;
  value: T;
}

interface KeyedCacheEntry<T> extends CacheEntry<T> {
  key: string;
}

function isFresh(entry: { ts: number } | null | undefined): boolean {
  return !!entry && Date.now() - entry.ts < CACHE_TTL_MS;
}

// --- Header cache ---
let headerCache: CacheEntry<unknown> | null = null;

export function getCachedHeader<T>(): T | null {
  return isFresh(headerCache) ? (headerCache!.value as T) : null;
}

export function setCachedHeader<T>(value: T): void {
  headerCache = { ts: Date.now(), value };
}

// --- Race cache ---
const racesCache = new Map<string, CacheEntry<string>>();

export function getCachedRace(name: string): string | null {
  const entry = racesCache.get(name);
  return isFresh(entry) ? entry!.value : null;
}

export function setCachedRace(name: string, value: string): void {
  racesCache.set(name, { ts: Date.now(), value });
}

// --- Elo-since-update cache ---
let eloCache: KeyedCacheEntry<unknown> | null = null;

export function getCachedEloSinceUpdate<T>(key: string): T | null {
  return isFresh(eloCache) && eloCache!.key === key
    ? (eloCache!.value as T)
    : null;
}

export function setCachedEloSinceUpdate<T>(key: string, value: T): void {
  eloCache = { ts: Date.now(), key, value };
}

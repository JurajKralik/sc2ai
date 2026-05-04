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

// --- Bot-by-id cache ---
interface BotInfo { name: string; race: string; }
const botCache = new Map<string, CacheEntry<BotInfo>>();

export function getCachedBot(id: string): BotInfo | null {
  const entry = botCache.get(id);
  return isFresh(entry) ? entry!.value : null;
}

export function setCachedBot(id: string, value: BotInfo): void {
  botCache.set(id, { ts: Date.now(), value });
}

// --- Elo-change-30 cache (per bot id) ---
const eloChange30Cache = new Map<string, CacheEntry<number | null>>();

export function getCachedEloChange30(id: string): number | null | undefined {
  const entry = eloChange30Cache.get(id);
  return isFresh(entry) ? entry!.value : undefined;
}

export function setCachedEloChange30(id: string, value: number | null): void {
  eloChange30Cache.set(id, { ts: Date.now(), value });
}

// --- Division cache ---
let divisionCache: CacheEntry<unknown> | null = null;

export function getCachedDivision<T>(): T | null {
  return isFresh(divisionCache) ? (divisionCache!.value as T) : null;
}

export function setCachedDivision<T>(value: T): void {
  divisionCache = { ts: Date.now(), value };
}

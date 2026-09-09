// Simple in-memory cache populated from AsyncStorage on app startup
// Provides synchronous access for TanStack Query placeholderData

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const memoryCache = new Map<string, CacheEntry<any>>();

export function setMemoryCache<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function getMemoryCache<T>(key: string): T | undefined {
  const entry = memoryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return undefined;
  }
  return entry.data;
}

export function clearMemoryCache(key?: string): void {
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
}

export async function hydrateMemoryCache(): Promise<void> {
  // This will be called on app startup to populate memory cache from AsyncStorage
  const { getCachedData } = await import('./offlineStorage');
  
  const userProfile = await getCachedData<any>('userProfile');
  if (userProfile) setMemoryCache('userProfile', userProfile);

  const userList = await getCachedData<any[]>('userList');
  if (userList) setMemoryCache('userList', userList);
}
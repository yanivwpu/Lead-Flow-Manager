type CachedGhlLocationToken = {
  accessToken: string;
  expiresAtMs: number;
};

const locationTokenCache = new Map<string, CachedGhlLocationToken>();

/** Buffer before expiry to avoid using nearly-dead location tokens. */
const EXPIRY_BUFFER_MS = 60_000;

export function buildGhlLocationTokenCacheKey(integrationId: string, locationId: string): string {
  return `${integrationId.trim()}::${locationId.trim()}`;
}

export function getCachedGhlLocationToken(
  integrationId: string,
  locationId: string,
): string | null {
  const key = buildGhlLocationTokenCacheKey(integrationId, locationId);
  const entry = locationTokenCache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAtMs - EXPIRY_BUFFER_MS) {
    locationTokenCache.delete(key);
    return null;
  }
  return entry.accessToken;
}

export function setCachedGhlLocationToken(
  integrationId: string,
  locationId: string,
  accessToken: string,
  expiresInSeconds: number,
): void {
  const key = buildGhlLocationTokenCacheKey(integrationId, locationId);
  locationTokenCache.set(key, {
    accessToken,
    expiresAtMs: Date.now() + Math.max(expiresInSeconds, 60) * 1000,
  });
}

export function clearGhlLocationTokenCache(): void {
  locationTokenCache.clear();
}

export function invalidateGhlLocationTokenCache(integrationId: string, locationId?: string): void {
  if (locationId) {
    locationTokenCache.delete(buildGhlLocationTokenCacheKey(integrationId, locationId));
    return;
  }
  const prefix = `${integrationId.trim()}::`;
  for (const key of locationTokenCache.keys()) {
    if (key.startsWith(prefix)) locationTokenCache.delete(key);
  }
}

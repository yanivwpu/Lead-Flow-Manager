export const TRESTLE_TOKEN_URL = "https://api.cotality.com/trestle/oidc/connect/token";

type TokenCacheEntry = {
  accessToken: string;
  expiresAtMs: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

/** Refresh token at least 5 minutes before expiry. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export function clearTrestleTokenCache(sourceKey: string): void {
  tokenCache.delete(sourceKey);
}

export async function fetchTrestleAccessToken(
  sourceKey: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const cached = tokenCache.get(sourceKey);
  const now = Date.now();
  if (cached && cached.expiresAtMs > now + EXPIRY_BUFFER_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "api",
  });

  const res = await fetch(TRESTLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Trestle credentials were rejected. Check your client ID and secret.");
    }
    throw new Error(`Trestle authentication failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  let json: { access_token?: string; expires_in?: number };
  try {
    json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  } catch {
    throw new Error("Trestle authentication returned an invalid response.");
  }

  const accessToken = json.access_token;
  if (!accessToken) {
    throw new Error("Trestle authentication did not return an access token.");
  }

  const expiresInSec = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 28800;
  tokenCache.set(sourceKey, {
    accessToken,
    expiresAtMs: now + expiresInSec * 1000,
  });

  return accessToken;
}

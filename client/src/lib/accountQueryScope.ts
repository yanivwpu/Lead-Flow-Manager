import type { QueryClient } from "@tanstack/react-query";

/** Extra query-key segment so account caches cannot collide. Not sent as a URL path. */
export const USER_QUERY_SCOPE_PREFIX = "user:";

export function accountQueryScopeSegment(userId: string | null | undefined): string {
  const id = userId?.trim();
  return id ? `${USER_QUERY_SCOPE_PREFIX}${id}` : `${USER_QUERY_SCOPE_PREFIX}anon`;
}

/**
 * Append a `user:` segment at the end so existing prefix invalidations
 * (`["/api/channels"]`) still match, while Account A/B caches cannot collide.
 */
export function withUserQueryScope(
  queryKey: readonly unknown[],
  userId: string | null | undefined,
): readonly unknown[] {
  return [...queryKey, accountQueryScopeSegment(userId)];
}

export function userScopedQueryKey(
  path: string,
  userId: string | null | undefined,
  ...rest: unknown[]
): readonly unknown[] {
  return withUserQueryScope([path, ...rest], userId);
}

/**
 * Default React Query fetch URL: string key parts joined with `/`,
 * excluding `user:` scope segments so `["/api/channels", "user:abc"]` still hits `/api/channels`.
 */
export function resolveQueryRequestUrl(queryKey: readonly unknown[]): string {
  const parts = queryKey.filter(
    (k): k is string => typeof k === "string" && k.length > 0 && !k.startsWith(USER_QUERY_SCOPE_PREFIX),
  );
  return parts.join("/");
}

const ACCOUNT_HINT_PREFIXES = ["whachat_ig_account_id_hint"];

/** Legacy unscoped IG wizard hint — must never drive Connected state. */
export const LEGACY_IG_ACCOUNT_HINT_KEY = "whachat_ig_account_id_hint";

export function instagramAccountHintStorageKey(userId: string | null | undefined): string {
  const id = userId?.trim();
  return id ? `${LEGACY_IG_ACCOUNT_HINT_KEY}:${id}` : LEGACY_IG_ACCOUNT_HINT_KEY;
}

export function clearAccountLocalHints(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_IG_ACCOUNT_HINT_KEY);
    localStorage.removeItem("chatcrm_current_user");
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (ACCOUNT_HINT_PREFIXES.some((p) => key === p || key.startsWith(`${p}:`))) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* private mode / quota */
  }
}

/** Drop all React Query entries so Account B cannot render Account A. */
export function resetAccountQueryCache(queryClient: QueryClient): void {
  queryClient.clear();
}

export type SessionUser = {
  id: string;
  name?: string;
  email?: string;
  [key: string]: unknown;
};

/** Cookie-session identity only. Never use login JSON as a substitute. */
export async function fetchAuthoritativeSessionUser(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (!response.ok) return null;
  const data = (await response.json().catch(() => null)) as SessionUser | null;
  if (!data || typeof data.id !== "string" || !data.id.trim()) return null;
  return data;
}

export function sessionIdentitiesMatch(
  clientUserId: string | null | undefined,
  serverUserId: string | null | undefined,
): boolean {
  const a = String(clientUserId || "").trim();
  const b = String(serverUserId || "").trim();
  return a.length > 0 && a === b;
}

export type AuthIdentityGate = "unknown" | "match" | "mismatch" | "signed_out";

/** Private channel UI is allowed only on AUTH MATCH. */
export function resolveAuthIdentityGate(input: {
  isLoading: boolean;
  clientUserId: string | null | undefined;
  serverConfirmedUserId: string | null | undefined;
}): AuthIdentityGate {
  if (input.isLoading) return "unknown";
  const client = String(input.clientUserId || "").trim();
  const server = String(input.serverConfirmedUserId || "").trim();
  if (!client && !server) return "signed_out";
  if (!server) return client ? "signed_out" : "unknown";
  if (!client) return "unknown";
  if (client !== server) return "mismatch";
  return "match";
}

export function privateAccountUiAllowed(gate: AuthIdentityGate): boolean {
  return gate === "match";
}

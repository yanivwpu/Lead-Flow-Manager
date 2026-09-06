/**
 * Widget origin allowlist: fail-closed unless an explicit origin or allow-any is set.
 * Origin remains an abuse control, not a tenant secret.
 */

import { parseHttpUrl } from "./webchatPageContext";

export const WEBCHAT_ORIGIN_ALLOW_ANY_KEY = "allowAnyOrigin";

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type OriginPolicyEnv = {
  nodeEnv?: string | null;
};

export type NormalizedOrigin = {
  origin: string;
  host: string;
  protocol: "http:" | "https:";
  isLocalhost: boolean;
};

export function isProductionOriginEnv(env: OriginPolicyEnv = {}): boolean {
  return String(env.nodeEnv || process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

export function canonicalizeOriginInput(raw: string, env: OriginPolicyEnv = {}): NormalizedOrigin | null {
  const trimmed = String(raw || "").trim().toLowerCase().replace(/\/$/, "");
  if (!trimmed) return null;
  const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  const parsed = parseHttpUrl(withScheme);
  if (!parsed) return null;
  const protocol = parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.protocol : null;
  if (!protocol) return null;
  const host = parsed.hostname.toLowerCase();
  const isLocalhost = LOCALHOST_HOSTS.has(host);
  if (isProductionOriginEnv(env)) {
    if (isLocalhost) return null;
    if (protocol !== "https:") return null;
  } else if (!isLocalhost && protocol !== "https:") {
    return null;
  }
  return {
    origin: parsed.origin.toLowerCase(),
    host,
    protocol,
    isLocalhost,
  };
}

/** Apex + www pair so operators do not have to guess. Exact match still applies at request time. */
export function originPairFor(normalized: NormalizedOrigin): string[] {
  if (normalized.isLocalhost) return [normalized.origin];
  const host = normalized.host;
  const siblingHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const port = (() => {
    try {
      const u = new URL(normalized.origin);
      return u.port ? `:${u.port}` : "";
    } catch {
      return "";
    }
  })();
  const a = `${normalized.protocol}//${host}${port}`;
  const b = `${normalized.protocol}//${siblingHost}${port}`;
  return a === b ? [a] : [a, b];
}

export function normalizeAllowedOriginsList(
  raw: unknown,
  env: OriginPolicyEnv = {},
): string[] {
  const items = Array.isArray(raw) ? raw : [];
  const out = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const canon = canonicalizeOriginInput(item, env);
    if (!canon) continue;
    for (const o of originPairFor(canon)) out.add(o);
    if (out.size >= 50) break;
  }
  return [...out];
}

export function parseAllowAnyOrigin(settings: Record<string, unknown> | undefined): boolean {
  return settings?.[WEBCHAT_ORIGIN_ALLOW_ANY_KEY] === true;
}

export type PublicEmbedDecision =
  | { ok: true; allowAny: boolean; allowedOrigins: string[] }
  | { ok: false; reason: "no_origins" | "disabled" };

export function publicWidgetEmbedDecision(settings: Record<string, unknown> | undefined): PublicEmbedDecision {
  const enabled = !settings || settings.enabled !== false;
  if (!enabled) return { ok: false, reason: "disabled" };
  const allowAny = parseAllowAnyOrigin(settings);
  const allowedOrigins = normalizeAllowedOriginsList(settings?.allowedOrigins);
  if (allowAny) return { ok: true, allowAny: true, allowedOrigins };
  if (allowedOrigins.length === 0) return { ok: false, reason: "no_origins" };
  return { ok: true, allowAny: false, allowedOrigins };
}

export function originMatchesAllowlist(allowed: string[], candidateOrigin: string | null): boolean {
  if (!candidateOrigin) return false;
  const needle = candidateOrigin.replace(/\/$/, "").toLowerCase();
  return allowed.some((o) => o.replace(/\/$/, "").toLowerCase() === needle);
}

export type OwnerOriginDiagnostics = {
  canPubliclyEmbed: boolean;
  reason: "ok" | "disabled" | "no_origins" | "allow_any";
  allowedOriginCount: number;
  allowAnyOrigin: boolean;
  httpsRequiredInProduction: true;
  localhostAllowedInDevelopment: true;
  apexAndWwwArePaired: true;
  subdomainsAreExactMatchOnly: true;
};

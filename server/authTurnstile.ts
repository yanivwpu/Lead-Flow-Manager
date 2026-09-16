/**
 * Cloudflare Turnstile verification for public signup.
 * Secret key must never be exposed to the client.
 */

import { randomUUID } from "crypto";

export const TURNSTILE_GENERIC_ERROR =
  "We couldn’t verify this signup. Please try again.";

export const TURNSTILE_SIGNUP_ACTION = "signup";

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare official test keys (always pass / always fail). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const DEFAULT_PRODUCTION_HOSTS = [
  "app.whachatcrm.com",
  "www.whachatcrm.com",
  "whachatcrm.com",
] as const;

const SAFE_SITEVERIFY_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "missing-input-response",
  "invalid-input-response",
  "bad-request",
  "timeout-or-duplicate",
  "internal-error",
]);

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "misconfigured" | "network" | "hostname" | "action" };

export type TurnstileSiteverifyRequest = {
  url: string;
  method: "POST";
  contentType: "application/x-www-form-urlencoded";
  body: string;
  fieldNames: string[];
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function normalizeTurnstileSecret(raw: string | undefined): string | undefined {
  let key = String(raw || "").trim();
  if (!key) return undefined;
  if (
    (key.startsWith('"') && key.endsWith('"') && key.length >= 2) ||
    (key.startsWith("'") && key.endsWith("'") && key.length >= 2)
  ) {
    key = key.slice(1, -1).trim();
  }
  return key || undefined;
}

export function getTurnstileSiteKey(): string | undefined {
  return normalizeTurnstileSecret(process.env.VITE_TURNSTILE_SITE_KEY);
}

export function getTurnstileSecretKey(): string | undefined {
  return normalizeTurnstileSecret(process.env.TURNSTILE_SECRET_KEY);
}

/** True when both site + secret keys are present in this process environment. */
export function isTurnstileConfigured(): boolean {
  return !!(getTurnstileSiteKey() && getTurnstileSecretKey());
}

function hostnameFromUrl(raw: string | undefined): string | undefined {
  const value = String(raw || "").trim();
  if (!value) return undefined;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Hostnames the widget may run on. Cloudflare dashboard must list the same names. */
export function expectedTurnstileHostnames(): string[] {
  const hosts = new Set<string>(DEFAULT_PRODUCTION_HOSTS);
  for (const raw of [process.env.APP_URL, process.env.MARKETING_URL]) {
    const host = hostnameFromUrl(raw);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

export function turnstileHostnameAllowed(hostname: unknown): boolean {
  const host = String(hostname || "")
    .trim()
    .toLowerCase();
  if (!host) return false;
  return expectedTurnstileHostnames().includes(host);
}

/** Cloudflare remoteip must be a single IPv4/IPv6 address — never "unknown" or a header list. */
export function isUsableTurnstileRemoteIp(ip: unknown): boolean {
  const value = String(ip || "").trim();
  if (!value || value === "unknown") return false;
  if (value.includes(",") || value.includes(" ")) return false;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((octet) => {
      const n = Number(octet);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  if (value.includes("%")) return false;
  if (value.includes(":") && /^[0-9a-f:]+$/i.test(value) && value.length <= 45) {
    return true;
  }
  return false;
}

export function sanitizeTurnstileErrorCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((code) => String(code)).filter((code) => SAFE_SITEVERIFY_ERROR_CODES.has(code));
}

/**
 * Deterministic Cloudflare Siteverify body. Always a form-urlencoded string.
 * Never includes widget `action` — that is validated on the JSON response.
 */
export function buildTurnstileSiteverifyRequest(input: {
  secret: string;
  token: string;
  remoteIp?: string | null;
  idempotencyKey?: string | null;
  url?: string;
}): TurnstileSiteverifyRequest {
  const params = new URLSearchParams();
  params.set("secret", input.secret);
  params.set("response", input.token);
  const fieldNames = ["secret", "response"];
  if (isUsableTurnstileRemoteIp(input.remoteIp)) {
    params.set("remoteip", String(input.remoteIp).trim());
    fieldNames.push("remoteip");
  }
  const idem = String(input.idempotencyKey || "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idem)) {
    params.set("idempotency_key", idem);
    fieldNames.push("idempotency_key");
  }
  const body = params.toString();
  return {
    url: input.url || TURNSTILE_SITEVERIFY_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body,
    fieldNames,
  };
}

export function describeTurnstileReadiness(): {
  production: boolean;
  siteKeyPresent: boolean;
  secretPresent: boolean;
  required: boolean;
  failClosed: boolean;
} {
  const production = isProduction();
  return {
    production,
    siteKeyPresent: !!getTurnstileSiteKey(),
    secretPresent: !!getTurnstileSecretKey(),
    required: production || isTurnstileConfigured(),
    failClosed: production,
  };
}

/**
 * Log a clear startup warning when production is missing Turnstile keys.
 * Call once during server boot. Never logs key material.
 */
export function warnIfTurnstileMisconfigured(): void {
  const readiness = describeTurnstileReadiness();
  if (!readiness.production) return;
  if (readiness.siteKeyPresent && readiness.secretPresent) {
    console.log("[TURNSTILE] Production keys configured — signup verification required");
    return;
  }
  console.error(
    "[TURNSTILE] WARNING: Production is missing VITE_TURNSTILE_SITE_KEY and/or TURNSTILE_SECRET_KEY. " +
      "Public signup is fail-closed and will reject Turnstile-gated attempts until both keys are set. " +
      "VITE_TURNSTILE_SITE_KEY must be present at Railway build time (Vite inlines it into the client). " +
      "TURNSTILE_SECRET_KEY is required at server runtime. " +
      "Use Cloudflare dashboard → Turnstile → create a widget, then set both env vars and redeploy.",
  );
}

/**
 * Production always requires verification (fail-closed), even if keys are missing.
 * Development requires verification only when both keys are configured.
 */
export function isTurnstileRequired(): boolean {
  return isProduction() || isTurnstileConfigured();
}

function classifySiteverifyFailure(errorCodes: unknown): TurnstileVerifyResult["reason"] {
  const codes = sanitizeTurnstileErrorCodes(errorCodes);
  if (codes.includes("missing-input-response") || codes.includes("missing-input-secret")) {
    return "missing";
  }
  if (codes.includes("bad-request") || codes.includes("internal-error")) {
    return "network";
  }
  return "invalid";
}

async function readSiteverifyPayload(response: Response): Promise<{
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
} | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };
  } catch {
    return null;
  }
}

export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string | null,
  deps?: {
    fetchImpl?: typeof fetch;
    siteverifyUrl?: string;
    idempotencyKey?: string;
  },
): Promise<TurnstileVerifyResult> {
  const secret = getTurnstileSecretKey();
  const production = isProduction();

  if (!secret) {
    return production ? { ok: false, reason: "misconfigured" } : { ok: true };
  }

  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, reason: "missing" };
  }

  const request = buildTurnstileSiteverifyRequest({
    secret,
    token: token.trim(),
    remoteIp,
    idempotencyKey: deps?.idempotencyKey || randomUUID(),
    url: deps?.siteverifyUrl,
  });

  try {
    const fetchImpl = deps?.fetchImpl || fetch;
    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: { "Content-Type": request.contentType },
      body: request.body,
    });

    const data = await readSiteverifyPayload(response);
    const errorCodes = sanitizeTurnstileErrorCodes(data?.["error-codes"]);

    if (!response.ok) {
      console.warn("[TURNSTILE] siteverify HTTP error:", {
        status: response.status,
        errorCodes: errorCodes.length ? errorCodes : ["unparseable"],
      });
      return { ok: false, reason: classifySiteverifyFailure(errorCodes) };
    }

    if (!data || data.success !== true) {
      console.warn("[TURNSTILE] verification failed:", classifySiteverifyFailure(errorCodes));
      return { ok: false, reason: classifySiteverifyFailure(errorCodes) };
    }

    const usingTestKeys = secret === TURNSTILE_TEST_SECRET_KEY;
    if (!usingTestKeys) {
      if (!turnstileHostnameAllowed(data.hostname)) {
        console.warn("[TURNSTILE] verification failed:", "hostname");
        return { ok: false, reason: "hostname" };
      }
      const action = String(data.action || "").trim();
      if (action && action !== TURNSTILE_SIGNUP_ACTION) {
        console.warn("[TURNSTILE] verification failed:", "action");
        return { ok: false, reason: "action" };
      }
    }

    return { ok: true };
  } catch (err) {
    console.warn("[TURNSTILE] siteverify exception:", (err as Error)?.name || "Error");
    return { ok: false, reason: "network" };
  }
}

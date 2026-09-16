/**
 * Cloudflare Turnstile verification for public signup.
 * Secret key must never be exposed to the client.
 */

export const TURNSTILE_GENERIC_ERROR =
  "We couldn’t verify this signup. Please try again.";

export const TURNSTILE_SIGNUP_ACTION = "signup";

/** Cloudflare official test keys (always pass / always fail). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

const DEFAULT_PRODUCTION_HOSTS = [
  "app.whachatcrm.com",
  "www.whachatcrm.com",
  "whachatcrm.com",
] as const;

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "misconfigured" | "network" | "hostname" | "action" };

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getTurnstileSiteKey(): string | undefined {
  const key = process.env.VITE_TURNSTILE_SITE_KEY?.trim();
  return key || undefined;
}

export function getTurnstileSecretKey(): string | undefined {
  const key = process.env.TURNSTILE_SECRET_KEY?.trim();
  return key || undefined;
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
  const codes = Array.isArray(errorCodes) ? errorCodes.map((c) => String(c)) : [];
  if (codes.some((c) => c === "missing-input-response" || c === "timeout-or-duplicate")) {
    return codes.includes("missing-input-response") ? "missing" : "invalid";
  }
  return "invalid";
}

export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = getTurnstileSecretKey();
  const production = isProduction();

  if (!secret) {
    return production ? { ok: false, reason: "misconfigured" } : { ok: true };
  }

  if (typeof token !== "string" || !token.trim()) {
    return { ok: false, reason: "missing" };
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token.trim());
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      console.warn("[TURNSTILE] siteverify HTTP error:", response.status);
      return { ok: false, reason: "network" };
    }

    const data = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
      "error-codes"?: string[];
    };
    if (data.success !== true) {
      console.warn("[TURNSTILE] verification failed:", classifySiteverifyFailure(data["error-codes"]));
      return { ok: false, reason: classifySiteverifyFailure(data["error-codes"]) };
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

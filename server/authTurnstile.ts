/**
 * Cloudflare Turnstile verification for public signup.
 * Secret key must never be exposed to the client.
 */

export const TURNSTILE_GENERIC_ERROR =
  "We couldn’t verify this signup. Please try again.";

/** Cloudflare official test keys (always pass / always fail). */
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export type TurnstileVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "misconfigured" | "network" };

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

/** True when both site + secret keys are configured (production or test). */
export function isTurnstileConfigured(): boolean {
  return !!(getTurnstileSiteKey() && getTurnstileSecretKey());
}

/**
 * Log a clear startup warning when production is missing Turnstile keys.
 * Call once during server boot.
 */
export function warnIfTurnstileMisconfigured(): void {
  if (!isProduction()) return;
  if (isTurnstileConfigured()) {
    console.log("[TURNSTILE] Production keys configured — signup verification required");
    return;
  }
  console.error(
    "[TURNSTILE] WARNING: Production is missing VITE_TURNSTILE_SITE_KEY and/or TURNSTILE_SECRET_KEY. " +
      "Public signup will reject Turnstile-gated attempts until both keys are set. " +
      "Use Cloudflare dashboard → Turnstile → create a widget, then set both env vars.",
  );
}

/**
 * Turnstile is required only when both site + secret keys are configured.
 * Missing production keys: startup warns; signup is not silently treated as verified
 * for invalid tokens — verification is simply not enabled until keys are set.
 */
export function isTurnstileRequired(): boolean {
  return isTurnstileConfigured();
}

export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string | null,
): Promise<TurnstileVerifyResult> {
  const secret = getTurnstileSecretKey();

  if (!secret) {
    // Not configured — caller should only invoke when isTurnstileRequired()
    return { ok: true };
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

    const data = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (data.success === true) {
      return { ok: true };
    }
    console.warn("[TURNSTILE] verification failed:", data["error-codes"] ?? "unknown");
    return { ok: false, reason: "invalid" };
  } catch (err) {
    console.warn("[TURNSTILE] siteverify exception:", (err as Error)?.message);
    return { ok: false, reason: "network" };
  }
}

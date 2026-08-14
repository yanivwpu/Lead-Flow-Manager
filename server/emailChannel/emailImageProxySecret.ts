/**
 * Email image proxy URL signing — production fail-closed secret policy.
 *
 * Production: EMAIL_IMAGE_PROXY_SECRET required (dedicated key; no weak/hardcoded fallback).
 * Development: EMAIL_IMAGE_PROXY_SECRET, else EMAIL_ENCRYPTION_KEY, else SESSION_SECRET.
 * Never uses an empty or hardcoded development placeholder in production.
 */
import crypto from "crypto";

const WEAK_PLACEHOLDER = "email-image-proxy-dev-only";
const MIN_PROD_SECRET_LEN = 32;

/** Signed proxy URL lifetime (default 7 days). Re-signed on email-details render. */
export const EMAIL_IMAGE_PROXY_URL_TTL_SEC = Number(
  process.env.EMAIL_IMAGE_PROXY_URL_TTL_SEC || 7 * 24 * 60 * 60,
);

function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function resolveEmailImageProxySecretMaterial(
  env: NodeJS.ProcessEnv = process.env,
): { secret: string; source: string } | { secret: null; source: null; reason: string } {
  const dedicated = String(env.EMAIL_IMAGE_PROXY_SECRET || "").trim();
  if (dedicated) {
    if (dedicated === WEAK_PLACEHOLDER) {
      return { secret: null, source: null, reason: "weak_placeholder_secret" };
    }
    if (isProductionRuntime(env) && dedicated.length < MIN_PROD_SECRET_LEN) {
      return { secret: null, source: null, reason: "secret_too_short" };
    }
    return { secret: dedicated, source: "EMAIL_IMAGE_PROXY_SECRET" };
  }

  if (isProductionRuntime(env)) {
    return { secret: null, source: null, reason: "missing_EMAIL_IMAGE_PROXY_SECRET" };
  }

  const emailKey = String(env.EMAIL_ENCRYPTION_KEY || "").trim();
  if (emailKey && emailKey !== WEAK_PLACEHOLDER) {
    return { secret: emailKey, source: "EMAIL_ENCRYPTION_KEY" };
  }
  const session = String(env.SESSION_SECRET || "").trim();
  if (session && session !== WEAK_PLACEHOLDER) {
    return { secret: session, source: "SESSION_SECRET" };
  }
  return { secret: null, source: null, reason: "no_dev_secret_configured" };
}

export function assertEmailImageProxySecretConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const resolved = resolveEmailImageProxySecretMaterial(env);
  if (!resolved.secret) {
    const reason = "reason" in resolved ? resolved.reason : "missing";
    const production = isProductionRuntime(env);
    const msg = production
      ? `Email image proxy is not configured for production. Set EMAIL_IMAGE_PROXY_SECRET to a cryptographically strong secret (≥${MIN_PROD_SECRET_LEN} chars). (${reason})`
      : `Email image proxy signing secret is not configured. Set EMAIL_IMAGE_PROXY_SECRET (or EMAIL_ENCRYPTION_KEY / SESSION_SECRET in development). (${reason})`;
    console.error(
      JSON.stringify({
        tag: "[EmailImageProxy]",
        event: "secret_misconfigured",
        reason,
        production,
      }),
    );
    throw new Error(msg);
  }
}

function getSigningSecret(): string {
  assertEmailImageProxySecretConfigured();
  const resolved = resolveEmailImageProxySecretMaterial();
  if (!resolved.secret) throw new Error("Email image proxy secret unavailable");
  return resolved.secret;
}

/** Canonical payload covered by the HMAC (URL + expiry). */
export function emailImageProxySignPayload(remoteUrl: string, expiresUnixSec: number): string {
  return `${String(remoteUrl).trim()}|${String(expiresUnixSec)}`;
}

export function signEmailImageProxyRequest(remoteUrl: string, expiresUnixSec: number): string {
  const payload = emailImageProxySignPayload(remoteUrl, expiresUnixSec);
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

export function verifyEmailImageProxyRequest(params: {
  remoteUrl: string;
  expiresUnixSec: number;
  signature: string;
  nowUnixSec?: number;
}): boolean {
  const now = params.nowUnixSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(params.expiresUnixSec) || params.expiresUnixSec < now) {
    return false;
  }
  let expected: string;
  try {
    expected = signEmailImageProxyRequest(params.remoteUrl, params.expiresUnixSec);
  } catch {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(String(params.signature || ""));
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildSignedEmailImageProxyQuery(remoteUrl: string): {
  expiresUnixSec: number;
  signature: string;
} {
  const expiresUnixSec = Math.floor(Date.now() / 1000) + Math.max(60, EMAIL_IMAGE_PROXY_URL_TTL_SEC);
  return {
    expiresUnixSec,
    signature: signEmailImageProxyRequest(remoteUrl, expiresUnixSec),
  };
}

/** Startup / route probe — logs ok or throws in production when called via assert. */
export function logEmailImageProxySecretStartupStatus(): void {
  const resolved = resolveEmailImageProxySecretMaterial();
  const production = isProductionRuntime();
  if (resolved.secret) {
    console.log(
      JSON.stringify({
        tag: "[EmailImageProxy]",
        event: "secret_ok",
        source: resolved.source,
        production,
        ttlSec: EMAIL_IMAGE_PROXY_URL_TTL_SEC,
      }),
    );
    return;
  }
  console.error(
    JSON.stringify({
      tag: "[EmailImageProxy]",
      event: "secret_missing",
      reason: "reason" in resolved ? resolved.reason : "missing",
      production,
    }),
  );
  if (production) {
    assertEmailImageProxySecretConfigured();
  }
}

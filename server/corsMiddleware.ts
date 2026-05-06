import type { Request, Response, NextFunction } from "express";
import { getAppOrigin, getMarketingOrigin } from "./urlOrigins";

/**
 * Browsers send `Origin` on credentialed / cross-origin API calls. We must echo
 * that exact origin in `Access-Control-Allow-Origin` (not `*`) when using cookies.
 */
function parseExtraOriginsFromEnv(): string[] {
  const raw = process.env.CORS_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function addOrigin(set: Set<string>, value: string) {
  try {
    const o = new URL(value.includes("://") ? value : `https://${value}`).origin;
    set.add(o);
  } catch {
    /* ignore */
  }
}

function buildDefaultAllowedOrigins(): Set<string> {
  const set = new Set<string>();
  addOrigin(set, "https://www.whachatcrm.com");
  addOrigin(set, "https://app.whachatcrm.com");
  addOrigin(set, getAppOrigin());
  addOrigin(set, getMarketingOrigin());
  for (const o of parseExtraOriginsFromEnv()) {
    addOrigin(set, o);
  }
  return set;
}

const DEFAULT_ALLOWED = buildDefaultAllowedOrigins();

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (DEFAULT_ALLOWED.has(origin)) return true;
  return isLocalhostHttpOrigin(origin);
}

/** `http://localhost:*` and `http://127.0.0.1:*` (any port) for Vite / local dev */
function isLocalhostHttpOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

/**
 * Register early in `index.ts` (before host redirects) so OPTIONS preflight is not
 * 301-redirected away from the API host, which breaks credentialed fetches.
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (origin && isCorsOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
  const reqHdr = req.headers["access-control-request-headers"];
  res.setHeader(
    "Access-Control-Allow-Headers",
    typeof reqHdr === "string" && reqHdr.length > 0
      ? reqHdr
      : "Content-Type, Authorization, X-Requested-With, X-CSRF-Token, Cookie, Accept, Origin"
  );
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
}

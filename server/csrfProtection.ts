import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getAppOrigin, getMarketingOrigin } from "./urlOrigins";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CREDENTIAL_ENTRY = new Set([
  "/api/auth/login", "/api/auth/signup", "/api/admin/login",
  "/api/sales-portal/login", "/api/partner-portal/login", "/oidc/authorize",
]);
const TOKEN_PATH = "/api/security/csrf-token";

function cookieToken(sessionCookie: string): string {
  // The signed, opaque session cookie is already an unguessable credential.
  // Domain separation avoids reusing its value as a CSRF token.
  return createHmac("sha256", sessionCookie).update("whachat:browser-csrf:v1").digest("hex");
}

function equalCsrfToken(actual: unknown, expected: unknown): boolean {
  return typeof actual === "string" && typeof expected === "string" &&
    /^[a-f0-9]{64}$/.test(actual) && /^[a-f0-9]{64}$/.test(expected) &&
    timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function trustedOrigin(req: Request, value: string, referer = false): boolean {
  try {
    const parsed = new URL(value);
    if (!referer && parsed.origin !== value) return false;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.username || parsed.password) return false;
    const target = new URL(`${req.protocol}://${req.get("host")}`).origin;
    // Exact first-party origins only; the broader widget/dev CORS policy is not a CSRF trust list.
    return parsed.origin === target || parsed.origin === getAppOrigin() || parsed.origin === getMarketingOrigin();
  } catch { return false; }
}

function browserEvidence(req: Request): "trusted" | "foreign" | "absent" {
  const site = req.get("sec-fetch-site");
  const origin = req.get("origin");
  const referer = req.get("referer");
  if (site === "cross-site") return "foreign";
  if (origin !== undefined) return trustedOrigin(req, origin) ? "trusted" : "foreign";
  if (referer !== undefined) return trustedOrigin(req, referer, true) ? "trusted" : "foreign";
  if (site === "same-origin") return "trusted";
  if (site === "same-site") return "foreign"; // A sibling origin is not automatically trusted.
  return "absent";
}

/**
 * Guard cookie-authenticated unsafe requests before OIDC/session-backed handlers.
 * Modern first-party browsers use Origin/Referer or Fetch Metadata. Clients without
 * browser provenance must prove possession of a session-bound double-submit token.
 * Cookie-free provider calls retain their existing signature/API authentication.
 * No webhook paths are exempted from protection when they carry session cookies.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  const path = req.path.toLowerCase().replace(/\/+$/, "") || "/";
  const rawSession = req.cookies?.["connect.sid"];
  const sessionCookie = typeof rawSession === "string" && rawSession.length > 0 ? rawSession : undefined;
  const evidence = browserEvidence(req);

  if (method === "GET" && path === TOKEN_PATH) {
    res.set("Cache-Control", "no-store");
    if (!sessionCookie || evidence === "foreign") return res.status(403).json({ error: "CSRF token unavailable" });
    const token = cookieToken(sessionCookie);
    res.cookie("appCsrfToken", token, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/",
    });
    return res.json({ csrfToken: token });
  }
  if (SAFE_METHODS.has(method)) return next();

  const cookieDependent = !!sessionCookie || !!req.cookies?.ghl_oauth_handoff;
  const credentialEntry = CREDENTIAL_ENTRY.has(path);
  if (!cookieDependent && !credentialEntry) return next();
  if (evidence === "foreign") return res.status(403).json({ error: "Cross-origin request rejected", code: "CSRF_INVALID" });
  if (evidence === "trusted") return next();

  // No authenticated cookie: permit JSON credential entry by non-browser clients.
  // Cross-origin browser forms cannot submit JSON without a CORS preflight.
  if (!cookieDependent && credentialEntry && !req.get("sec-fetch-site") && req.is("application/json")) return next();

  const supplied = req.get("x-csrf-token");
  if (sessionCookie && equalCsrfToken(req.cookies?.appCsrfToken, supplied) &&
      equalCsrfToken(supplied, cookieToken(sessionCookie))) return next();
  return res.status(403).json({ error: "CSRF protection requires a trusted origin or session token", code: "CSRF_INVALID" });
}

import type { Request, Response, NextFunction } from "express";
import IORedis from "ioredis";

/** Webhook routes must never be rate-limited (provider retries + signature verification). */
export const WEBHOOK_RATE_LIMIT_EXCLUDED_PREFIXES = [
  "/api/webhook/meta",
  "/api/stripe/webhook",
  "/api/shopify/webhooks",
  "/api/webhooks/calendly",
  "/api/webhooks/woocommerce",
] as const;

export function isWebhookPath(path: string): boolean {
  if (path.includes("/webhook")) return true;
  return WEBHOOK_RATE_LIMIT_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export type RateLimitRule = {
  id: string;
  match: (path: string, method: string) => boolean;
  limit: number;
  windowMs: number;
};

function isIntegrationStartOrComplete(path: string): boolean {
  if (!path.startsWith("/api/integrations/")) return false;
  const last = path.split("/").filter(Boolean).pop() ?? "";
  return last === "start" || last.startsWith("complete") || last === "start-redirect";
}

const INVENTORY_MATCHES_PATH = /^\/api\/contacts\/[^/]+\/inventory-matches$/;
const CONTACTS_API_PREFIX = "/api/contacts";
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Contact / CRM rate limits.
 *
 * IMPORTANT: Do not share one low bucket across all /api/contacts* traffic.
 * Authenticated Inbox uses many GETs (detail, timeline, notes, appointments).
 * That used to exhaust a combined 120/15m "contact" limit and 429 manual CRM
 * PATCH saves (Prospect Intelligence email enrichment).
 *
 * Split:
 * - public-contact: unauthenticated lead capture form
 * - contacts-read: authenticated CRM reads (generous)
 * - contacts-write: authenticated CRM mutations (manual edits / sends)
 */
export const RATE_LIMIT_RULES: RateLimitRule[] = [
  { id: "auth", match: (path) => path.startsWith("/api/auth"), limit: 30, windowMs: 15 * 60 * 1000 },
  {
    id: "public-contact",
    match: (path) => path === "/api/contact",
    limit: 30,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: "inventory-matches-read",
    match: (path, method) => method === "GET" && INVENTORY_MATCHES_PATH.test(path),
    limit: 240,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: "contacts-write",
    match: (path, method) =>
      WRITE_METHODS.has(method.toUpperCase()) && path.startsWith(CONTACTS_API_PREFIX),
    // Manual CRM edits + send: ample for normal use, still abuse-resistant
    limit: 180,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: "contacts-read",
    match: (path, method) => method.toUpperCase() === "GET" && path.startsWith(CONTACTS_API_PREFIX),
    // Inbox polls detail/timeline/notes heavily — keep separate from writes
    limit: 1200,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: "widget",
    match: (path) => path.startsWith("/api/widget") || path === "/widget.js",
    limit: 180,
    windowMs: 15 * 60 * 1000,
  },
  { id: "ai", match: (path) => path.startsWith("/api/ai"), limit: 90, windowMs: 15 * 60 * 1000 },
  {
    id: "templates-send",
    match: (path, method) => method === "POST" && path === "/api/templates/send",
    limit: 40,
    windowMs: 60 * 60 * 1000,
  },
  {
    id: "campaigns",
    match: (path) =>
      path.startsWith("/api/campaign-enrollments") || path.startsWith("/api/preset-campaigns"),
    limit: 90,
    windowMs: 15 * 60 * 1000,
  },
  {
    id: "integrations-oauth",
    match: (path) => isIntegrationStartOrComplete(path),
    limit: 25,
    windowMs: 60 * 60 * 1000,
  },
];

function parseRedisUrl(raw: string): string {
  let url = raw.trim();
  const match = url.match(/(rediss?:\/\/.+)/);
  if (match) url = match[1];
  if (url.includes("upstash.io") && url.startsWith("redis://")) {
    url = url.replace("redis://", "rediss://");
  }
  return url;
}

let optionalRedis: IORedis | null | undefined;

function getOptionalRedis(): IORedis | null {
  if (optionalRedis !== undefined) return optionalRedis;

  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl) {
    optionalRedis = null;
    console.log("[RATE_LIMIT] REDIS_URL unset — using in-memory fallback (local/dev only)");
    return null;
  }

  try {
    const redisUrl = parseRedisUrl(rawUrl);
    const useTls = redisUrl.startsWith("rediss://") || redisUrl.includes("upstash.io");
    optionalRedis = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      tls: useTls ? {} : undefined,
    });
    optionalRedis.on("error", (err) => {
      console.warn("[RATE_LIMIT] Redis error (falling back to in-memory for this check):", err.message);
    });
    void optionalRedis.connect().catch((err) => {
      console.warn("[RATE_LIMIT] Redis connect failed — in-memory fallback:", err.message);
      optionalRedis = null;
    });
    console.log("[RATE_LIMIT] Redis-backed rate limiting enabled");
  } catch (err) {
    console.warn("[RATE_LIMIT] Redis init failed — in-memory fallback:", err);
    optionalRedis = null;
  }

  return optionalRedis;
}

type MemEntry = { count: number; expiresAt: number };
const memoryCounters = new Map<string, MemEntry>();

/** Test-only: clear in-memory counters between suites. */
export function __resetRateLimitMemoryForTests(): void {
  memoryCounters.clear();
}

function memoryIncrement(key: string, windowMs: number): number {
  const now = Date.now();
  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= now) {
    memoryCounters.set(key, { count: 1, expiresAt: now + windowMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

async function incrementCounter(key: string, windowMs: number): Promise<number> {
  const redis = getOptionalRedis();
  if (redis && redis.status === "ready") {
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }
      return count;
    } catch (err) {
      console.warn("[RATE_LIMIT] Redis incr failed — in-memory fallback:", err);
    }
  }
  return memoryIncrement(key, windowMs);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function findRateLimitRule(path: string, method: string): RateLimitRule | undefined {
  const normalizedMethod = method.toUpperCase();
  return RATE_LIMIT_RULES.find((rule) => rule.match(path, normalizedMethod));
}

export function listProtectedRateLimitPatterns(): string[] {
  return [
    "/api/auth/*",
    "POST /api/contact",
    "GET /api/contacts/*",
    "PATCH|POST|PUT|DELETE /api/contacts/*",
    "/api/widget*",
    "/widget.js",
    "/api/ai/*",
    "POST /api/templates/send",
    "/api/campaign-enrollments/*",
    "/api/preset-campaigns/*",
    "/api/integrations/*/start",
    "/api/integrations/*/complete*",
    "/api/integrations/*/start-redirect",
  ];
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || "";
  if (isWebhookPath(path)) {
    next();
    return;
  }

  const rule = findRateLimitRule(path, req.method);
  if (!rule) {
    next();
    return;
  }

  const user = (req as Request & { user?: { id?: string } }).user;
  const userId = user?.id ?? null;
  const ip = getClientIp(req);
  const identifier = userId ? `user:${userId}` : `ip:${ip}`;
  const windowStart = Math.floor(Date.now() / rule.windowMs);
  const key = `ratelimit:${rule.id}:${identifier}:${windowStart}`;

  void incrementCounter(key, rule.windowMs)
    .then((count) => {
      if (count > rule.limit) {
        console.log(
          `[RATE_LIMIT] ${req.method} ${path} ${ip} ${userId ?? "-"} limiter=${rule.id} limit=${rule.limit} windowMs=${rule.windowMs} count=${count}`,
        );
        res.status(429).json({
          error: "Too many requests. Please try again shortly.",
          code: "RATE_LIMITED",
          limiter: rule.id,
          retryAfterSec: Math.ceil(rule.windowMs / 1000),
        });
        return;
      }
      next();
    })
    .catch((err) => {
      console.warn("[RATE_LIMIT] check failed, allowing request:", err);
      next();
    });
}

import { rateLimit, ipKeyGenerator, type Options, type Store } from "express-rate-limit";
import {
  consumeRateLimit,
  getClientIp,
  resetRateLimitKey,
} from "./rateLimitMiddleware";

export const INBOX_CONTENT_WINDOW_MS = 60_000;
export const INBOX_CONTENT_READ_LIMIT = 240;

/** Use the existing Redis counters and their in-memory fallback, shared across content routes. */
class InboxContentStore implements Store {
  localKeys = false;
  constructor(private windowMs: number) {}
  private counterKey(key: string, now = Date.now()) {
    return `ratelimit:inbox-content-read:${key}:${Math.floor(now / this.windowMs)}`;
  }
  async increment(key: string) {
    const now = Date.now();
    const { count } = await consumeRateLimit(this.counterKey(key, now), Number.MAX_SAFE_INTEGER, this.windowMs);
    return { totalHits: count, resetTime: new Date((Math.floor(now / this.windowMs) + 1) * this.windowMs) };
  }
  // Every attempt counts; neither successful nor failed requests are refunded.
  async decrement(_key: string) {}
  async resetKey(key: string) { await resetRateLimitKey(this.counterKey(key)); }
}

function contentLimitOptions(limit: number, windowMs: number): Partial<Options> {
  return {
    windowMs,
    limit,
    store: new InboxContentStore(windowMs),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: req => req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(getClientIp(req))}`,
    handler: (_req, res) => res.status(429).json({
      error: "Too many inbox content requests. Please try again shortly.",
      code: "RATE_LIMITED",
      limiter: "inbox-content-read",
      retryAfterSec: Math.max(1, Number(res.getHeader("Retry-After")) || 1),
    }),
  };
}

export const inboxContentReadLimiter = rateLimit(contentLimitOptions(INBOX_CONTENT_READ_LIMIT, INBOX_CONTENT_WINDOW_MS));

export function createInboxContentReadLimiter(limit = INBOX_CONTENT_READ_LIMIT, windowMs = INBOX_CONTENT_WINDOW_MS) {
  return rateLimit(contentLimitOptions(limit, windowMs));
}

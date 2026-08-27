/**
 * Auth abuse rate limits + privacy-conscious security event audit log.
 * Reuses Redis from rateLimitMiddleware when available.
 */
import type { Request } from "express";
import { lt } from "drizzle-orm";
import { authSecurityEvents } from "@shared/schema";
import { db } from "../drizzle/db";
import {
  consumeRateLimit,
  getClientIp as resolveClientIp,
} from "./rateLimitMiddleware";
import { normalizeEmailAddress } from "@shared/disposableEmail";

export const AUTH_RATE_LIMIT_MESSAGE = "Too many requests. Please try again shortly.";

const HOUR_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 90;

export type AuthSecurityEventType =
  | "signup_attempt"
  | "signup_created_pending_verification"
  | "signup_rejected_disposable"
  | "signup_rejected_turnstile"
  | "signup_rejected_honeypot"
  | "signup_rejected_retired_identity"
  | "signup_rate_limited"
  | "email_verified"
  | "verification_resent"
  | "change_pending_email"
  | "forgot_password_requested"
  | "forgot_password_rate_limited";

export type AuthSecurityOutcome = "allowed" | "rejected" | "rate_limited" | "success" | "noop";

export function getAuthClientIp(req: Request): string {
  return resolveClientIp(req);
}

export function getAuthUserAgent(req: Request): string | null {
  const ua = req.get("user-agent");
  return ua ? ua.slice(0, 500) : null;
}

export function getRequestId(req: Request): string | null {
  const h = req.get("x-request-id") || req.get("x-correlation-id");
  return h ? h.slice(0, 120) : null;
}

/** Hash email for audit storage without keeping a full searchable address dump. */
export function protectedEmailIdentifier(email: string): string {
  const normalized = normalizeEmailAddress(email);
  // Short fingerprint + domain for investigations without full local-part
  const at = normalized.indexOf("@");
  if (at <= 0) return "invalid";
  const domain = normalized.slice(at + 1);
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = (Math.imul(31, h) + normalized.charCodeAt(i)) | 0;
  }
  return `${(h >>> 0).toString(16)}@${domain}`;
}

export async function logAuthSecurityEvent(input: {
  eventType: AuthSecurityEventType;
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  outcome: AuthSecurityOutcome;
  reasonCode?: string | null;
  requestId?: string | null;
}): Promise<void> {
  try {
    await db.insert(authSecurityEvents).values({
      eventType: input.eventType,
      userId: input.userId ?? null,
      normalizedEmail: input.email ? protectedEmailIdentifier(input.email) : null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      outcome: input.outcome,
      reasonCode: input.reasonCode ?? null,
      requestId: input.requestId ?? null,
    });
    // Opportunistic retention cleanup
    if (Math.random() < 0.02) {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await db.delete(authSecurityEvents).where(lt(authSecurityEvents.createdAt, cutoff));
    }
  } catch (err) {
    console.warn("[AUTH_SECURITY] log failed:", (err as Error)?.message);
  }
}

export type RateLimitCheck = { allowed: boolean; count: number };

async function checkBucket(
  bucket: string,
  limit: number,
  windowMs: number = HOUR_MS,
): Promise<RateLimitCheck> {
  const windowStart = Math.floor(Date.now() / windowMs);
  const key = `authlimit:${bucket}:${windowStart}`;
  return consumeRateLimit(key, limit, windowMs);
}

export async function checkSignupIpLimit(ip: string): Promise<RateLimitCheck> {
  return checkBucket(`signup:ip:${ip}`, 5);
}

export async function checkSignupEmailLimit(email: string): Promise<RateLimitCheck> {
  return checkBucket(`signup:email:${normalizeEmailAddress(email)}`, 3);
}

export async function checkVerificationResendLimit(email: string): Promise<RateLimitCheck> {
  return checkBucket(`verify-resend:email:${normalizeEmailAddress(email)}`, 3);
}

/** One resend per minute per pending account (in addition to the hourly cap). */
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export async function checkVerificationResendCooldown(userId: string): Promise<RateLimitCheck> {
  return checkBucket(`verify-resend-cd:user:${userId}`, 1, VERIFICATION_RESEND_COOLDOWN_MS);
}

export async function checkForgotPasswordIpLimit(ip: string): Promise<RateLimitCheck> {
  return checkBucket(`forgot:ip:${ip}`, 5);
}

export async function checkForgotPasswordEmailLimit(email: string): Promise<RateLimitCheck> {
  return checkBucket(`forgot:email:${normalizeEmailAddress(email)}`, 3);
}

/** Constant-ish delay helper to reduce timing enumeration on forgot-password. */
export async function softAuthDelay(ms = 80): Promise<void> {
  await new Promise((r) => setTimeout(r, ms + Math.floor(Math.random() * 40)));
}

/**
 * Pending public signups store emailVerifiedAt = null.
 * Missing/undefined (legacy session row without the column) is treated as verified
 * so existing users are not locked out during rollout.
 */
export function isEmailVerified(user: { emailVerifiedAt?: Date | string | null }): boolean {
  if (user.emailVerifiedAt === undefined) return true;
  return user.emailVerifiedAt != null && String(user.emailVerifiedAt).length > 0;
}

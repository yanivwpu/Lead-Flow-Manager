/**
 * Partner Portal + Sales Portal password reset.
 * Tokens are DB-backed, hashed at rest, single-use, 60-minute TTL, account-type scoped.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { portalPasswordResetTokens, partners, salespeople } from "@shared/schema";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import {
  sendPartnerPortalPasswordResetEmail,
  sendSalesPortalPasswordResetEmail,
} from "./email";

export const PORTAL_RESET_ACCOUNT_TYPES = ["partner", "salesperson"] as const;
export type PortalResetAccountType = (typeof PORTAL_RESET_ACCOUNT_TYPES)[number];

export const PORTAL_PASSWORD_MIN_LENGTH = 6;
export const PORTAL_RESET_TTL_MS = 60 * 60 * 1000;

export function normalizePortalEmail(email: unknown): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function validatePortalPassword(password: unknown): string | null {
  const p = String(password || "");
  if (p.length < PORTAL_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PORTAL_PASSWORD_MIN_LENGTH} characters`;
  }
  return null;
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function invalidateUnusedTokens(
  accountType: PortalResetAccountType,
  accountId: string,
): Promise<void> {
  await db
    .update(portalPasswordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(portalPasswordResetTokens.accountType, accountType),
        eq(portalPasswordResetTokens.accountId, accountId),
        isNull(portalPasswordResetTokens.usedAt),
        gt(portalPasswordResetTokens.expiresAt, new Date()),
      ),
    );
}

/** Best-effort cleanup of expired unused tokens (no background job required). */
async function purgeExpiredUnusedTokens(): Promise<void> {
  try {
    await db
      .delete(portalPasswordResetTokens)
      .where(
        and(
          isNull(portalPasswordResetTokens.usedAt),
          sql`${portalPasswordResetTokens.expiresAt} <= NOW()`,
        ),
      );
  } catch (err) {
    console.warn("[PORTAL_RESET] expired token purge skipped:", (err as Error)?.message);
  }
}

/**
 * Invalidate portal sessions in connect-pg-simple `user_sessions`.
 * Deletes every stored session whose JSON `sess` contains this account id.
 */
export async function invalidatePortalSessions(
  accountType: PortalResetAccountType,
  accountId: string,
): Promise<{ attempted: boolean; error?: string }> {
  try {
    if (accountType === "partner") {
      await db.execute(sql`DELETE FROM user_sessions WHERE sess->>'partnerId' = ${accountId}`);
    } else {
      await db.execute(
        sql`DELETE FROM user_sessions WHERE sess->>'salespersonId' = ${accountId}`,
      );
    }
    return { attempted: true };
  } catch (err) {
    const message = (err as Error)?.message || "unknown";
    console.warn("[PORTAL_RESET] session invalidation skipped:", message);
    return { attempted: true, error: message };
  }
}

/** True only for bcrypt hashes — never treat a login code as a password hash input path. */
export function isBcryptPasswordHash(value: string | null | undefined): boolean {
  return typeof value === "string" && /^\$2[aby]\$\d{2}\$/.test(value);
}

/**
 * Issue a reset token and email it. Returns whether an email was attempted for an existing account.
 * Callers must always return a neutral response to the client.
 */
export async function requestPortalPasswordReset(params: {
  accountType: PortalResetAccountType;
  email: string;
}): Promise<{ accountFound: boolean; emailSent: boolean }> {
  const email = normalizePortalEmail(params.email);
  if (!email) return { accountFound: false, emailSent: false };

  await purgeExpiredUnusedTokens();

  if (params.accountType === "partner") {
    const partner = await storage.getPartnerByEmail(email);
    if (!partner || partner.status === "deleted") {
      return { accountFound: false, emailSent: false };
    }
    if (partner.status !== "active") {
      // Still neutral — do not reveal paused state.
      return { accountFound: true, emailSent: false };
    }
    await invalidateUnusedTokens("partner", partner.id);
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await db.insert(portalPasswordResetTokens).values({
      accountType: "partner",
      accountId: partner.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PORTAL_RESET_TTL_MS),
    });
    let emailSent = false;
    try {
      emailSent = await sendPartnerPortalPasswordResetEmail(partner.email, rawToken);
    } catch (err) {
      console.error("[PORTAL_RESET] partner email send failed:", (err as Error)?.message);
    }
    return { accountFound: true, emailSent };
  }

  const salesperson = await storage.getSalespersonByEmail(email);
  if (!salesperson || !salesperson.isActive) {
    // Neutral for inactive / missing
    return { accountFound: Boolean(salesperson), emailSent: false };
  }
  await invalidateUnusedTokens("salesperson", salesperson.id);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  await db.insert(portalPasswordResetTokens).values({
    accountType: "salesperson",
    accountId: salesperson.id,
    tokenHash,
    expiresAt: new Date(Date.now() + PORTAL_RESET_TTL_MS),
  });
  let emailSent = false;
  try {
    emailSent = await sendSalesPortalPasswordResetEmail(salesperson.email, rawToken);
  } catch (err) {
    console.error("[PORTAL_RESET] sales email send failed:", (err as Error)?.message);
  }
  return { accountFound: true, emailSent };
}

export async function requestPortalPasswordResetByAccountId(params: {
  accountType: PortalResetAccountType;
  accountId: string;
}): Promise<{ ok: true; emailSent: boolean; email: string } | { ok: false; error: string }> {
  if (params.accountType === "partner") {
    const partner = await storage.getPartner(params.accountId);
    if (!partner) return { ok: false, error: "Partner not found" };
    if (partner.status !== "active") return { ok: false, error: "Partner account is not active" };
    const result = await requestPortalPasswordReset({
      accountType: "partner",
      email: partner.email,
    });
    return { ok: true, emailSent: result.emailSent, email: partner.email };
  }
  const salesperson = await storage.getSalesperson(params.accountId);
  if (!salesperson) return { ok: false, error: "Salesperson not found" };
  if (!salesperson.isActive) return { ok: false, error: "Salesperson account is not active" };
  const result = await requestPortalPasswordReset({
    accountType: "salesperson",
    email: salesperson.email,
  });
  return { ok: true, emailSent: result.emailSent, email: salesperson.email };
}

export async function completePortalPasswordReset(params: {
  accountType: PortalResetAccountType;
  rawToken: string;
  newPassword: string;
}): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const passwordError = validatePortalPassword(params.newPassword);
  if (passwordError) return { ok: false, error: passwordError };

  const rawToken = String(params.rawToken || "").trim();
  if (!rawToken || rawToken.length < 32) {
    return { ok: false, error: "Invalid or expired reset link" };
  }

  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select()
    .from(portalPasswordResetTokens)
    .where(eq(portalPasswordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.accountType !== params.accountType) {
    return { ok: false, error: "Invalid or expired reset link" };
  }
  if (row.usedAt) {
    return { ok: false, error: "This reset link has already been used" };
  }
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, error: "This reset link has expired" };
  }

  const hashedPassword = await bcrypt.hash(params.newPassword, 10);

  let accountId = row.accountId;
  if (params.accountType === "partner") {
    const [partner] = await db
      .select({ id: partners.id, status: partners.status })
      .from(partners)
      .where(eq(partners.id, row.accountId))
      .limit(1);
    if (!partner || partner.status !== "active") {
      return { ok: false, error: "Invalid or expired reset link" };
    }
    accountId = partner.id;
    await storage.updatePartner(partner.id, { password: hashedPassword });
  } else {
    const [person] = await db
      .select({
        id: salespeople.id,
        isActive: salespeople.isActive,
      })
      .from(salespeople)
      .where(eq(salespeople.id, row.accountId))
      .limit(1);
    if (!person || !person.isActive) {
      return { ok: false, error: "Invalid or expired reset link" };
    }
    accountId = person.id;
    // Set bcrypt password hash and rotate login code so the previous code stops working.
    const newLoginCode = await storage.generateUniqueLoginCode();
    await storage.updateSalesperson(person.id, {
      passwordHash: hashedPassword,
      loginCode: newLoginCode,
    });
  }

  await db
    .update(portalPasswordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(portalPasswordResetTokens.id, row.id));

  await invalidateUnusedTokens(params.accountType, row.accountId);
  await invalidatePortalSessions(params.accountType, accountId);

  return { ok: true, accountId };
}

/** In-memory rate limit for forgot-password (IP + email). */
const forgotBuckets = new Map<string, { count: number; resetAt: number }>();

export function allowPortalForgotRequest(key: string, limit = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const cur = forgotBuckets.get(key);
  if (!cur || now >= cur.resetAt) {
    forgotBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

/** Test helper — clear rate-limit buckets. */
export function clearPortalForgotRateLimitsForTests(): void {
  forgotBuckets.clear();
}

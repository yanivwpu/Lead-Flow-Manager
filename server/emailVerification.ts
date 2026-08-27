/**
 * Public signup email verification: hashed, single-use, expiring tokens.
 * Trial + welcome email start only after successful verification.
 */
import crypto from "node:crypto";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { emailVerificationTokens, users } from "@shared/schema";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import { sendEmailVerificationEmail, sendWelcomeEmail } from "./email";
import { isEmailVerified } from "./authSecurity";
import { isExcludedFromActivationEmails, isShopifyLinkedAccount } from "@shared/activationEmailEligibility";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TRIAL_DAYS = 14;

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function invalidateOtherUnusedTokens(userId: string, keepTokenId: string): Promise<void> {
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.usedAt),
        ne(emailVerificationTokens.id, keepTokenId),
      ),
    );
}

async function purgeExpiredUnusedTokens(): Promise<void> {
  try {
    await db
      .delete(emailVerificationTokens)
      .where(
        and(
          isNull(emailVerificationTokens.usedAt),
          sql`${emailVerificationTokens.expiresAt} <= NOW()`,
        ),
      );
  } catch (err) {
    console.warn("[EMAIL_VERIFY] expired token purge skipped:", (err as Error)?.message);
  }
}

export type IssuedEmailVerificationToken = {
  rawToken: string;
  tokenId: string;
};

/**
 * Insert a fresh 24-hour verification token without invalidating existing unused tokens.
 * Callers must finalize or abandon after the send attempt so a failed replacement
 * cannot destroy the last usable verification path.
 */
export async function insertEmailVerificationToken(userId: string): Promise<IssuedEmailVerificationToken> {
  await purgeExpiredUnusedTokens();

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  const inserted = await db
    .insert(emailVerificationTokens)
    .values({
      userId,
      tokenHash,
      expiresAt,
    })
    .returning({ id: emailVerificationTokens.id });

  const tokenId = inserted[0]?.id;
  if (!tokenId) {
    throw new Error("Failed to insert email verification token");
  }

  return { rawToken, tokenId };
}

/**
 * After Resend accepts a verification email: invalidate other unused tokens and
 * stamp verification_email_last_sent_at. Does not start the trial.
 */
export async function markVerificationEmailAccepted(userId: string, tokenId: string): Promise<void> {
  await invalidateOtherUnusedTokens(userId, tokenId);
  await db
    .update(users)
    .set({ verificationEmailLastSentAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Mark a newly inserted token used after a failed send so it cannot be consumed.
 * Does not invalidate previously unused tokens and does not change last-sent.
 */
export async function abandonIssuedVerificationToken(tokenId: string): Promise<void> {
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.id, tokenId),
        isNull(emailVerificationTokens.usedAt),
      ),
    );
}

/**
 * Insert a fresh 24-hour verification token without invalidating existing unused tokens.
 * Prefer issueEmailVerification / reminder send paths which finalize after Resend accepts.
 */
export async function createEmailVerificationToken(userId: string): Promise<string> {
  const issued = await insertEmailVerificationToken(userId);
  return issued.rawToken;
}

/**
 * Issue a new verification token and send the verification email.
 * Unused prior tokens are invalidated only after Resend accepts the replacement.
 * Does not reveal whether the user already exists to the caller — caller controls messaging.
 */
export async function issueEmailVerification(userId: string, email: string, name: string): Promise<boolean> {
  const issued = await insertEmailVerificationToken(userId);
  const sent = await sendEmailVerificationEmail(name, email, issued.rawToken);
  if (sent) {
    await markVerificationEmailAccepted(userId, issued.tokenId);
    return true;
  }
  await abandonIssuedVerificationToken(issued.tokenId);
  return false;
}

export type VerifyEmailResult =
  | { ok: true; userId: string; alreadyVerified: boolean; trialStarted: boolean }
  | { ok: false; reason: "invalid" | "expired" | "used" | "user_missing" };

/**
 * Send Day 0 welcome if it has never succeeded.
 * Does not throw; returns false on provider failure so login/verify is never blocked.
 * welcomeEmailSentAt is written only after a successful send (duplicate protection).
 */
export async function trySendWelcomeEmailForUser(user: {
  id: string;
  name: string;
  email: string;
  welcomeEmailSentAt?: Date | string | null;
  shopifyShop?: string | null;
  shopifyInstalledAt?: Date | string | null;
}): Promise<boolean> {
  if (user.welcomeEmailSentAt) return true;
  if (isShopifyLinkedAccount(user)) return true;
  if (!user.email || isExcludedFromActivationEmails(user.email)) return true;
  const sent = await sendWelcomeEmail(user.name, user.email);
  if (sent) {
    await storage.updateUser(user.id, { welcomeEmailSentAt: new Date() } as any);
  }
  return sent;
}

/**
 * Consume a verification token once. Starts trial + welcome only on first successful verify.
 */
export async function consumeEmailVerificationToken(rawToken: string): Promise<VerifyEmailResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return { ok: false, reason: "invalid" };
  }

  const tokenHash = hashToken(rawToken.trim());
  const rows = await db
    .select()
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const user = await storage.getUserForSession(row.userId);
  if (!user) return { ok: false, reason: "user_missing" };

  // Mark token used first (single-use)
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(eq(emailVerificationTokens.id, row.id));

  if (isEmailVerified(user)) {
    return { ok: true, userId: user.id, alreadyVerified: true, trialStarted: false };
  }

  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

  // Only assign trial if never started (do not restart/extend existing trials)
  const shouldStartTrial =
    !user.trialStartedAt &&
    (user.trialStatus === "none" || !user.trialStatus || user.trialStatus === null);

  const patch: Record<string, unknown> = {
    emailVerifiedAt: now,
  };

  if (shouldStartTrial) {
    patch.trialStartedAt = now;
    patch.trialEndsAt = trialEndsAt;
    patch.trialStatus = "active";
    patch.trialPlan = "pro_ai";
  }

  const updated = await storage.updateUser(user.id, patch as any);
  if (!updated) {
    return { ok: false, reason: "user_missing" };
  }

  // Welcome once after verification — retry later via cron if Resend fails
  const sent = await trySendWelcomeEmailForUser(user);
  if (!sent) {
    console.warn(
      `[EMAIL_VERIFY] Welcome email not sent for ${user.email}; will retry on the activation cron`,
    );
  }

  return {
    ok: true,
    userId: user.id,
    alreadyVerified: false,
    trialStarted: shouldStartTrial,
  };
}

/** Resend verification for an unverified account. Returns whether an email was attempted. */
export async function resendVerificationForEmail(email: string): Promise<{
  attempted: boolean;
  userId?: string;
}> {
  const user = await storage.getUserByEmail(email);
  if (!user || isEmailVerified(user)) {
    return { attempted: false };
  }
  const ok = await issueEmailVerification(user.id, user.email, user.name);
  return { attempted: ok, userId: user.id };
}

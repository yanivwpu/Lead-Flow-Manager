/**
 * App-user password reset tokens: DB-backed, hashed, single-use, 60-minute TTL.
 * Replaces the previous in-memory Map that was lost on restart / multi-instance.
 */
import crypto from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { passwordResetTokens } from "@shared/schema";
import { db } from "../drizzle/db";
import { storage } from "./storage";
import { sendPasswordResetEmail } from "./email";
import { isEmailVerified } from "./authSecurity";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

async function invalidateUnusedTokens(userId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokens.userId, userId),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    );
}

async function purgeExpiredUnusedTokens(): Promise<void> {
  try {
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          isNull(passwordResetTokens.usedAt),
          sql`${passwordResetTokens.expiresAt} <= NOW()`,
        ),
      );
  } catch (err) {
    console.warn("[PASSWORD_RESET] expired token purge skipped:", (err as Error)?.message);
  }
}

/**
 * Issue a reset for a verified account only. Unverified pending accounts are skipped
 * (caller may separately trigger verification resend without revealing this publicly).
 */
export async function issuePasswordResetForEmail(email: string): Promise<{
  issued: boolean;
  pendingUnverified: boolean;
  userId?: string;
}> {
  await purgeExpiredUnusedTokens();
  const user = await storage.getUserByEmail(email);
  if (!user) {
    return { issued: false, pendingUnverified: false };
  }
  if (!isEmailVerified(user)) {
    return { issued: false, pendingUnverified: true, userId: user.id };
  }

  await invalidateUnusedTokens(user.id);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const sent = await sendPasswordResetEmail(user.email, rawToken);
  return { issued: sent, pendingUnverified: false, userId: user.id };
}

export type ConsumeResetResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "user_missing" };

export async function consumePasswordResetToken(rawToken: string): Promise<ConsumeResetResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16) {
    return { ok: false, reason: "invalid" };
  }

  const tokenHash = hashToken(rawToken.trim());
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const user = await storage.getUserForSession(row.userId);
  if (!user) return { ok: false, reason: "user_missing" };

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  return { ok: true, userId: user.id, email: user.email };
}

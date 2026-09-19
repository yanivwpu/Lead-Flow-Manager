import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoScheduledSyncClaims, seoSyncExecutionLeases } from "@shared/schema";
import { resolveSearchConsoleConfig } from "./searchConsole";
import { isWithinScheduledSeoRecoveryWindow, seoScheduledRetryDisposition, SEO_SCHEDULED_LEASE_MINUTES, SEO_SCHEDULED_MAX_ATTEMPTS } from "./scheduledPolicy";

export type SeoExecutionLease = { propertyId: string; leaseToken: string; trigger: "manual" | "scheduled" };
export class SeoExecutionLeaseLostError extends Error { code = "LEASE_LOST"; }

export async function claimSeoExecutionLease(trigger: "manual" | "scheduled"): Promise<SeoExecutionLease | null> {
  const config = resolveSearchConsoleConfig();
  if (!config.configured || !config.siteUrl) return null;
  const leaseToken = crypto.randomUUID();
  const result = await db.execute(sql`
    INSERT INTO seo_sync_execution_leases (property_id, lease_token, trigger, lease_expires_at, created_at, updated_at)
    VALUES (${config.siteUrl}, ${leaseToken}, ${trigger}, NOW() + (${SEO_SCHEDULED_LEASE_MINUTES} * INTERVAL '1 minute'), NOW(), NOW())
    ON CONFLICT (property_id) DO UPDATE SET
      lease_token = EXCLUDED.lease_token, trigger = EXCLUDED.trigger,
      lease_expires_at = EXCLUDED.lease_expires_at, updated_at = NOW()
    WHERE seo_sync_execution_leases.lease_expires_at <= NOW()
    RETURNING property_id, lease_token, trigger
  `);
  const row = result.rows[0] as { property_id: string; lease_token: string; trigger: "manual" | "scheduled" } | undefined;
  return row ? { propertyId: row.property_id, leaseToken: row.lease_token, trigger: row.trigger } : null;
}

export async function renewSeoExecutionLease(claim: SeoExecutionLease): Promise<boolean> {
  const rows = await db.update(seoSyncExecutionLeases).set({
    leaseExpiresAt: sql`NOW() + (${SEO_SCHEDULED_LEASE_MINUTES} * INTERVAL '1 minute')`, updatedAt: new Date(),
  }).where(and(eq(seoSyncExecutionLeases.propertyId, claim.propertyId), eq(seoSyncExecutionLeases.leaseToken, claim.leaseToken))).returning({ token: seoSyncExecutionLeases.leaseToken });
  return rows.length === 1;
}

export async function releaseSeoExecutionLease(claim: SeoExecutionLease): Promise<boolean> {
  const rows = await db.delete(seoSyncExecutionLeases).where(and(
    eq(seoSyncExecutionLeases.propertyId, claim.propertyId), eq(seoSyncExecutionLeases.leaseToken, claim.leaseToken),
  )).returning({ token: seoSyncExecutionLeases.leaseToken });
  return rows.length === 1;
}

/** Locks the current lease row while a mutation commits. An expired or replaced
 * token cannot pass this fence, even if its worker resumes after a long pause. */
export async function withSeoExecutionLease<T>(claim: SeoExecutionLease, work: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    const owned = await tx.execute(sql`SELECT property_id FROM seo_sync_execution_leases
      WHERE property_id = ${claim.propertyId} AND lease_token = ${claim.leaseToken} AND lease_expires_at > NOW()
      FOR UPDATE`);
    if (!owned.rows.length) throw new SeoExecutionLeaseLostError("SEO synchronization lease ownership was lost");
    return work(tx as typeof db);
  });
}

export async function claimScheduledSeoSync(reportingDay: string, now = new Date()) {
  if (!isWithinScheduledSeoRecoveryWindow(now)) return null;
  const config = resolveSearchConsoleConfig();
  if (!config.configured || !config.siteUrl) return null;
  const leaseToken = crypto.randomUUID();
  const result = await db.execute(sql`
    INSERT INTO seo_scheduled_sync_claims
      (property_id, reporting_day, status, lease_token, lease_expires_at, attempts, created_at, updated_at)
    VALUES (${config.siteUrl}, ${reportingDay}, 'running', ${leaseToken}, NOW() + (${SEO_SCHEDULED_LEASE_MINUTES} * INTERVAL '1 minute'), 1, NOW(), NOW())
    ON CONFLICT (property_id, reporting_day) DO UPDATE SET
      status = 'running', lease_token = EXCLUDED.lease_token,
      lease_expires_at = EXCLUDED.lease_expires_at,
      attempts = seo_scheduled_sync_claims.attempts + 1,
      last_error = NULL, updated_at = NOW()
    WHERE seo_scheduled_sync_claims.attempts < ${SEO_SCHEDULED_MAX_ATTEMPTS}
      AND (seo_scheduled_sync_claims.status IN ('failed', 'partial')
        OR (seo_scheduled_sync_claims.status = 'running' AND seo_scheduled_sync_claims.lease_expires_at <= NOW()))
    RETURNING property_id, reporting_day, lease_token, attempts
  `);
  const row = result.rows[0] as { property_id: string; reporting_day: string; lease_token: string; attempts: number } | undefined;
  return row ? { propertyId: row.property_id, reportingDay: row.reporting_day, leaseToken: row.lease_token, attempts: Number(row.attempts) } : null;
}

export async function renewScheduledSeoSyncLease(claim: { propertyId: string; reportingDay: string; leaseToken: string }) {
  const result = await db.update(seoScheduledSyncClaims).set({
    leaseExpiresAt: sql`NOW() + (${SEO_SCHEDULED_LEASE_MINUTES} * INTERVAL '1 minute')`,
    updatedAt: new Date(),
  }).where(and(
    eq(seoScheduledSyncClaims.propertyId, claim.propertyId),
    eq(seoScheduledSyncClaims.reportingDay, claim.reportingDay),
    eq(seoScheduledSyncClaims.leaseToken, claim.leaseToken),
    eq(seoScheduledSyncClaims.status, "running"),
  )).returning({ leaseToken: seoScheduledSyncClaims.leaseToken });
  return result.length === 1;
}

export async function finishScheduledSeoSync(claim: { propertyId: string; reportingDay: string; leaseToken: string }, status: "success" | "partial" | "failed", error?: string, errorCode?: string) {
  const disposition = seoScheduledRetryDisposition(status, errorCode);
  const claimStatus = disposition === "complete" ? "success" : disposition === "non_retryable" ? "terminal" : status;
  await db.update(seoScheduledSyncClaims).set({ status: claimStatus, lastError: error?.slice(0, 500) ?? null, leaseExpiresAt: new Date(), updatedAt: new Date() }).where(and(
    eq(seoScheduledSyncClaims.propertyId, claim.propertyId),
    eq(seoScheduledSyncClaims.reportingDay, claim.reportingDay),
    eq(seoScheduledSyncClaims.leaseToken, claim.leaseToken),
  ));
}

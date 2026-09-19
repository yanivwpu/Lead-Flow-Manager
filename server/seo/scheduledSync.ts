import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { seoScheduledSyncClaims } from "@shared/schema";
import { resolveSearchConsoleConfig } from "./searchConsole";
import { SEO_SCHEDULED_LEASE_MINUTES, SEO_SCHEDULED_MAX_ATTEMPTS } from "./scheduledPolicy";

export async function claimScheduledSeoSync(reportingDay: string) {
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

export async function finishScheduledSeoSync(claim: { propertyId: string; reportingDay: string; leaseToken: string }, status: "success" | "partial" | "failed", error?: string) {
  await db.update(seoScheduledSyncClaims).set({ status, lastError: error?.slice(0, 500) ?? null, leaseExpiresAt: new Date(), updatedAt: new Date() }).where(and(
    eq(seoScheduledSyncClaims.propertyId, claim.propertyId),
    eq(seoScheduledSyncClaims.reportingDay, claim.reportingDay),
    eq(seoScheduledSyncClaims.leaseToken, claim.leaseToken),
  ));
}

/**
 * Prospect enrichment job orchestration (Phase 2).
 * Enqueue only after approve / campaign queue — never on discover.
 */

import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  prospectEnrichmentJobs,
  prospectIntelligence,
  type ProspectEnrichmentJobRow,
} from "@shared/schema";
import {
  PROSPECT_ENRICHMENT_LEASE_MS,
  type ProspectEnrichmentJobSummary,
  type ProspectEnrichmentResult,
  type ProspectEnrichmentTrigger,
} from "@shared/prospectEnrichment";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { assertContactInWorkspace } from "./prospectWorkspaceScope";
import { getProspectEnrichmentProvider } from "./prospectWebsiteEnrichmentProvider";
import { analyzeProspectContact } from "./prospectIntelligenceService";
import { isValidProspectEmail, isValidProspectPhone } from "@shared/prospectContactEnrichment";
import { shouldApplyScrapedProspectEmail } from "./prospectWebsiteContactExtract";
import { extractSqlExecuteId } from "@shared/prospectAnalysisOwnership";

function mapJob(row: ProspectEnrichmentJobRow): ProspectEnrichmentJobSummary {
  return {
    id: row.id,
    contactId: row.contactId,
    workspaceUserId: row.workspaceUserId,
    status: row.status as ProspectEnrichmentJobSummary["status"],
    provider: (row.provider || "website_public") as ProspectEnrichmentJobSummary["provider"],
    triggerSource: (row.triggerSource || "approve") as ProspectEnrichmentTrigger,
    progressCurrent: row.progressCurrent ?? 0,
    progressTotal: row.progressTotal ?? 4,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function updateJob(
  jobId: string,
  patch: Partial<typeof prospectEnrichmentJobs.$inferInsert>,
): Promise<void> {
  await db
    .update(prospectEnrichmentJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(prospectEnrichmentJobs.id, jobId));
}

async function patchIntelligenceEnrichment(
  contactId: string,
  patch: Partial<typeof prospectIntelligence.$inferInsert>,
): Promise<void> {
  await db
    .update(prospectIntelligence)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(prospectIntelligence.contactId, contactId));
}

/**
 * Enqueue website enrichment after human approval or campaign queue.
 * No-ops if already completed/running, or contact missing.
 */
export async function enqueueProspectEnrichment(params: {
  contactId: string;
  workspaceUserId: string;
  initiatedByUserId?: string;
  trigger: ProspectEnrichmentTrigger;
  force?: boolean;
}): Promise<ProspectEnrichmentJobSummary | null> {
  const contact = await storage.getContact(params.contactId);
  if (!contact) return null;
  assertContactInWorkspace(contact, params.workspaceUserId);

  const piRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const pi = piRows[0];
  if (!pi) return null;

  // Never enrich until approved (or explicitly queued — queue implies prior approval path).
  const review = String(pi.reviewStatus || "").toLowerCase();
  if (params.trigger === "approve" || params.trigger === "manual") {
    if (review !== "approved") {
      return null;
    }
  }

  if (!params.force) {
    const status = String(pi.enrichmentStatus || "none").toLowerCase();
    if (status === "completed" || status === "enriching" || status === "pending") {
      const existing = await db
        .select()
        .from(prospectEnrichmentJobs)
        .where(
          and(
            eq(prospectEnrichmentJobs.contactId, params.contactId),
            inArray(prospectEnrichmentJobs.status, ["pending", "running", "completed"]),
          ),
        )
        .orderBy(desc(prospectEnrichmentJobs.createdAt))
        .limit(1);
      if (existing[0]) return mapJob(existing[0]);
    }
  }

  const [job] = await db
    .insert(prospectEnrichmentJobs)
    .values({
      workspaceUserId: params.workspaceUserId,
      contactId: params.contactId,
      initiatedByUserId: params.initiatedByUserId || params.workspaceUserId,
      status: "pending",
      provider: "website_public",
      triggerSource: params.trigger,
      progressCurrent: 0,
      progressTotal: 4,
      result: {},
      updatedAt: new Date(),
    })
    .returning();

  await patchIntelligenceEnrichment(params.contactId, {
    enrichmentStatus: "pending",
    enrichmentProvider: "website_public",
    enrichmentTriggeredBy: params.trigger,
    enrichmentJobId: job.id,
    enrichmentErrorMessage: null,
  });

  console.info(
    JSON.stringify({
      event: "prospect_enrichment_enqueued",
      workspaceId: params.workspaceUserId,
      contactId: params.contactId,
      jobId: job.id,
      trigger: params.trigger,
      at: new Date().toISOString(),
    }),
  );

  return mapJob(job);
}

export async function enqueueProspectEnrichmentForContacts(params: {
  contactIds: string[];
  workspaceUserId: string;
  initiatedByUserId?: string;
  trigger: ProspectEnrichmentTrigger;
}): Promise<{ enqueued: number }> {
  let enqueued = 0;
  for (const contactId of Array.from(new Set(params.contactIds))) {
    const job = await enqueueProspectEnrichment({
      contactId,
      workspaceUserId: params.workspaceUserId,
      initiatedByUserId: params.initiatedByUserId,
      trigger: params.trigger,
    });
    if (job && (job.status === "pending" || job.status === "running")) enqueued += 1;
  }
  return { enqueued };
}

export async function claimNextEnrichmentJob(
  workerId: string,
): Promise<ProspectEnrichmentJobRow | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + PROSPECT_ENRICHMENT_LEASE_MS);

  const claimed = await db.execute(sql`
    UPDATE prospect_enrichment_jobs AS j
    SET
      status = 'running',
      lease_owner = ${workerId},
      lease_expires_at = ${leaseUntil},
      started_at = COALESCE(j.started_at, ${now}),
      updated_at = ${now}
    WHERE j.id = (
      SELECT id FROM prospect_enrichment_jobs
      WHERE status IN ('pending', 'running')
        AND (lease_expires_at IS NULL OR lease_expires_at < ${now})
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING j.id
  `);

  const id = extractSqlExecuteId(claimed);
  if (!id) return null;

  const rows = await db
    .select()
    .from(prospectEnrichmentJobs)
    .where(eq(prospectEnrichmentJobs.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function recoverStaleEnrichmentJobs(): Promise<void> {
  const now = new Date();
  await db
    .update(prospectEnrichmentJobs)
    .set({
      status: "pending",
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(prospectEnrichmentJobs.status, "running"),
        or(isNull(prospectEnrichmentJobs.leaseExpiresAt), lt(prospectEnrichmentJobs.leaseExpiresAt, now)),
      ),
    );
}

async function applyEnrichmentToContact(
  contactId: string,
  workspaceUserId: string,
  result: ProspectEnrichmentResult,
): Promise<void> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== workspaceUserId) return;

  const patch: Record<string, unknown> = {};
  const foundEmail = result.publicContacts.emails.find((e) => isValidProspectEmail(e));
  const foundPhone = result.publicContacts.phones.find((p) => isValidProspectPhone(p));

  if (foundEmail && shouldApplyScrapedProspectEmail(contact.email, foundEmail)) {
    patch.email = foundEmail;
  }
  if (foundPhone && !isValidProspectPhone(contact.phone)) {
    patch.phone = foundPhone;
  }

  const sd = { ...(contact.sourceDetails as Record<string, unknown> | null) };
  const cf = { ...(contact.customFields as Record<string, unknown> | null) };
  const enrichmentMeta = {
    provider: result.provider,
    websiteUrl: result.websiteUrl,
    websiteAnalyzedAt: result.websiteAnalyzedAt,
    publicContacts: result.publicContacts,
    websiteIntelligence: result.websiteIntelligence,
  };
  patch.sourceDetails = { ...sd, prospectEnrichment: enrichmentMeta };
  patch.customFields = { ...cf, prospectEnrichment: enrichmentMeta };

  if (Object.keys(patch).length) {
    await storage.updateContact(contactId, patch);
  }
}

export async function processClaimedEnrichmentJob(
  job: ProspectEnrichmentJobRow,
  workerId: string,
): Promise<void> {
  const contact = await storage.getContact(job.contactId);
  if (!contact || contact.userId !== job.workspaceUserId) {
    await updateJob(job.id, {
      status: "cancelled",
      cancelledAt: new Date(),
      errorMessage: "Contact removed or wrong workspace",
    });
    await patchIntelligenceEnrichment(job.contactId, {
      enrichmentStatus: "cancelled",
      enrichmentErrorMessage: "Contact removed",
    });
    return;
  }

  await patchIntelligenceEnrichment(job.contactId, {
    enrichmentStatus: "enriching",
    enrichmentJobId: job.id,
  });

  try {
    const provider = getProspectEnrichmentProvider(job.provider || "website_public");
    const result = await provider.enrich({
      contact,
      workspaceUserId: job.workspaceUserId,
      onProgress: async (step, total) => {
        await updateJob(job.id, {
          progressCurrent: step,
          progressTotal: total,
          leaseOwner: workerId,
          leaseExpiresAt: new Date(Date.now() + PROSPECT_ENRICHMENT_LEASE_MS),
        });
      },
    });

    await applyEnrichmentToContact(job.contactId, job.workspaceUserId, result);

    await patchIntelligenceEnrichment(job.contactId, {
      enrichmentStatus: "completed",
      enrichmentProvider: result.provider,
      websiteAnalyzedAt: result.websiteAnalyzedAt ? new Date(result.websiteAnalyzedAt) : new Date(),
      websiteUrlUsed: result.websiteUrl || null,
      enrichmentEmailFound: result.emailFound,
      enrichmentPhoneFound: result.phoneFound,
      enrichmentResult: result as unknown as Record<string, unknown>,
      enrichmentErrorMessage: null,
      enrichmentJobId: job.id,
    });

    // Re-run AI analysis with website intelligence now on the contact.
    try {
      await analyzeProspectContact({ contactId: job.contactId, force: true });
    } catch (err) {
      console.error(
        "[ProspectEnrichment] Post-enrichment reanalyze failed:",
        err instanceof Error ? err.message : err,
      );
    }

    // If enrichment AI produced a better angle/summary, merge lightly when analyze left them empty.
    const intel = result.websiteIntelligence;
    if (intel.recommendedOutreachAngle || intel.aiFitInsights || intel.businessSummary) {
      const rows = await db
        .select()
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.contactId, job.contactId))
        .limit(1);
      const row = rows[0];
      if (row) {
        const merge: Partial<typeof prospectIntelligence.$inferInsert> = { updatedAt: new Date() };
        if (!row.suggestedOutreachAngle && intel.recommendedOutreachAngle) {
          merge.suggestedOutreachAngle = intel.recommendedOutreachAngle;
        }
        if (!row.reasoningSummary && (intel.aiFitInsights || intel.businessSummary)) {
          merge.reasoningSummary = [intel.aiFitInsights, intel.businessSummary]
            .filter(Boolean)
            .join(" ")
            .slice(0, 800);
        }
        if (Object.keys(merge).length > 1) {
          await db
            .update(prospectIntelligence)
            .set(merge)
            .where(eq(prospectIntelligence.contactId, job.contactId));
        }
      }
    }

    await updateJob(job.id, {
      status: "completed",
      completedAt: new Date(),
      progressCurrent: job.progressTotal ?? 4,
      result: result as unknown as Record<string, unknown>,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(job.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.slice(0, 500),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    await patchIntelligenceEnrichment(job.contactId, {
      enrichmentStatus: "failed",
      enrichmentErrorMessage: message.slice(0, 500),
    });
    console.error("[ProspectEnrichment] job failed:", job.id, message);
  }
}

export async function getEnrichmentJob(
  jobId: string,
  workspaceUserId: string,
): Promise<ProspectEnrichmentJobSummary | null> {
  const rows = await db
    .select()
    .from(prospectEnrichmentJobs)
    .where(
      and(
        eq(prospectEnrichmentJobs.id, jobId),
        eq(prospectEnrichmentJobs.workspaceUserId, workspaceUserId),
      ),
    )
    .limit(1);
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function retryFailedEnrichment(params: {
  contactId: string;
  workspaceUserId: string;
  initiatedByUserId: string;
}): Promise<ProspectEnrichmentJobSummary | null> {
  return enqueueProspectEnrichment({
    ...params,
    trigger: "manual",
    force: true,
  });
}

export const prospectEnrichmentService = {
  enqueueProspectEnrichment,
  enqueueProspectEnrichmentForContacts,
  claimNextEnrichmentJob,
  processClaimedEnrichmentJob,
  recoverStaleEnrichmentJobs,
  getEnrichmentJob,
  retryFailedEnrichment,
};

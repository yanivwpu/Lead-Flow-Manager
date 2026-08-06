/**
 * Prospect enrichment job orchestration (Phase 2).
 * Enqueue after approve / campaign queue / post-AI qualification — never on Discover/Places.
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
import { isValidProspectEmail, isValidProspectPhone } from "@shared/prospectContactEnrichment";
import { shouldApplyScrapedProspectEmail, selectBestProspectEmail } from "./prospectWebsiteContactExtract";
import { extractSqlExecuteId } from "@shared/prospectAnalysisOwnership";
import {
  resolveEnrichmentFinalizeDecision,
  userFacingEnrichmentErrorMessage,
} from "@shared/prospectEnrichmentOutcome";
import { classifyProspectWebsiteUrl } from "@shared/prospectWebsiteClassification";
import { resolveProspectOfficialWebsiteUrl, resolveProspectSocialProfileUrls } from "./prospectWebsiteUrl";

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
 * Enqueue website enrichment after human approval, campaign queue, or post-AI qualification.
 * Never on Discover / Places (no discovery quota). No-ops if already completed/running.
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

  // Approve requires human approval. Manual retry may run for pending/needs_review
  // when a prior enrichment attempt already happened (post_qualify / empty complete).
  const review = String(pi.reviewStatus || "").toLowerCase();
  if (params.trigger === "approve") {
    if (review !== "approved") return null;
  }
  if (params.trigger === "manual") {
    if (!["approved", "pending", "needs_review"].includes(review)) return null;
  }

  // Never create a duplicate active job.
  const activeRows = await db
    .select()
    .from(prospectEnrichmentJobs)
    .where(
      and(
        eq(prospectEnrichmentJobs.contactId, params.contactId),
        inArray(prospectEnrichmentJobs.status, ["pending", "running"]),
      ),
    )
    .orderBy(desc(prospectEnrichmentJobs.createdAt))
    .limit(1);
  if (activeRows[0]) return mapJob(activeRows[0]);

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
  const foundEmail =
    result.bestEmailProvenance?.email ||
    selectBestProspectEmail(result.publicContacts.emails, {
      websiteUrl: result.websiteUrl,
      extractions: result.publicContacts.emailExtractions,
    });
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
    failureClass: result.failureClass ?? null,
    outcomeClass: result.outcomeClass ?? null,
    socialProfilesPreserved: result.socialProfilesPreserved || result.publicContacts.socialProfiles || [],
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

    const failureClass = result.failureClass || null;
    const decision = resolveEnrichmentFinalizeDecision({
      crawlSucceeded: result.crawlSucceeded,
      failureClass,
      providerEmailFound: result.emailFound,
      contactEmail: contact.email,
      providerOutcomeClass: result.outcomeClass,
    });
    const storedResult: ProspectEnrichmentResult = {
      ...result,
      emailFound: decision.enrichmentEmailFound,
      outcomeClass: decision.outcomeClass,
      websiteCrawlFailed: decision.softCompleteWithExistingEmail ? true : result.crawlSucceeded === false,
      bestEmailProvenance: result.bestEmailProvenance ?? null,
    };

    if (decision.enrichmentStatus === "failed") {
      await patchIntelligenceEnrichment(job.contactId, {
        enrichmentStatus: "failed",
        enrichmentProvider: result.provider,
        websiteAnalyzedAt: result.websiteAnalyzedAt ? new Date(result.websiteAnalyzedAt) : new Date(),
        websiteUrlUsed: result.websiteUrl || null,
        enrichmentEmailFound: false,
        enrichmentPhoneFound: result.phoneFound,
        enrichmentResult: storedResult as unknown as Record<string, unknown>,
        enrichmentErrorMessage: decision.enrichmentErrorMessage,
        enrichmentJobId: job.id,
      });
      await updateJob(job.id, {
        status: "failed",
        completedAt: new Date(),
        progressCurrent: job.progressTotal ?? 4,
        result: storedResult as unknown as Record<string, unknown>,
        errorMessage: decision.enrichmentErrorMessage,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return;
    }

    await patchIntelligenceEnrichment(job.contactId, {
      enrichmentStatus: "completed",
      enrichmentProvider: result.provider,
      websiteAnalyzedAt: result.websiteAnalyzedAt ? new Date(result.websiteAnalyzedAt) : new Date(),
      websiteUrlUsed: result.websiteUrl || null,
      enrichmentEmailFound: decision.enrichmentEmailFound,
      enrichmentPhoneFound: result.phoneFound,
      enrichmentResult: storedResult as unknown as Record<string, unknown>,
      enrichmentErrorMessage: null,
      enrichmentJobId: job.id,
    });

    // Soft-complete (manual/existing email + website unreachable): do not re-run AI qualification.
    if (decision.softCompleteWithExistingEmail) {
      await updateJob(job.id, {
        status: "completed",
        completedAt: new Date(),
        progressCurrent: job.progressTotal ?? 4,
        result: storedResult as unknown as Record<string, unknown>,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      return;
    }

    // Never mutate AI Review inline. Conditionally enqueue the canonical bulk AI queue
    // only when no usable review exists or website intelligence was explicitly required.
    try {
      const { enqueueAiReviewAfterEnrichment } = await import("./prospectBulkAnalysisService");
      const queued = await enqueueAiReviewAfterEnrichment({
        contactId: job.contactId,
        workspaceUserId: job.workspaceUserId,
        initiatedByUserId: job.initiatedByUserId || job.workspaceUserId,
      });
      if (queued.enqueued) {
        console.info(
          `[ProspectEnrichment] Post-enrichment AI Review enqueued (${queued.reason}) job=${queued.jobId || "n/a"}`,
        );
      }
    } catch (err) {
      console.error(
        "[ProspectEnrichment] Post-enrichment AI Review enqueue failed:",
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
    const failureClass = /abort|timeout/i.test(message) ? "website_timeout" : "website_fetch_failed";
    const decision = resolveEnrichmentFinalizeDecision({
      crawlSucceeded: false,
      failureClass,
      providerEmailFound: false,
      contactEmail: contact.email,
    });
    const storedResult = {
      failureClass,
      outcomeClass: decision.outcomeClass,
      crawlSucceeded: false,
      websiteCrawlFailed: decision.softCompleteWithExistingEmail,
    };

    if (decision.enrichmentStatus === "completed") {
      await patchIntelligenceEnrichment(job.contactId, {
        enrichmentStatus: "completed",
        enrichmentEmailFound: true,
        enrichmentErrorMessage: null,
        enrichmentResult: storedResult,
      });
      await updateJob(job.id, {
        status: "completed",
        completedAt: new Date(),
        result: storedResult,
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      console.warn(
        "[ProspectEnrichment] crawl threw but contact already has email; soft-completed:",
        job.id,
        message,
      );
      return;
    }

    const safe = decision.enrichmentErrorMessage || userFacingEnrichmentErrorMessage(failureClass, message);
    await updateJob(job.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: safe,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    await patchIntelligenceEnrichment(job.contactId, {
      enrichmentStatus: "failed",
      enrichmentErrorMessage: safe,
      enrichmentEmailFound: false,
      enrichmentResult: storedResult,
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

/**
 * Retry enrichment after failure or completed-without-email (official website required).
 * Does not call Places / discovery quota. Reuses the same contact.
 */
export async function retryFailedEnrichment(params: {
  contactId: string;
  workspaceUserId: string;
  initiatedByUserId: string;
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

  const status = String(pi.enrichmentStatus || "none").toLowerCase();
  const emailFound = pi.enrichmentEmailFound === true || isValidProspectEmail(contact.email);
  const hasOfficial = Boolean(resolveProspectOfficialWebsiteUrl(contact));

  // Failed without official website (social-only / no-website) → not retryable until URL fixed.
  // Completed with email → do not re-crawl.
  const canRetry =
    hasOfficial &&
    ((status === "failed") || (status === "completed" && !emailFound));
  if (!canRetry) return null;

  return enqueueProspectEnrichment({
    ...params,
    trigger: "manual",
    force: true,
  });
}

/**
 * Persist a manually corrected official website and reopen enrichment eligibility.
 * Preserves existing valid email. Does not create contacts or charge discovery quota.
 */
export async function saveProspectOfficialWebsite(params: {
  contactId: string;
  workspaceUserId: string;
  websiteUrl: string;
}): Promise<{ websiteUrl: string }> {
  const contact = await storage.getContact(params.contactId);
  if (!contact) throw new Error("Contact not found");
  assertContactInWorkspace(contact, params.workspaceUserId);

  const trimmed = String(params.websiteUrl || "").trim();
  if (!trimmed) throw new Error("Enter a website URL");
  const withProto = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  let href: string;
  try {
    href = new URL(withProto).href;
  } catch {
    throw new Error("Enter a valid website URL");
  }
  if (classifyProspectWebsiteUrl(href) !== "official") {
    throw new Error("Enter an official business website (not a social profile)");
  }

  const sd = { ...(contact.sourceDetails as Record<string, unknown> | null) };
  const cf = { ...(contact.customFields as Record<string, unknown> | null) };
  const paiSd = { ...((sd.prospectAi as Record<string, unknown>) || {}) };
  const paiCf = { ...((cf.prospectAi as Record<string, unknown>) || {}) };
  const priorWebsite = String(paiSd.website || paiCf.website || sd.website || "").trim();
  const preservedSocial = [
    ...resolveProspectSocialProfileUrls(contact),
    ...(classifyProspectWebsiteUrl(priorWebsite) === "social" ? [priorWebsite] : []),
  ];

  paiSd.website = href;
  paiSd.websiteManual = true;
  paiCf.website = href;
  paiCf.websiteManual = true;
  if (preservedSocial.length) {
    const socials = Array.from(new Set(preservedSocial.map((u) => String(u).trim()).filter(Boolean)));
    paiSd.socialProfiles = socials;
    paiCf.socialProfiles = socials;
  }

  await storage.updateContact(params.contactId, {
    sourceDetails: { ...sd, prospectAi: paiSd, website: href, websiteManual: true },
    customFields: { ...cf, prospectAi: paiCf, website: href, websiteManual: true },
  });

  // Reopen enrichment: mark failed with clear reason so Retry Enrichment is available.
  await patchIntelligenceEnrichment(params.contactId, {
    enrichmentStatus: "failed",
    enrichmentErrorMessage: "Website updated — ready to retry",
    websiteUrlUsed: null,
    enrichmentEmailFound: isValidProspectEmail(contact.email) ? true : false,
    enrichmentResult: {
      failureClass: "website_fetch_failed",
      outcomeClass: "failed_fetch",
      crawlSucceeded: false,
      websiteUrl: href,
      note: "website_manual_update",
    },
  });

  return { websiteUrl: href };
}

export const prospectEnrichmentService = {
  enqueueProspectEnrichment,
  enqueueProspectEnrichmentForContacts,
  claimNextEnrichmentJob,
  processClaimedEnrichmentJob,
  recoverStaleEnrichmentJobs,
  getEnrichmentJob,
  retryFailedEnrichment,
  saveProspectOfficialWebsite,
};

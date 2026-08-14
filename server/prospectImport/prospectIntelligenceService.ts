import { and, desc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import {
  prospectAiDiscoveryResults,
  prospectAiDiscoverySearches,
  prospectBulkAnalysisJobs,
  prospectImportJobs,
  prospectIntelligence,
  prospectIntelligenceJobs,
  type ProspectIntelligenceRow,
} from "@shared/schema";
import type {
  ProspectIntelligence,
  ProspectIntelligenceDashboardCounts,
  ProspectIntelligenceJobSummary,
  ProspectIntelligenceListFilters,
  ProspectIntelligenceListItem,
} from "@shared/prospectImport";
import {
  encodeProspectReviewBatchKey,
  formatDiscoveryBatchLabel,
  formatImportBatchLabel,
  parseProspectReviewBatchKey,
  readContactDiscoverySearchId,
  readContactImportJobIdFromMeta,
  type ProspectReviewBatchOption,
} from "@shared/prospectReviewBatch";
import {
  PROSPECT_ANALYSIS_STALE_PROCESSING_MS,
  claimableAnalysisStatuses,
  contactOwnedByActiveBulkLease,
} from "@shared/prospectAnalysisOwnership";
import { isProspectAiTransientProviderError } from "@shared/prospectAiReviewErrors";
import {
  buildProspectAiAttemptClaimRaw,
  classifyProspectAiReviewFailure,
  describeOpenAiKeyRuntimeDiagnostics,
  isProspectAiReviewUsableSuccess,
  mergeProspectAiRefreshFailureRaw,
  prospectAiReviewOutputClearPatch,
  resolveProspectAiFailurePersistAction,
  resolveProspectAiSuccessPersistAction,
} from "@shared/prospectAiReliability";
import { db } from "../../drizzle/db";
import { aiProvider } from "../aiProvider";
import { storage } from "../storage";
import crypto from "crypto";
import {
  buildInsufficientDataResult,
  buildProspectIntelligenceInput,
  buildProspectIntelligencePrompt,
  countByPriority,
  hasInsufficientProspectData,
  parseAndValidateProspectIntelligence,
  PROSPECT_INTELLIGENCE_AI_VERSION,
} from "./prospectIntelligenceAi";
import { loadProspectAiWorkspaceContext } from "./prospectAiWorkspaceContext";
import {
  assertInternalImportedProspect,
  isInternalImportedProspect,
  readProspectImportMetadata,
  resolvePipelineStageAfterAnalysis,
} from "./prospectIntelligenceEligibility";
import { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";
import { assertContactInWorkspace } from "./prospectWorkspaceScope";
import {
  buildQualificationSourcePatch,
  buildQualifiedPresentationClearPatch,
  hasHumanQualificationLock,
  readProspectQualificationSource,
  shouldAutoQualifyFromAiResult,
} from "@shared/prospectAutoQualify";

const runningBatchJobs = new Set<string>();
const runningContactAnalysis = new Set<string>();
const ANALYSIS_CONCURRENCY = 1;
/** Attempts after the first failure (total tries = MAX_AI_RETRIES + 1). */
const MAX_AI_RETRIES = 3;

type AiCompleteFn = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
) => Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }>;

function mapIntelligenceRow(row: ProspectIntelligenceRow): ProspectIntelligence {
  return {
    industry: row.industry ?? undefined,
    businessType: row.businessType ?? undefined,
    companyName: row.companyName ?? undefined,
    jobTitle: row.jobTitle ?? undefined,
    agencyLikelihood: row.agencyLikelihood ?? undefined,
    shopifyMerchantLikelihood: row.shopifyMerchantLikelihood ?? undefined,
    realEstateLikelihood: row.realEstateLikelihood ?? undefined,
    localBusinessLikelihood: row.localBusinessLikelihood ?? undefined,
    saasLikelihood: row.saasLikelihood ?? undefined,
    potentialFit: (row.potentialFit as ProspectIntelligence["potentialFit"]) ?? undefined,
    leadScore: row.leadScore ?? undefined,
    priority: (row.priority as ProspectIntelligence["priority"]) ?? undefined,
    recommendedOffer: row.recommendedOffer ?? undefined,
    suggestedOutreachAngle: row.suggestedOutreachAngle ?? undefined,
    suggestedFirstMessage: row.suggestedFirstMessage ?? undefined,
    suggestedOutreachSubject: row.suggestedOutreachSubject ?? undefined,
    reasoningSummary: row.reasoningSummary ?? undefined,
    needsReview: row.needsReview ?? undefined,
    confidence: row.confidence ?? undefined,
    analyzedAt: row.analyzedAt?.toISOString(),
    aiModel: row.aiModel ?? undefined,
    aiVersion: row.aiVersion ?? undefined,
    analysisStatus: (row.analysisStatus as ProspectIntelligence["analysisStatus"]) ?? undefined,
    reviewStatus: (row.reviewStatus as ProspectIntelligence["reviewStatus"]) ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    approvedByUserId: row.approvedByUserId ?? undefined,
    qualificationSource:
      readProspectQualificationSource(
        (row.rawResult as Record<string, unknown> | null | undefined) || null,
      ) ?? undefined,
    outreachStatus: (row.outreachStatus as ProspectIntelligence["outreachStatus"]) ?? undefined,
    outreachSentAt: row.outreachSentAt?.toISOString(),
    outreachConversationId: row.outreachConversationId ?? undefined,
    outreachMessageId: row.outreachMessageId ?? undefined,
    repliedAt: row.repliedAt?.toISOString(),
    errorMessage: row.errorMessage ?? undefined,
    aiReviewFailureKind: (() => {
      const raw =
        row.rawResult && typeof row.rawResult === "object"
          ? (row.rawResult as Record<string, unknown>)
          : null;
      const kind = raw?.aiReviewFailureKind ?? raw?.failureKind;
      return kind != null && String(kind).trim() ? String(kind) : undefined;
    })(),
    lastRefreshFailedAt: (() => {
      const raw =
        row.rawResult && typeof row.rawResult === "object"
          ? (row.rawResult as Record<string, unknown>)
          : null;
      const at = raw?.lastRefreshFailedAt;
      return at != null && String(at).trim() ? String(at) : undefined;
    })(),
    lastRefreshFailureMessage: (() => {
      const raw =
        row.rawResult && typeof row.rawResult === "object"
          ? (row.rawResult as Record<string, unknown>)
          : null;
      const failure = raw?.lastRefreshFailure;
      if (failure && typeof failure === "object") {
        const msg = (failure as { message?: unknown }).message;
        return msg != null && String(msg).trim() ? String(msg).slice(0, 300) : undefined;
      }
      return undefined;
    })(),
    createdAt: row.createdAt?.toISOString(),
    enrichmentStatus: row.enrichmentStatus ?? undefined,
    enrichmentProvider: row.enrichmentProvider ?? undefined,
    enrichmentTriggeredBy: row.enrichmentTriggeredBy ?? undefined,
    websiteAnalyzedAt: row.websiteAnalyzedAt?.toISOString(),
    websiteUrlUsed: row.websiteUrlUsed ?? undefined,
    enrichmentEmailFound: row.enrichmentEmailFound ?? undefined,
    enrichmentPhoneFound: row.enrichmentPhoneFound ?? undefined,
    enrichmentResult: (row.enrichmentResult as Record<string, unknown>) ?? undefined,
    enrichmentErrorMessage: row.enrichmentErrorMessage ?? undefined,
    lifecycleStatus: (row as { lifecycleStatus?: string | null }).lifecycleStatus ?? "active",
    archivedAt: (row as { archivedAt?: Date | null }).archivedAt?.toISOString?.() ?? null,
    archivedByUserId: (row as { archivedByUserId?: string | null }).archivedByUserId ?? null,
    archiveReason: (row as { archiveReason?: string | null }).archiveReason ?? null,
    archiveNote: (row as { archiveNote?: string | null }).archiveNote ?? null,
    trashedAt: (row as { trashedAt?: Date | null }).trashedAt?.toISOString?.() ?? null,
    deletedAt: (row as { deletedAt?: Date | null }).deletedAt?.toISOString?.() ?? null,
    restoredAt: (row as { restoredAt?: Date | null }).restoredAt?.toISOString?.() ?? null,
  };
}

function mapAnalysisJobSummary(row: typeof prospectIntelligenceJobs.$inferSelect): ProspectIntelligenceJobSummary {
  const importJobId = row.importJobId;
  return {
    id: row.id,
    importJobId,
    batchName: "",
    status: row.status as ProspectIntelligenceJobSummary["status"],
    progressCurrent: row.progressCurrent ?? 0,
    progressTotal: row.progressTotal ?? 0,
    analyzed: row.resultAnalyzed ?? 0,
    highPriority: row.resultHighPriority ?? 0,
    mediumPriority: row.resultMediumPriority ?? 0,
    lowPriority: row.resultLowPriority ?? 0,
    needsReview: row.resultNeedsReview ?? 0,
    errors: row.resultErrors ?? 0,
    aiModel: row.aiModel,
    promptTokens: row.promptTokensTotal,
    completionTokens: row.completionTokensTotal,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

async function enrichJobSummary(summary: ProspectIntelligenceJobSummary): Promise<ProspectIntelligenceJobSummary> {
  const rows = await db
    .select({ batchName: prospectImportJobs.batchName })
    .from(prospectImportJobs)
    .where(eq(prospectImportJobs.id, summary.importJobId))
    .limit(1);
  return { ...summary, batchName: rows[0]?.batchName || "Untitled batch" };
}

function toDbPatch(
  intel: ProspectIntelligence,
  extras?: Partial<typeof prospectIntelligence.$inferInsert>,
): Omit<typeof prospectIntelligence.$inferInsert, "contactId"> {
  // Update patch only — contactId is the row key, not a writable field here.
  const { contactId: _contactId, ...restExtras } = extras ?? {};
  return {
    analysisStatus: intel.analysisStatus ?? "completed",
    reviewStatus: intel.reviewStatus ?? "pending",
    industry: intel.industry ?? null,
    businessType: intel.businessType ?? null,
    companyName: intel.companyName ?? null,
    jobTitle: intel.jobTitle ?? null,
    agencyLikelihood: intel.agencyLikelihood ?? null,
    shopifyMerchantLikelihood: intel.shopifyMerchantLikelihood ?? null,
    realEstateLikelihood: intel.realEstateLikelihood ?? null,
    localBusinessLikelihood: intel.localBusinessLikelihood ?? null,
    saasLikelihood: intel.saasLikelihood ?? null,
    potentialFit: intel.potentialFit ?? null,
    leadScore: intel.leadScore ?? null,
    priority: intel.priority ?? null,
    recommendedOffer: intel.recommendedOffer ?? null,
    suggestedOutreachAngle: intel.suggestedOutreachAngle ?? null,
    suggestedFirstMessage: intel.suggestedFirstMessage ?? null,
    suggestedOutreachSubject: intel.suggestedOutreachSubject ?? null,
    reasoningSummary: intel.reasoningSummary ?? null,
    needsReview: Boolean(intel.needsReview),
    confidence: intel.confidence ?? null,
    aiModel: intel.aiModel ?? null,
    aiVersion: intel.aiVersion ?? PROSPECT_INTELLIGENCE_AI_VERSION,
    analyzedAt: intel.analyzedAt ? new Date(intel.analyzedAt) : new Date(),
    updatedAt: new Date(),
    ...restExtras,
  };
}

async function syncContactIntelligence(
  contact: Contact,
  intel: ProspectIntelligence,
  importJobId?: string | null,
): Promise<Contact | undefined> {
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pipelinePatch = resolvePipelineStageAfterAnalysis(contact.pipelineStage);

  return storage.updateContact(contact.id, {
    customFields: {
      ...cf,
      prospectIntelligence: intel,
    },
    ...(pipelinePatch ? { pipelineStage: pipelinePatch } : {}),
  });
}

export async function getImportJobContactIds(importJobId: string): Promise<string[]> {
  const rows = await db
    .select()
    .from(prospectImportJobs)
    .where(eq(prospectImportJobs.id, importJobId))
    .limit(1);
  const job = rows[0];
  if (!job) throw new Error("Import job not found");

  const details = (job.resultDetails || {}) as { createdContactIds?: string[] };
  const ids = Array.isArray(details.createdContactIds) ? details.createdContactIds : [];
  if (!ids.length) throw new Error("No imported contacts found for this batch.");

  const contacts: Contact[] = [];
  for (const id of ids) {
    const c = await storage.getContact(id);
    if (c && isInternalImportedProspect(c)) contacts.push(c);
  }
  return contacts.map((c) => c.id);
}

async function defaultAiComplete(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const result = await aiProvider.complete("extraction", messages, {
    jsonMode: true,
    maxTokens: 700,
    returnUsage: true,
  });
  if (typeof result === "string") return { content: result };
  return result;
}

type QualFailureStage =
  | "route_entered"
  | "contact_loaded"
  | "intel_row_loaded"
  | "claim"
  | "workspace_context"
  | "prompt_built"
  | "model_call_start"
  | "model_response"
  | "json_parse"
  | "schema_validate"
  | "db_persist"
  | "failed";

function extractProviderErrorMeta(err: unknown): {
  providerStatus?: number | string;
  providerCode?: string;
  errorName: string;
  errorMessage: string;
  stack?: string;
} {
  const errorName = err instanceof Error ? err.name : typeof err;
  const errorMessage = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const anyErr = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    error?: { code?: string; type?: string; message?: string };
  };
  const providerStatus = anyErr?.status ?? anyErr?.statusCode;
  const providerCode =
    anyErr?.code || anyErr?.error?.code || anyErr?.error?.type || undefined;
  return {
    providerStatus,
    providerCode: providerCode ? String(providerCode) : undefined,
    errorName: String(errorName),
    errorMessage: String(errorMessage).substring(0, 800),
    stack: stack ? String(stack).substring(0, 2000) : undefined,
  };
}

function logProspectQualificationFailed(params: {
  contactId: string;
  workspaceId?: string | null;
  bulkJobId?: string | null;
  model?: string | null;
  stage: QualFailureStage | string;
  err: unknown;
}): void {
  const meta = extractProviderErrorMeta(params.err);
  const payload = {
    tag: "[ProspectIntelligence]",
    event: "prospect_qualification_failed",
    contactId: params.contactId,
    workspaceId: params.workspaceId || null,
    bulkJobId: params.bulkJobId || null,
    model: params.model || null,
    stage: params.stage,
    errorName: meta.errorName,
    errorMessage: meta.errorMessage,
    providerStatus: meta.providerStatus ?? null,
    providerCode: meta.providerCode ?? null,
    stack: meta.stack ?? null,
  };
  console.error(JSON.stringify(payload));
}


export type ProspectAnalysisClaimOutcome =
  | {
      outcome: "claimed";
      attemptId: string;
      deliberateRerun: boolean;
      backgroundRefresh: boolean;
    }
  | { outcome: "already_completed"; row: ProspectIntelligenceRow }
  | { outcome: "already_processing" };

/**
 * Atomically claim a prospect intelligence row for analysis (pending/failed → processing).
 * Completed/needs_review rows are only reclaimable with deliberateRerun or backgroundRefresh.
 * Job creation must never call this — only the worker / analyze entrypoint.
 */
export async function claimProspectContactForAnalysis(params: {
  contactId: string;
  force?: boolean;
  deliberateRerun?: boolean;
  backgroundRefresh?: boolean;
  importJobId?: string | null;
  aiModel?: string | null;
  workerId?: string | null;
}): Promise<ProspectAnalysisClaimOutcome> {
  const deliberateRerun = Boolean(params.deliberateRerun);
  const backgroundRefresh = Boolean(params.backgroundRefresh) && !deliberateRerun;
  const existingRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  let existing = existingRows[0];

  // Never silently reclaim a usable success unless this is an explicit re-run / background refresh.
  if (
    existing &&
    isProspectAiReviewUsableSuccess(existing.analysisStatus) &&
    !deliberateRerun &&
    !backgroundRefresh
  ) {
    return { outcome: "already_completed", row: existing };
  }

  if (existing?.analysisStatus === "processing") {
    return { outcome: "already_processing" };
  }

  const now = new Date();
  const attemptId = crypto.randomUUID();
  const keyDiag = describeOpenAiKeyRuntimeDiagnostics();
  if (!existing) {
    const inserted = await db
      .insert(prospectIntelligence)
      .values({
        contactId: params.contactId,
        importJobId: params.importJobId ?? null,
        analysisStatus: "processing",
        reviewStatus: "pending",
        aiModel: params.aiModel ?? null,
        aiVersion: PROSPECT_INTELLIGENCE_AI_VERSION,
        errorMessage: null,
        rawResult: buildProspectAiAttemptClaimRaw(
          {
            analysisAttemptId: attemptId,
            attemptStartedAt: now.toISOString(),
            attemptWorkerId: params.workerId || null,
            attemptRailwayServiceName: keyDiag.railwayServiceName,
            attemptRailwayDeploymentId: keyDiag.railwayDeploymentId,
            attemptKeyPrefixClass: keyDiag.prefixClass,
          },
          null,
          { deliberateRerun, backgroundRefresh, clearOutputs: true },
        ),
        updatedAt: now,
      })
      .onConflictDoNothing({ target: prospectIntelligence.contactId })
      .returning();
    if (inserted[0]) {
      // #region agent log
      if (process.env.NODE_ENV !== "production") fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d96ff4" },
        body: JSON.stringify({
          sessionId: "d96ff4",
          runId: "post-fix",
          hypothesisId: "H-claim",
          location: "prospectIntelligenceService.ts:claim:insert",
          message: "claimed new intelligence row",
          data: {
            contactId: params.contactId,
            attemptId,
            deliberateRerun,
            backgroundRefresh,
            keyPrefixClass: keyDiag.prefixClass,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return { outcome: "claimed", attemptId, deliberateRerun, backgroundRefresh };
    }
    existing = (
      await db
        .select()
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.contactId, params.contactId))
        .limit(1)
    )[0];
    if (existing?.analysisStatus === "processing") {
      return { outcome: "already_processing" };
    }
    if (
      existing &&
      isProspectAiReviewUsableSuccess(existing.analysisStatus) &&
      !deliberateRerun &&
      !backgroundRefresh
    ) {
      return { outcome: "already_completed", row: existing };
    }
  }

  const priorRaw =
    existing?.rawResult && typeof existing.rawResult === "object"
      ? (existing.rawResult as Record<string, unknown>)
      : {};
  const priorUsable = isProspectAiReviewUsableSuccess(existing?.analysisStatus)
    ? String(existing?.analysisStatus)
    : null;
  const preserveOutputs = backgroundRefresh && Boolean(priorUsable);
  const priorFailureKind = priorRaw.aiReviewFailureKind ?? priorRaw.failureKind;
  const claimRawResult = buildProspectAiAttemptClaimRaw(
    {
      analysisAttemptId: attemptId,
      attemptStartedAt: now.toISOString(),
      attemptWorkerId: params.workerId || null,
      attemptRailwayServiceName: keyDiag.railwayServiceName,
      attemptRailwayDeploymentId: keyDiag.railwayDeploymentId,
      attemptKeyPrefixClass: keyDiag.prefixClass,
    },
    {
      ...priorRaw,
      ...(priorFailureKind != null && String(priorFailureKind).trim() && !preserveOutputs
        ? { aiReviewFailureKind: String(priorFailureKind), aiReviewRetrying: true }
        : {}),
      deliberateRerun: deliberateRerun || Boolean(priorRaw.deliberateRerun),
      backgroundRefresh,
    },
    {
      deliberateRerun,
      backgroundRefresh,
      priorUsableStatus: priorUsable,
      clearOutputs: !preserveOutputs,
    },
  );

  const updated = await db
    .update(prospectIntelligence)
    .set({
      analysisStatus: "processing",
      errorMessage: null,
      // Drop prior AI outputs unless this is a background refresh of a usable success.
      ...(preserveOutputs ? {} : prospectAiReviewOutputClearPatch()),
      rawResult: claimRawResult,
      updatedAt: now,
      ...(params.aiModel ? { aiModel: params.aiModel } : {}),
      ...(params.importJobId !== undefined
        ? { importJobId: params.importJobId }
        : {}),
    })
    .where(
      and(
        eq(prospectIntelligence.contactId, params.contactId),
        inArray(
          prospectIntelligence.analysisStatus,
          claimableAnalysisStatuses(Boolean(params.force), {
            deliberateRerun,
            backgroundRefresh,
          }),
        ),
      ),
    )
    .returning();

  if (updated.length) {
    // #region agent log
    if (process.env.NODE_ENV !== "production") fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d96ff4" },
      body: JSON.stringify({
        sessionId: "d96ff4",
        runId: "post-fix",
        hypothesisId: "H-claim",
        location: "prospectIntelligenceService.ts:claim:update",
        message: "claimed intelligence row for analysis",
        data: {
          contactId: params.contactId,
          attemptId,
          deliberateRerun,
          backgroundRefresh,
          preserveOutputs,
          priorStatus: existing?.analysisStatus || null,
          keyPrefixClass: keyDiag.prefixClass,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return { outcome: "claimed", attemptId, deliberateRerun, backgroundRefresh };
  }

  const again = (
    await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, params.contactId))
      .limit(1)
  )[0];
  if (again && isProspectAiReviewUsableSuccess(again.analysisStatus)) {
    return { outcome: "already_completed", row: again };
  }
  return { outcome: "already_processing" };
}

/**
 * Clear stuck/failed analysis without overwriting a usable completed review.
 * Background-refresh failures restore prior success and record lastRefreshFailure.
 */
export async function markProspectAnalysisFailed(
  contactId: string,
  reason: string,
): Promise<boolean> {
  const message = reason.substring(0, 500);
  const classified = classifyProspectAiReviewFailure(message);
  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  const row = rows[0];
  if (!row) return false;
  if (isProspectAiReviewUsableSuccess(row.analysisStatus)) return false;

  const raw =
    row.rawResult && typeof row.rawResult === "object"
      ? (row.rawResult as Record<string, unknown>)
      : {};
  const action = resolveProspectAiFailurePersistAction({
    currentStatus: row.analysisStatus,
    currentAttemptId:
      typeof raw.analysisAttemptId === "string" ? raw.analysisAttemptId : null,
    failingAttemptId:
      typeof raw.analysisAttemptId === "string" ? raw.analysisAttemptId : "legacy",
    deliberateRerun: Boolean(raw.deliberateRerun),
    backgroundRefresh: Boolean(raw.backgroundRefresh),
    priorUsableStatus:
      typeof raw.priorUsableStatus === "string" ? raw.priorUsableStatus : null,
  });
  const endedAt = new Date().toISOString();
  if (action === "preserve_success_record_refresh_failure") {
    const restoreStatus = isProspectAiReviewUsableSuccess(
      typeof raw.priorUsableStatus === "string" ? raw.priorUsableStatus : null,
    )
      ? String(raw.priorUsableStatus)
      : "completed";
    const updated = await db
      .update(prospectIntelligence)
      .set({
        analysisStatus: restoreStatus,
        errorMessage: null,
        rawResult: {
          ...mergeProspectAiRefreshFailureRaw(raw, {
            message,
            kind: classified.kind,
            at: endedAt,
            attemptId:
              typeof raw.analysisAttemptId === "string"
                ? raw.analysisAttemptId
                : "unknown",
          }),
          attemptEndedAt: endedAt,
          backgroundRefresh: false,
          deliberateRerun: false,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(prospectIntelligence.contactId, contactId),
          inArray(prospectIntelligence.analysisStatus, ["pending", "processing"]),
        ),
      )
      .returning({ contactId: prospectIntelligence.contactId });
    return updated.length > 0;
  }
  if (action === "ignore_stale") return false;

  const updated = await db
    .update(prospectIntelligence)
    .set({
      analysisStatus: "failed",
      errorMessage: message,
      ...prospectAiReviewOutputClearPatch(),
      rawResult: {
        aiReviewFailureKind: classified.kind,
        aiReviewFailureStage: "mark_failed",
        autoRetryable: classified.autoRetryable,
        userRetryable: classified.userRetryable,
        analysisAttemptId: raw.analysisAttemptId || null,
        attemptStartedAt: raw.attemptStartedAt || null,
        attemptEndedAt: endedAt,
        attemptWorkerId: raw.attemptWorkerId || null,
        attemptRailwayServiceName: raw.attemptRailwayServiceName || null,
        attemptRailwayDeploymentId: raw.attemptRailwayDeploymentId || null,
        attemptKeyPrefixClass: raw.attemptKeyPrefixClass || null,
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(prospectIntelligence.contactId, contactId),
        inArray(prospectIntelligence.analysisStatus, ["pending", "processing"]),
      ),
    )
    .returning({ contactId: prospectIntelligence.contactId });
  return updated.length > 0;
}

/**
 * Heal abandoned `processing` rows (e.g. pre-mark bug leftovers).
 * Skips contacts still listed on a running bulk job with a valid lease.
 */
export async function healAbandonedProcessingAnalysis(params?: {
  olderThanMs?: number;
  now?: Date;
}): Promise<number> {
  const olderThanMs = params?.olderThanMs ?? PROSPECT_ANALYSIS_STALE_PROCESSING_MS;
  const now = params?.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanMs);

  const activeJobs = await db
    .select({
      status: prospectBulkAnalysisJobs.status,
      leaseExpiresAt: prospectBulkAnalysisJobs.leaseExpiresAt,
      contactIds: prospectBulkAnalysisJobs.contactIds,
    })
    .from(prospectBulkAnalysisJobs)
    .where(
      and(
        eq(prospectBulkAnalysisJobs.status, "running"),
        isNotNull(prospectBulkAnalysisJobs.leaseExpiresAt),
        gt(prospectBulkAnalysisJobs.leaseExpiresAt, now),
      ),
    );

  const stale = await db
    .select({
      contactId: prospectIntelligence.contactId,
      updatedAt: prospectIntelligence.updatedAt,
    })
    .from(prospectIntelligence)
    .where(
      and(
        eq(prospectIntelligence.analysisStatus, "processing"),
        lt(prospectIntelligence.updatedAt, cutoff),
      ),
    );

  const toHeal = stale
    .map((r) => r.contactId)
    .filter(
      (contactId) =>
        !contactOwnedByActiveBulkLease({
          contactId,
          activeJobs,
          now,
        }),
    );
  if (!toHeal.length) return 0;

  // Prefer per-row heal so background refreshes restore prior success instead of failing.
  let healedCount = 0;
  for (const contactId of toHeal) {
    const ok = await markProspectAnalysisFailed(
      contactId,
      "Abandoned stale processing (auto-heal)",
    );
    if (ok) healedCount += 1;
  }

  if (healedCount) {
    console.info(
      `[ProspectIntelligence] healed ${healedCount} abandoned processing row(s)`,
    );
  }
  return healedCount;
}

export async function analyzeProspectContact(params: {
  contactId: string;
  importJobId?: string | null;
  force?: boolean;
  deliberateRerun?: boolean;
  backgroundRefresh?: boolean;
  workerId?: string | null;
  /**
   * When true, the caller (bulk worker) already atomically claimed this row.
   * Skips the processing guard / re-claim so the owning worker can run AI.
   */
  preClaimed?: boolean;
  completeFn?: AiCompleteFn;
}): Promise<ProspectIntelligence> {
  let stage: QualFailureStage | string = "contact_loaded";
  let model = "";
  let workspaceId: string | null = null;
  let attemptId = "";
  let deliberateRerun = Boolean(params.deliberateRerun);
  let backgroundRefresh = Boolean(params.backgroundRefresh) && !deliberateRerun;

  if (runningContactAnalysis.has(params.contactId)) {
    const err = new Error("Analysis already in progress for this contact.");
    logProspectQualificationFailed({
      contactId: params.contactId,
      stage: "claim",
      err,
    });
    throw err;
  }

  const persistFailedAttempt = async (
    message: string,
    failStage: string,
    err: unknown,
  ): Promise<"mark_failed" | "preserve_success_record_refresh_failure" | "ignore_stale"> => {
    const classified = classifyProspectAiReviewFailure(err ?? message, failStage);
    const rows = await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, params.contactId))
      .limit(1);
    const row = rows[0];
    const raw =
      row?.rawResult && typeof row.rawResult === "object"
        ? (row.rawResult as Record<string, unknown>)
        : {};
    const action = resolveProspectAiFailurePersistAction({
      currentStatus: row?.analysisStatus,
      currentAttemptId:
        typeof raw.analysisAttemptId === "string" ? raw.analysisAttemptId : null,
      failingAttemptId: attemptId || null,
      deliberateRerun: deliberateRerun || Boolean(raw.deliberateRerun),
      backgroundRefresh: backgroundRefresh || Boolean(raw.backgroundRefresh),
      priorUsableStatus:
        typeof raw.priorUsableStatus === "string" ? raw.priorUsableStatus : null,
    });
    // #region agent log
    if (process.env.NODE_ENV !== "production") fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d96ff4" },
      body: JSON.stringify({
        sessionId: "d96ff4",
        runId: "post-fix",
        hypothesisId: "H-persist-fail",
        location: "prospectIntelligenceService.ts:persistFailedAttempt",
        message: "AI failure persist action resolved",
        data: {
          contactId: params.contactId,
          attemptId,
          action,
          currentStatus: row?.analysisStatus || null,
          failureKind: classified.kind,
          backgroundRefresh,
          deliberateRerun,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (action === "ignore_stale") return action;
    const endedAt = new Date().toISOString();
    if (action === "preserve_success_record_refresh_failure") {
      const restoreStatus = isProspectAiReviewUsableSuccess(
        typeof raw.priorUsableStatus === "string" ? raw.priorUsableStatus : null,
      )
        ? String(raw.priorUsableStatus)
        : isProspectAiReviewUsableSuccess(row?.analysisStatus)
          ? String(row?.analysisStatus)
          : "completed";
      await db
        .update(prospectIntelligence)
        .set({
          analysisStatus: restoreStatus,
          errorMessage: null,
          rawResult: {
            ...mergeProspectAiRefreshFailureRaw(raw, {
              message: message.substring(0, 500),
              kind: classified.kind,
              at: endedAt,
              attemptId: attemptId || "unknown",
            }),
            attemptEndedAt: endedAt,
            backgroundRefresh: false,
            deliberateRerun: false,
          },
          updatedAt: new Date(),
        })
        .where(eq(prospectIntelligence.contactId, params.contactId));
      return action;
    }
    await db
      .update(prospectIntelligence)
      .set({
        analysisStatus: "failed",
        errorMessage: message.substring(0, 500),
        ...prospectAiReviewOutputClearPatch(),
        rawResult: {
          aiReviewFailureKind: classified.kind,
          aiReviewFailureStage: failStage,
          autoRetryable: classified.autoRetryable,
          userRetryable: classified.userRetryable,
          analysisAttemptId: attemptId || raw.analysisAttemptId || null,
          attemptStartedAt: raw.attemptStartedAt || null,
          attemptEndedAt: endedAt,
          attemptWorkerId: raw.attemptWorkerId || null,
          attemptRailwayServiceName: raw.attemptRailwayServiceName || null,
          attemptRailwayDeploymentId: raw.attemptRailwayDeploymentId || null,
          attemptKeyPrefixClass: raw.attemptKeyPrefixClass || null,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(prospectIntelligence.contactId, params.contactId),
          inArray(prospectIntelligence.analysisStatus, ["pending", "processing", "failed"]),
        ),
      );
    return action;
  };

  try {
    const contact = await storage.getContact(params.contactId);
    if (!contact) throw new Error("Contact not found");
    workspaceId = contact.userId;
    assertInternalImportedProspect(contact);

    model = aiProvider.getModelConfig("extraction").model;
    const importJobId =
      params.importJobId ?? readProspectImportMetadata(contact)?.importJobId ?? null;

    // Prior failure evidence (do not log PII beyond ids)
    const priorRows = await db
      .select({
        analysisStatus: prospectIntelligence.analysisStatus,
        errorMessage: prospectIntelligence.errorMessage,
      })
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, params.contactId))
      .limit(1);
    stage = "claim";

    if (!params.preClaimed) {
      const claim = await claimProspectContactForAnalysis({
        contactId: params.contactId,
        force: params.force,
        deliberateRerun,
        backgroundRefresh,
        importJobId,
        aiModel: model,
        workerId: params.workerId,
      });
      if (claim.outcome === "already_completed") {
        return mapIntelligenceRow(claim.row);
      }
      if (claim.outcome === "already_processing") {
        throw new Error("Analysis already in progress for this contact.");
      }
      attemptId = claim.attemptId;
      deliberateRerun = claim.deliberateRerun;
      backgroundRefresh = claim.backgroundRefresh;
    } else {
      const existingRows = await db
        .select()
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.contactId, params.contactId))
        .limit(1);
      const existing = existingRows[0];
      if (!existing || existing.analysisStatus !== "processing") {
        throw new Error("Analysis claim required before preClaimed analyze.");
      }
      const raw =
        existing.rawResult && typeof existing.rawResult === "object"
          ? (existing.rawResult as Record<string, unknown>)
          : {};
      attemptId =
        typeof raw.analysisAttemptId === "string" && raw.analysisAttemptId
          ? raw.analysisAttemptId
          : crypto.randomUUID();
      deliberateRerun = deliberateRerun || Boolean(raw.deliberateRerun);
      backgroundRefresh =
        (backgroundRefresh || Boolean(raw.backgroundRefresh)) && !deliberateRerun;
    }

    runningContactAnalysis.add(params.contactId);

    try {
      stage = "prompt_built";
      const input = buildProspectIntelligenceInput(contact);

      stage = "workspace_context";
      const workspaceContext = await loadProspectAiWorkspaceContext(contact.userId, {
        contactId: contact.id,
        analysisPath: params.force ? "reanalyze" : "analyze",
      });

      let intel: ProspectIntelligence;
      let promptTokens = 0;
      let completionTokens = 0;

      if (hasInsufficientProspectData(input)) {
        intel = buildInsufficientDataResult(model, input, workspaceContext);
      } else {
        const completeFn = params.completeFn ?? defaultAiComplete;
        const messages = [
          {
            role: "system" as const,
            content:
              "You are Prospect AI, a growth analyst for the current workspace. Prefer AI Brain business intelligence over Business Profile identity when both exist. Output strict JSON only. Never hallucinate unsupported business facts. Fit means ICP/campaign suitability for the workspace offer — not whether the business exists. Never pitch the prospect's industry as the sender's product. A selected discovery business type is intentional targeting for any vertical; do not mark those prospects not_a_fit merely because industries differ or because they lack CRM/automation.",
          },
          {
            role: "user" as const,
            content: buildProspectIntelligencePrompt(input, workspaceContext),
          },
        ];

        let lastErr: unknown;
        let parsed: ProspectIntelligence | null = null;
        for (let attempt = 0; attempt <= MAX_AI_RETRIES; attempt++) {
          try {
            stage = "model_call_start";
            const response = await completeFn(messages);
            promptTokens += response.usage?.promptTokens ?? 0;
            completionTokens += response.usage?.completionTokens ?? 0;
            const rawText = response.content || "";
            stage = "model_response";

            stage = "json_parse";
            const raw = JSON.parse(rawText || "{}");

            stage = "schema_validate";
            parsed = parseAndValidateProspectIntelligence(raw, model, input, workspaceContext);
            break;
          } catch (err) {
            lastErr = err;
            const classified = classifyProspectAiReviewFailure(err, stage);
            const transient =
              classified.autoRetryable || isProspectAiTransientProviderError(err);
            if (!transient || attempt === MAX_AI_RETRIES) {
              break;
            }
            // Exponential-ish backoff: 500ms, 1s, 2s, 3s…
            await new Promise((r) => setTimeout(r, Math.min(3000, 500 * 2 ** attempt)));
          }
        }

        if (!parsed) {
          const { formatProspectAiProviderFailureMessage } = await import("@shared/openaiApiKey");
          const message = formatProspectAiProviderFailureMessage(lastErr ?? "Qualification failed");
          logProspectQualificationFailed({
            contactId: params.contactId,
            workspaceId,
            model,
            stage,
            err: lastErr ?? new Error(message),
          });
          await persistFailedAttempt(message, stage, lastErr ?? message);
          throw new Error(message);
        }
        intel = parsed;
      }

      stage = "db_persist";
      const existingRows = await db
        .select()
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.contactId, params.contactId))
        .limit(1);
      const existing = existingRows[0];
      const existingRaw =
        existing?.rawResult && typeof existing.rawResult === "object"
          ? (existing.rawResult as Record<string, unknown>)
          : {};
      const successAction = resolveProspectAiSuccessPersistAction({
        currentStatus: existing?.analysisStatus,
        currentAttemptId:
          typeof existingRaw.analysisAttemptId === "string"
            ? existingRaw.analysisAttemptId
            : null,
        successAttemptId: attemptId || null,
      });
      // #region agent log
      if (process.env.NODE_ENV !== "production") fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d96ff4" },
        body: JSON.stringify({
          sessionId: "d96ff4",
          runId: "post-fix",
          hypothesisId: "H-persist-success",
          location: "prospectIntelligenceService.ts:db_persist",
          message: "AI success persist action resolved",
          data: {
            contactId: params.contactId,
            attemptId,
            action: successAction,
            currentStatus: existing?.analysisStatus || null,
            rowAttemptId: existingRaw.analysisAttemptId || null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (successAction === "ignore_stale") {
        if (existing) return mapIntelligenceRow(existing);
        throw new Error("Stale AI success ignored; newer attempt owns this contact.");
      }
      const humanLocked = existing
        ? hasHumanQualificationLock({
            approvedByUserId: existing.approvedByUserId,
            reviewStatus: existing.reviewStatus,
            recommendedOffer: existing.recommendedOffer,
            enrichmentTriggeredBy: existing.enrichmentTriggeredBy,
            rawResult: existingRaw,
          })
        : false;

      const keyDiag = describeOpenAiKeyRuntimeDiagnostics();
      const endedAt = new Date().toISOString();
      const requiresWebsiteIntelligence =
        !input.enrichmentCompleted && Boolean(input.websiteUrl);
      let rawResult: Record<string, unknown> = {
        ...(intel as unknown as Record<string, unknown>),
        analysisAttemptId: attemptId || existingRaw.analysisAttemptId || null,
        attemptStartedAt: existingRaw.attemptStartedAt || null,
        attemptEndedAt: endedAt,
        attemptWorkerId: existingRaw.attemptWorkerId || params.workerId || null,
        attemptRailwayServiceName:
          existingRaw.attemptRailwayServiceName || keyDiag.railwayServiceName,
        attemptRailwayDeploymentId:
          existingRaw.attemptRailwayDeploymentId || keyDiag.railwayDeploymentId,
        attemptKeyPrefixClass: existingRaw.attemptKeyPrefixClass || keyDiag.prefixClass,
        requiresWebsiteIntelligence,
        deliberateRerun: false,
        backgroundRefresh: false,
      };
      const patch = toDbPatch(intel, {
        importJobId,
        promptTokens,
        completionTokens,
        rawResult,
        errorMessage: null,
      });

      // Manual decisions always override later AI reanalysis.
      if (existing && humanLocked) {
        const existingOffer = String(existing.recommendedOffer || "").toLowerCase();
        const src = readProspectQualificationSource(existingRaw);
        if (src === "manual_not_qualified" || existingOffer === "not_a_fit") {
          patch.recommendedOffer = "not_a_fit";
          patch.needsReview = false;
          patch.reviewStatus = existing.reviewStatus || "pending";
          patch.approvedAt = null;
          patch.approvedByUserId = null;
          rawResult = buildQualificationSourcePatch("manual_not_qualified", {
            ...rawResult,
            ...existingRaw,
          });
        } else if (src === "manual_needs_review" || String(existing.reviewStatus).toLowerCase() === "needs_review") {
          patch.reviewStatus = "needs_review";
          patch.needsReview = true;
          patch.approvedAt = null;
          patch.approvedByUserId = null;
          if (String(patch.recommendedOffer || "").toLowerCase() === "not_a_fit") {
            patch.recommendedOffer =
              existingOffer && existingOffer !== "not_a_fit"
                ? existing.recommendedOffer
                : "general_demo";
          }
          rawResult = buildQualificationSourcePatch("manual_needs_review", {
            ...rawResult,
            ...existingRaw,
          });
        } else {
          // Manual Qualified
          patch.reviewStatus = "approved";
          patch.approvedAt = existing.approvedAt ?? new Date();
          patch.approvedByUserId = existing.approvedByUserId;
          if (String(patch.recommendedOffer || "").toLowerCase() === "not_a_fit") {
            patch.recommendedOffer =
              existingOffer && existingOffer !== "not_a_fit"
                ? existing.recommendedOffer
                : "general_demo";
          }
          Object.assign(
            patch,
            buildQualifiedPresentationClearPatch({
              priority: patch.priority ?? intel.priority,
              analysisStatus: patch.analysisStatus ?? intel.analysisStatus,
              leadScore: patch.leadScore ?? intel.leadScore,
            }),
          );
          rawResult = buildQualificationSourcePatch("manual", {
            ...rawResult,
            ...existingRaw,
          });
        }
        patch.rawResult = rawResult;
      } else {
        // Auto-qualify immediately after successful AI Review (not enrichment/outreach).
        const websiteUrl = resolveProspectWebsiteUrl(contact) || undefined;
        const autoOk = shouldAutoQualifyFromAiResult({
          analysisStatus: intel.analysisStatus,
          needsReview: intel.needsReview,
          priority: intel.priority,
          recommendedOffer: intel.recommendedOffer,
          potentialFit: intel.potentialFit,
          confidence: intel.confidence,
          name: contact.name,
          company: intel.companyName,
          companyName: intel.companyName,
          businessType: intel.businessType,
          industry: intel.industry,
          websiteUrl,
        });
        if (autoOk) {
          patch.reviewStatus = "approved";
          patch.approvedAt = new Date();
          // System decision — no user id.
          patch.approvedByUserId = null;
          Object.assign(
            patch,
            buildQualifiedPresentationClearPatch({
              priority: intel.priority,
              analysisStatus: intel.analysisStatus,
              leadScore: intel.leadScore,
            }),
          );
          rawResult = buildQualificationSourcePatch("auto_ai", rawResult);
          patch.rawResult = rawResult;
        } else if (String(intel.recommendedOffer || "").toLowerCase() === "not_a_fit") {
          patch.reviewStatus = "pending";
          patch.needsReview = false;
          patch.approvedAt = null;
          patch.approvedByUserId = null;
          rawResult = buildQualificationSourcePatch("auto_ai_reject", rawResult);
          patch.rawResult = rawResult;
        } else {
          // Genuine exception → Needs Review
          patch.reviewStatus = "needs_review";
          patch.needsReview = true;
          patch.approvedAt = null;
          patch.approvedByUserId = null;
          patch.rawResult = rawResult;
        }
      }

      await db
        .update(prospectIntelligence)
        .set(patch)
        .where(eq(prospectIntelligence.contactId, params.contactId));

      await syncContactIntelligence(contact, { ...intel, reviewStatus: patch.reviewStatus as ProspectIntelligence["reviewStatus"], needsReview: patch.needsReview, recommendedOffer: patch.recommendedOffer ?? intel.recommendedOffer, approvedAt: patch.approvedAt instanceof Date ? patch.approvedAt.toISOString() : intel.approvedAt, qualificationSource: readProspectQualificationSource((patch.rawResult as Record<string, unknown>) || null) }, importJobId);
      return { ...intel, reviewStatus: patch.reviewStatus as ProspectIntelligence["reviewStatus"], needsReview: patch.needsReview, recommendedOffer: (patch.recommendedOffer as ProspectIntelligence["recommendedOffer"]) ?? intel.recommendedOffer, approvedAt: patch.approvedAt instanceof Date ? patch.approvedAt.toISOString() : intel.approvedAt, qualificationSource: readProspectQualificationSource((patch.rawResult as Record<string, unknown>) || null) };
    } finally {
      runningContactAnalysis.delete(params.contactId);
    }
  } catch (err) {
    // Outer failures (eligibility, claim, context) that did not already log
    if (!(err instanceof Error && /Analysis already in progress|Contact not found|only available for internal/i.test(err.message))) {
      // already logged for AI path; still log outer if not from AI failure throw
    }
    if (
      err instanceof Error &&
      !/^\s*$/.test(err.message) &&
      stage !== "model_call_start" &&
      stage !== "model_response" &&
      stage !== "json_parse" &&
      stage !== "schema_validate"
    ) {
      logProspectQualificationFailed({
        contactId: params.contactId,
        workspaceId,
        model: model || null,
        stage,
        err,
      });
    }
    throw err;
  }
}

export async function createProspectIntelligenceJob(params: {
  importJobId: string;
  initiatedByUserId: string;
  force?: boolean;
}): Promise<ProspectIntelligenceJobSummary> {
  if (runningBatchJobs.has(params.importJobId)) {
    throw new Error("An analysis job is already running for this import batch.");
  }

  const importRows = await db
    .select()
    .from(prospectImportJobs)
    .where(eq(prospectImportJobs.id, params.importJobId))
    .limit(1);
  const importJob = importRows[0];
  if (!importJob) throw new Error("Import job not found");
  if (importJob.status !== "completed") throw new Error("Import job must be completed before AI analysis.");
  if (importJob.undoStatus === "undone") throw new Error("Cannot analyze an undone import batch.");

  const activeRows = await db
    .select()
    .from(prospectIntelligenceJobs)
    .where(
      and(
        eq(prospectIntelligenceJobs.importJobId, params.importJobId),
        inArray(prospectIntelligenceJobs.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  if (activeRows[0]) {
    return await enrichJobSummary(mapAnalysisJobSummary(activeRows[0]));
  }

  const contactIds = await getImportJobContactIds(params.importJobId);
  const model = aiProvider.getModelConfig("extraction").model;

  const [row] = await db
    .insert(prospectIntelligenceJobs)
    .values({
      importJobId: params.importJobId,
      initiatedByUserId: params.initiatedByUserId,
      status: "pending",
      contactIds,
      progressTotal: contactIds.length,
      aiModel: model,
    })
    .returning();

  setImmediate(() => {
    void runProspectIntelligenceJob(row.id, { force: params.force }).catch((err) => {
      console.error("[ProspectIntelligence] Batch job failed:", err);
    });
  });

  return await enrichJobSummary(mapAnalysisJobSummary(row));
}

async function updateAnalysisJob(
  jobId: string,
  patch: Partial<typeof prospectIntelligenceJobs.$inferInsert>,
): Promise<void> {
  await db.update(prospectIntelligenceJobs).set(patch).where(eq(prospectIntelligenceJobs.id, jobId));
}

async function runProspectIntelligenceJob(
  jobId: string,
  opts?: { force?: boolean; completeFn?: AiCompleteFn },
): Promise<void> {
  const rows = await db
    .select()
    .from(prospectIntelligenceJobs)
    .where(eq(prospectIntelligenceJobs.id, jobId))
    .limit(1);
  const job = rows[0];
  if (!job) return;

  const importJobId = job.importJobId;
  if (runningBatchJobs.has(importJobId)) return;
  runningBatchJobs.add(importJobId);

  try {
    await updateAnalysisJob(jobId, { status: "running", startedAt: new Date() });

    const contactIds = (job.contactIds as string[]) ?? [];
    let analyzed = 0;
    let highPriority = 0;
    let mediumPriority = 0;
    let lowPriority = 0;
    let needsReview = 0;
    let errors = 0;
    let promptTokensTotal = 0;
    let completionTokensTotal = 0;

    for (let i = 0; i < contactIds.length; i += ANALYSIS_CONCURRENCY) {
      const batch = contactIds.slice(i, i + ANALYSIS_CONCURRENCY);
      for (const contactId of batch) {
        try {
          const intel = await analyzeProspectContact({
            contactId,
            importJobId: job.importJobId,
            force: opts?.force,
            completeFn: opts?.completeFn,
          });
          analyzed += 1;
          const counts = countByPriority(intel.priority);
          highPriority += counts.high;
          mediumPriority += counts.medium;
          lowPriority += counts.low;
          needsReview += counts.needsReview;

          const piRows = await db
            .select({
              promptTokens: prospectIntelligence.promptTokens,
              completionTokens: prospectIntelligence.completionTokens,
            })
            .from(prospectIntelligence)
            .where(eq(prospectIntelligence.contactId, contactId))
            .limit(1);
          promptTokensTotal += piRows[0]?.promptTokens ?? 0;
          completionTokensTotal += piRows[0]?.completionTokens ?? 0;
        } catch (err) {
          errors += 1;
          console.error("[ProspectIntelligence] Contact analysis error:", contactId, err);
        }

        await updateAnalysisJob(jobId, {
          progressCurrent: i + batch.indexOf(contactId) + 1,
          resultAnalyzed: analyzed,
          resultHighPriority: highPriority,
          resultMediumPriority: mediumPriority,
          resultLowPriority: lowPriority,
          resultNeedsReview: needsReview,
          resultErrors: errors,
          promptTokensTotal,
          completionTokensTotal,
        });
      }
    }

    await updateAnalysisJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      progressCurrent: contactIds.length,
      resultAnalyzed: analyzed,
      resultHighPriority: highPriority,
      resultMediumPriority: mediumPriority,
      resultLowPriority: lowPriority,
      resultNeedsReview: needsReview,
      resultErrors: errors,
      promptTokensTotal,
      completionTokensTotal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateAnalysisJob(jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message.substring(0, 500),
    });
  } finally {
    if (rows[0]) runningBatchJobs.delete(rows[0].importJobId);
  }
}

export async function getProspectIntelligenceJob(jobId: string): Promise<ProspectIntelligenceJobSummary | null> {
  const rows = await db
    .select()
    .from(prospectIntelligenceJobs)
    .where(eq(prospectIntelligenceJobs.id, jobId))
    .limit(1);
  if (!rows[0]) return null;
  return enrichJobSummary(mapAnalysisJobSummary(rows[0]));
}

function prioritySortValue(priority?: string | null): number {
  switch (priority) {
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "needs_review":
      return 1;
    default:
      return 0;
  }
}

export async function listProspectIntelligence(
  filters: ProspectIntelligenceListFilters = {},
  workspaceUserId: string,
): Promise<ProspectIntelligenceListItem[]> {
  if (!workspaceUserId) throw new Error("workspaceUserId is required");
  const contacts = await storage.getContacts(workspaceUserId, 50000);
  const importedContacts = contacts.filter(isInternalImportedProspect);
  const contactMap = new Map(importedContacts.map((c) => [c.id, c]));

  const rows = await db.select().from(prospectIntelligence);
  const items: ProspectIntelligenceListItem[] = [];

  // Resolve unified batch filter → discoverySearchId / importJobId.
  const batchRef = parseProspectReviewBatchKey(filters.reviewBatchKey);
  let filterDiscoverySearchId =
    batchRef.kind === "discovery"
      ? batchRef.id
      : String(filters.discoverySearchId || "").trim() || null;
  let filterImportJobId =
    batchRef.kind === "import"
      ? batchRef.id
      : String(filters.importJobId || "").trim() || null;
  if (batchRef.kind === "all" && filters.reviewBatchKey === "all") {
    filterDiscoverySearchId = null;
    filterImportJobId = null;
  }

  // Fallback membership via discovery_results.contact_id when meta is missing.
  const discoveryContactIds = new Set<string>();
  if (filterDiscoverySearchId) {
    try {
      const linked = await db
        .select({ contactId: prospectAiDiscoveryResults.contactId })
        .from(prospectAiDiscoveryResults)
        .where(
          and(
            eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
            eq(prospectAiDiscoveryResults.searchId, filterDiscoverySearchId),
            isNotNull(prospectAiDiscoveryResults.contactId),
          ),
        );
      for (const r of linked) {
        const id = String(r.contactId || "").trim();
        if (id) discoveryContactIds.add(id);
      }
    } catch {
      /* table may be absent in older envs */
    }
  }

  // Queue + outcome lookup for Review lifecycle filters (presentation only).
  let queuedContactIds = new Set<string>();
  let failedContactIds = new Set<string>();
  const queueStatusByContact = new Map<string, string>();
  const outcomeByContact = new Map<string, string>();
  {
    const { prospectOutreachQueueItems, prospectAiOutcomes } = await import("@shared/schema");
    const qRows = await db
      .select({
        contactId: prospectOutreachQueueItems.contactId,
        status: prospectOutreachQueueItems.queueStatus,
      })
      .from(prospectOutreachQueueItems)
      .where(eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId));
    for (const r of qRows) {
      const st = String(r.status || "");
      // Prefer active queue states over terminal ones when multiple rows exist.
      const prev = queueStatusByContact.get(r.contactId);
      if (
        !prev ||
        ["queued", "sending", "paused"].includes(st) ||
        (!["queued", "sending", "paused"].includes(prev) && st)
      ) {
        queueStatusByContact.set(r.contactId, st);
      }
    }
    queuedContactIds = new Set(
      [...queueStatusByContact.entries()]
        .filter(([, st]) => ["queued", "sending", "paused"].includes(st))
        .map(([id]) => id),
    );
    failedContactIds = new Set(
      [...queueStatusByContact.entries()].filter(([, st]) => st === "failed").map(([id]) => id),
    );
    try {
      const oRows = await db
        .select({
          contactId: prospectAiOutcomes.contactId,
          outcome: prospectAiOutcomes.prospectOutcome,
        })
        .from(prospectAiOutcomes)
        .where(eq(prospectAiOutcomes.workspaceUserId, workspaceUserId));
      for (const r of oRows) {
        outcomeByContact.set(r.contactId, String(r.outcome || ""));
      }
    } catch {
      /* outcomes table may be absent until migration — ignore */
    }
  }

  let connections: Awaited<
    ReturnType<typeof import("./prospectOutreachEligibilityService").loadWorkspaceChannelConnections>
  > | null = null;
  if (filters.emailEligible || filters.anyEligibleChannel) {
    const { loadWorkspaceChannelConnections } = await import(
      "./prospectOutreachEligibilityService"
    );
    connections = await loadWorkspaceChannelConnections(workspaceUserId);
  }

  // Shared prior-outreach truth (same detectPrior path as Send preview) for Qualified / Campaign ✓.
  const { batchLoadPriorOutreachFlags } = await import("./prospectOutreachEligibilityService");
  const candidateContactIds = rows
    .map((r) => r.contactId)
    .filter((id) => contactMap.has(id));
  const priorByContact = await batchLoadPriorOutreachFlags(candidateContactIds);

  const lifecycleFilter = String(filters.lifecycle || "active")
    .trim()
    .toLowerCase();

  for (const row of rows) {
    const contact = contactMap.get(row.contactId);
    if (!contact) continue;

    const rowLifecycle = String(
      (row as { lifecycleStatus?: string | null }).lifecycleStatus || "active",
    )
      .trim()
      .toLowerCase();
    if (lifecycleFilter !== "all") {
      if (lifecycleFilter === "active") {
        if (rowLifecycle !== "active") continue;
      } else if (rowLifecycle !== lifecycleFilter) {
        continue;
      }
    }

    if (filterImportJobId) {
      const metaImportId = readContactImportJobIdFromMeta(contact);
      const rowImportId = String(row.importJobId || "").trim() || null;
      if (rowImportId !== filterImportJobId && metaImportId !== filterImportJobId) continue;
    }

    if (filterDiscoverySearchId) {
      const metaSearchId = readContactDiscoverySearchId(contact);
      const linked = discoveryContactIds.has(row.contactId);
      if (metaSearchId !== filterDiscoverySearchId && !linked) continue;
    }

    if (filters.priority && row.priority !== filters.priority) continue;
    if (filters.businessType && row.businessType !== filters.businessType) continue;
    if (filters.recommendedOffer && row.recommendedOffer !== filters.recommendedOffer) continue;
    if (filters.needsReviewOnly && !row.needsReview) continue;

    if (filters.segment === "agency" && (row.agencyLikelihood ?? 0) < 40) continue;
    if (filters.segment === "shopify" && (row.shopifyMerchantLikelihood ?? 0) < 40) continue;
    if (filters.segment === "real_estate" && (row.realEstateLikelihood ?? 0) < 40) continue;
    if (filters.segment === "local_business" && (row.localBusinessLikelihood ?? 0) < 40) continue;
    if (filters.segment === "saas" && (row.saasLikelihood ?? 0) < 40) continue;
    if (filters.segment === "affiliate" && row.recommendedOffer !== "partner_program") continue;

    if (filters.hasEmail === true) {
      const { isValidProspectEmail } = await import("@shared/prospectContactEnrichment");
      if (!isValidProspectEmail(contact.email)) continue;
    }
    if (filters.missingEmail === true) {
      const { isValidProspectEmail } = await import("@shared/prospectContactEnrichment");
      if (isValidProspectEmail(contact.email)) continue;
    }
    if (filters.hasPhone === true) {
      const { isValidProspectPhone } = await import("@shared/prospectContactEnrichment");
      if (!isValidProspectPhone(contact.phone)) continue;
    }
    if (filters.missingPhone === true) {
      const { isValidProspectPhone } = await import("@shared/prospectContactEnrichment");
      if (isValidProspectPhone(contact.phone)) continue;
    }
    if (filters.missingWebsite === true) {
      const site = resolveProspectWebsiteUrl(contact);
      if (site) continue;
    }

    if (filters.statusFilter) {
      const review = String(row.reviewStatus || "pending").toLowerCase();
      const outreach = String(row.outreachStatus || "not_sent").toLowerCase();
      switch (filters.statusFilter) {
        case "pending":
          if (review !== "pending" || outreach !== "not_sent") continue;
          if (queuedContactIds.has(row.contactId)) continue;
          break;
        case "needs_review":
          if (review !== "needs_review" && !row.needsReview) continue;
          break;
        case "approved":
          if (review !== "approved" || outreach !== "not_sent") continue;
          if (queuedContactIds.has(row.contactId)) continue;
          break;
        case "queued":
          if (!queuedContactIds.has(row.contactId)) continue;
          break;
        case "outreach_sent":
          if (outreach !== "outreach_sent") continue;
          break;
        case "replied":
          if (outreach !== "replied") continue;
          break;
        case "failed":
          if (!failedContactIds.has(row.contactId)) continue;
          break;
      }
    }

    if ((filters.emailEligible || filters.anyEligibleChannel) && connections) {
      const { resolveProspectOutreachEligibility } = await import(
        "@shared/prospectOutreachEligibility"
      );
      // Filter for channel capability (ignore approve/queue lifecycle for listing).
      const raw = resolveProspectOutreachEligibility({
        email: contact.email,
        phone: contact.phone,
        whatsappId: contact.whatsappId,
        facebookId: contact.facebookId,
        instagramId: contact.instagramId,
        emailConnected: connections.emailConnected,
        smsConnected: connections.smsConnected,
        whatsappConnected: connections.whatsappConnected,
        facebookConnected: connections.facebookConnected,
        instagramConnected: connections.instagramConnected,
        reviewStatus: "approved",
        outreachStatus: "not_sent",
        analysisStatus: "completed",
        preferredChannel: filters.emailEligible ? "email" : "auto",
      });
      if (filters.emailEligible && !raw.channels.email.eligible) continue;
      if (filters.anyEligibleChannel && !raw.anyEligible) continue;
    }

    const meta = readProspectImportMetadata(contact);
    const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
    const cf = (contact.customFields || {}) as Record<string, unknown>;
    const pai = (sd.prospectAi || cf.prospectAi) as Record<string, unknown> | undefined;
    const sourceLabel =
      String(pai?.sourceLabel || "").trim() ||
      (String(sd.prospectImportProvider || "").trim() === "prospect_ai"
        ? "Google Places discovery"
        : meta?.batchName) ||
      null;
    const discoveryAttentionReason =
      pai?.attentionReason != null && String(pai.attentionReason).trim()
        ? String(pai.attentionReason).trim()
        : null;
    const prior = priorByContact.get(contact.id);
    items.push({
      contactId: contact.id,
      name: contact.name,
      company: row.companyName ?? meta?.batchName ?? null,
      email: contact.email,
      phone: contact.phone,
      websiteUrl: resolveProspectWebsiteUrl(contact),
      importTag: contact.tag,
      batchName: meta?.batchName ?? null,
      importReason: meta?.importReason ?? null,
      pipelineStage: contact.pipelineStage,
      sourceLabel,
      queueStatus: queueStatusByContact.get(contact.id) || null,
      prospectOutcome: outcomeByContact.get(contact.id) || null,
      priorOutreachDetected: prior?.priorOutreachDetected === true,
      discoveryAttentionReason,
      intelligence: mapIntelligenceRow(row),
    });
  }

  const sortBy = filters.sortBy ?? "action";
  const sortDir = filters.sortDir ?? "desc";
  const { compareProspectReviewActionOrder } = await import("@shared/prospectReviewSort");
  items.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "priority":
        cmp = prioritySortValue(a.intelligence.priority) - prioritySortValue(b.intelligence.priority);
        break;
      case "confidence":
        cmp = (a.intelligence.confidence ?? 0) - (b.intelligence.confidence ?? 0);
        break;
      case "createdAt": {
        const at = a.intelligence.createdAt ? Date.parse(a.intelligence.createdAt) : 0;
        const bt = b.intelligence.createdAt ? Date.parse(b.intelligence.createdAt) : 0;
        cmp = at - bt;
        break;
      }
      case "action": {
        // Work queue: analyzing / pending / failed / needs review first; newest within rank.
        // Rank order is always ascending regardless of sortDir.
        return compareProspectReviewActionOrder(
          {
            analysisStatus: a.intelligence.analysisStatus,
            reviewStatus: a.intelligence.reviewStatus,
            outreachStatus: a.intelligence.outreachStatus,
            needsReview: a.intelligence.needsReview,
            createdAt: a.intelligence.createdAt,
            updatedAt: a.intelligence.updatedAt,
          },
          {
            analysisStatus: b.intelligence.analysisStatus,
            reviewStatus: b.intelligence.reviewStatus,
            outreachStatus: b.intelligence.outreachStatus,
            needsReview: b.intelligence.needsReview,
            createdAt: b.intelligence.createdAt,
            updatedAt: b.intelligence.updatedAt,
          },
        );
      }
      default:
        cmp = (a.intelligence.leadScore ?? 0) - (b.intelligence.leadScore ?? 0);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  return items.slice(0, limit);
}

export async function getProspectIntelligenceDetail(
  contactId: string,
  workspaceUserId: string,
): Promise<ProspectIntelligenceListItem | null> {
  const contact = await storage.getContact(contactId);
  if (!contact || contact.userId !== workspaceUserId || !isInternalImportedProspect(contact)) {
    return null;
  }

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (!rows[0]) return null;

  const meta = readProspectImportMetadata(contact);
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const pai = (sd.prospectAi || cf.prospectAi) as Record<string, unknown> | undefined;
  const sourceLabel =
    String(pai?.sourceLabel || "").trim() ||
    (String(sd.prospectImportProvider || "").trim() === "prospect_ai"
      ? "Google Places discovery"
      : meta?.batchName) ||
    null;

  let queueStatus: string | null = null;
  let prospectOutcome: string | null = null;
  try {
    const { prospectOutreachQueueItems, prospectAiOutcomes } = await import("@shared/schema");
    const qRows = await db
      .select({ status: prospectOutreachQueueItems.queueStatus })
      .from(prospectOutreachQueueItems)
      .where(
        and(
          eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId),
          eq(prospectOutreachQueueItems.contactId, contactId),
        ),
      )
      .limit(5);
    for (const r of qRows) {
      const st = String(r.status || "");
      if (["queued", "sending", "paused"].includes(st)) {
        queueStatus = st;
        break;
      }
      if (!queueStatus) queueStatus = st || null;
    }
    const oRows = await db
      .select({ outcome: prospectAiOutcomes.prospectOutcome })
      .from(prospectAiOutcomes)
      .where(
        and(
          eq(prospectAiOutcomes.workspaceUserId, workspaceUserId),
          eq(prospectAiOutcomes.contactId, contactId),
        ),
      )
      .limit(1);
    prospectOutcome = oRows[0]?.outcome ? String(oRows[0].outcome) : null;
  } catch {
    /* optional presentation fields */
  }

  const { batchLoadPriorOutreachFlags } = await import("./prospectOutreachEligibilityService");
  const priorMap = await batchLoadPriorOutreachFlags([contactId]);
  const prior = priorMap.get(contactId);

  const discoveryAttentionReason =
    pai?.attentionReason != null && String(pai.attentionReason).trim()
      ? String(pai.attentionReason).trim()
      : null;

  return {
    contactId: contact.id,
    name: contact.name,
    company: rows[0].companyName ?? null,
    email: contact.email,
    phone: contact.phone,
    websiteUrl: resolveProspectWebsiteUrl(contact),
    importTag: contact.tag,
    batchName: meta?.batchName ?? null,
    importReason: meta?.importReason ?? null,
    pipelineStage: contact.pipelineStage,
    sourceLabel,
    queueStatus,
    prospectOutcome,
    priorOutreachDetected: prior?.priorOutreachDetected === true,
    discoveryAttentionReason,
    intelligence: mapIntelligenceRow(rows[0]),
  };
}

export async function getProspectIntelligenceDashboardCounts(
  workspaceUserId: string,
): Promise<ProspectIntelligenceDashboardCounts> {
  const items = await listProspectIntelligence({ limit: 1000 }, workspaceUserId);
  let highPriority = 0;
  let mediumPriority = 0;
  let lowPriority = 0;
  let needsReview = 0;
  let aiReviewed = 0;

  for (const item of items) {
    const row = item.intelligence;
    const status = String(row.analysisStatus || "");
    if (status === "completed" || status === "needs_review") aiReviewed += 1;
    if (row.priority === "high") highPriority += 1;
    else if (row.priority === "medium") mediumPriority += 1;
    else if (row.priority === "low") lowPriority += 1;
    else needsReview += 1;
  }

  return {
    aiReviewed,
    highPriority,
    mediumPriority,
    lowPriority,
    needsReview,
  };
}

export async function approveProspectIntelligence(
  contactId: string,
  userId: string,
  opts?: {
    suggestedFirstMessage?: string;
    suggestedOutreachSubject?: string;
    workspaceUserId?: string;
  },
): Promise<ProspectIntelligenceListItem | null> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (opts?.workspaceUserId) assertContactInWorkspace(contact, opts.workspaceUserId);
  assertInternalImportedProspect(contact);

  const existingForApprove = await db
    .select({
      priority: prospectIntelligence.priority,
      analysisStatus: prospectIntelligence.analysisStatus,
      leadScore: prospectIntelligence.leadScore,
    })
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  const messagePatch: Partial<typeof prospectIntelligence.$inferInsert> = {
    reviewStatus: "approved",
    approvedAt: new Date(),
    approvedByUserId: userId,
    updatedAt: new Date(),
    ...buildQualifiedPresentationClearPatch({
      priority: existingForApprove[0]?.priority,
      analysisStatus: existingForApprove[0]?.analysisStatus,
      leadScore: existingForApprove[0]?.leadScore,
    }),
  };
  // Approval retains the current edited outreach draft when provided (Save message not required).
  if (opts?.suggestedFirstMessage !== undefined) {
    messagePatch.suggestedFirstMessage = opts.suggestedFirstMessage;
  }
  if (opts?.suggestedOutreachSubject !== undefined) {
    messagePatch.suggestedOutreachSubject = opts.suggestedOutreachSubject;
  }

  await db
    .update(prospectIntelligence)
    .set(messagePatch)
    .where(eq(prospectIntelligence.contactId, contactId));

  // Phase 2: start website enrichment only after human approval (async — never on discover).
  try {
    const { enqueueProspectEnrichment } = await import("./prospectEnrichmentService");
    const latest = await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, contactId))
      .limit(1);
    const status = String(latest[0]?.enrichmentStatus || "none").toLowerCase();
    const emailFound =
      latest[0]?.enrichmentEmailFound === true ||
      Boolean(String(contact.email || "").includes("@"));
    const forceRetry =
      status === "failed" || (status === "completed" && !emailFound);
    await enqueueProspectEnrichment({
      contactId,
      workspaceUserId: opts?.workspaceUserId || contact.userId,
      initiatedByUserId: userId,
      trigger: "approve",
      force: forceRetry,
    });
  } catch (err) {
    console.error(
      "[ProspectEnrichment] enqueue after approve failed:",
      err instanceof Error ? err.message : err,
    );
  }

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (rows[0]) {
    const intel = mapIntelligenceRow(rows[0]);
    await syncContactIntelligence(contact, { ...intel, reviewStatus: "approved", needsReview: false }, rows[0].importJobId);
  }
  return getProspectIntelligenceDetail(contactId, opts?.workspaceUserId || contact.userId);
}

export async function markProspectNeedsReview(
  contactId: string,
  workspaceUserId?: string,
): Promise<void> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (workspaceUserId) assertContactInWorkspace(contact, workspaceUserId);
  assertInternalImportedProspect(contact);

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (!rows[0]) throw new Error("Prospect intelligence not found");

  const clearNotAFit = String(rows[0].recommendedOffer || "").toLowerCase() === "not_a_fit";

  await db
    .update(prospectIntelligence)
    .set({
      reviewStatus: "needs_review",
      needsReview: true,
      priority: "needs_review",
      ...(clearNotAFit ? { recommendedOffer: "general_demo" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(prospectIntelligence.contactId, contactId));

  const updated = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (updated[0]) {
    const intel = mapIntelligenceRow(updated[0]);
    await syncContactIntelligence(contact, intel, updated[0].importJobId);
  }
}

export type ProspectQualificationDecision = "qualified" | "needs_review" | "not_qualified";

/**
 * Manual human qualification override — does not re-run AI, does not enqueue enrichment,
 * does not consume discovery quota. Preserves contact email/website.
 */
export async function setProspectQualificationDecision(
  contactId: string,
  decision: ProspectQualificationDecision,
  opts?: { userId?: string; workspaceUserId?: string },
): Promise<ProspectIntelligenceListItem | null> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (opts?.workspaceUserId) assertContactInWorkspace(contact, opts.workspaceUserId);
  assertInternalImportedProspect(contact);

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (!rows[0]) throw new Error("Prospect intelligence not found");

  const currentOffer = String(rows[0].recommendedOffer || "").trim();
  const clearNotAFit = currentOffer.toLowerCase() === "not_a_fit";
  const dbPatch: Partial<typeof prospectIntelligence.$inferInsert> = { updatedAt: new Date() };
  const existingRaw =
    rows[0].rawResult && typeof rows[0].rawResult === "object"
      ? (rows[0].rawResult as Record<string, unknown>)
      : {};

  if (decision === "qualified") {
    dbPatch.reviewStatus = "approved";
    dbPatch.approvedAt = new Date();
    if (opts?.userId) dbPatch.approvedByUserId = opts.userId;
    if (clearNotAFit) dbPatch.recommendedOffer = "general_demo";
    Object.assign(
      dbPatch,
      buildQualifiedPresentationClearPatch({
        priority: rows[0].priority,
        analysisStatus: rows[0].analysisStatus,
        leadScore: rows[0].leadScore,
      }),
    );
    dbPatch.rawResult = buildQualificationSourcePatch("manual", existingRaw);
  } else if (decision === "needs_review") {
    dbPatch.reviewStatus = "needs_review";
    dbPatch.needsReview = true;
    dbPatch.priority = "needs_review";
    if (clearNotAFit) dbPatch.recommendedOffer = "general_demo";
    // Needs Review supersedes prior approval evidence for filter purposes.
    dbPatch.approvedAt = null;
    dbPatch.approvedByUserId = null;
    dbPatch.rawResult = buildQualificationSourcePatch("manual_needs_review", existingRaw);
  } else {
    // Latest human rejection — clear approval evidence so AI not_a_fit alone isn't confused
    // with an older Approve that was later overridden.
    dbPatch.recommendedOffer = "not_a_fit";
    dbPatch.needsReview = false;
    dbPatch.reviewStatus = "pending";
    dbPatch.approvedAt = null;
    dbPatch.approvedByUserId = null;
    dbPatch.rawResult = buildQualificationSourcePatch("manual_not_qualified", existingRaw);
  }

  await db
    .update(prospectIntelligence)
    .set(dbPatch)
    .where(eq(prospectIntelligence.contactId, contactId));

  const detail = await getProspectIntelligenceDetail(
    contactId,
    opts?.workspaceUserId || contact.userId,
  );
  if (detail && contact) {
    await syncContactIntelligence(contact, detail.intelligence, rows[0].importJobId);
  }
  return detail;
}

export async function patchProspectIntelligence(
  contactId: string,
  patch: Partial<
    Pick<
      ProspectIntelligence,
      | "suggestedFirstMessage"
      | "suggestedOutreachSubject"
      | "suggestedOutreachAngle"
      | "reasoningSummary"
      | "recommendedOffer"
    >
  >,
  workspaceUserId?: string,
): Promise<ProspectIntelligenceListItem | null> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (workspaceUserId) assertContactInWorkspace(contact, workspaceUserId);
  assertInternalImportedProspect(contact);

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (!rows[0]) throw new Error("Prospect intelligence not found");

  const dbPatch: Partial<typeof prospectIntelligence.$inferInsert> = { updatedAt: new Date() };
  if (patch.suggestedFirstMessage !== undefined) {
    dbPatch.suggestedFirstMessage = patch.suggestedFirstMessage;
  }
  if (patch.suggestedOutreachSubject !== undefined) {
    dbPatch.suggestedOutreachSubject = String(patch.suggestedOutreachSubject || "").slice(0, 200);
  }
  if (patch.suggestedOutreachAngle !== undefined) {
    dbPatch.suggestedOutreachAngle = patch.suggestedOutreachAngle;
  }
  if (patch.reasoningSummary !== undefined) {
    dbPatch.reasoningSummary = patch.reasoningSummary;
  }
  if (patch.recommendedOffer !== undefined) {
    const offer = String(patch.recommendedOffer || "").trim();
    dbPatch.recommendedOffer = offer || null;
  }

  await db.update(prospectIntelligence).set(dbPatch).where(eq(prospectIntelligence.contactId, contactId));

  const detail = await getProspectIntelligenceDetail(contactId, workspaceUserId || contact.userId);
  if (detail && contact) {
    await syncContactIntelligence(contact, detail.intelligence, null);
  }
  return detail;
}

/**
 * User Retry Qualification / Re-run Analysis — enqueue the same durable bulk worker path.
 * - failed → Retry AI Review (canonical bulk retry)
 * - completed/needs_review → requires deliberateRerun (Re-run Analysis)
 * Does not run AI inline.
 */
export async function reanalyzeProspectContact(
  contactId: string,
  workspaceUserId?: string,
  opts?: { deliberateRerun?: boolean },
): Promise<ProspectIntelligence> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (workspaceUserId) assertContactInWorkspace(contact, workspaceUserId);

  const wid = workspaceUserId || contact.userId;
  const { enqueueBulkRetryAiReview, enqueueBulkRerunAiReview } = await import(
    "./prospectBulkAnalysisService"
  );

  const existing = await db
    .select({
      analysisStatus: prospectIntelligence.analysisStatus,
      rawResult: prospectIntelligence.rawResult,
    })
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  const status = String(existing[0]?.analysisStatus || "").toLowerCase();

  if (status === "failed") {
    await enqueueBulkRetryAiReview({
      contactIds: [contactId],
      initiatedByUserId: wid,
      workspaceUserId: wid,
      selectionMode: "selected",
    });
  } else if (isProspectAiReviewUsableSuccess(status)) {
    if (!opts?.deliberateRerun) {
      throw new Error(
        "This prospect already has a completed AI Review. Use Re-run Analysis to replace it.",
      );
    }
    await enqueueBulkRerunAiReview({
      contactIds: [contactId],
      initiatedByUserId: wid,
      workspaceUserId: wid,
      selectionMode: "selected",
      deliberateRerun: true,
    });
  } else if (status === "processing") {
    throw new Error("AI Review is already in progress for this prospect.");
  } else {
    await enqueueBulkRerunAiReview({
      contactIds: [contactId],
      initiatedByUserId: wid,
      workspaceUserId: wid,
      selectionMode: "selected",
      deliberateRerun: false,
    });
  }

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (!rows[0]) throw new Error("Prospect intelligence not found after requeue");
  return mapIntelligenceRow(rows[0]);
}

/**
 * Link real prior outbound history onto PI without fabricating approval.
 * Safe when reviewStatus is needs_review / pending:
 * - fills missing conversationId / messageId / outreachSentAt when evidence exists
 * - only advances outreachStatus → outreach_sent when review is already approved
 * Never changes reviewStatus / needsReview / approvedAt.
 */
export async function linkProspectPriorOutreachHistory(params: {
  contactId: string;
  conversationId: string;
  messageId?: string | null;
  source?: string;
}): Promise<{ updated: boolean; reason: string; outreachStatus?: string }> {
  const { contactId, conversationId } = params;
  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return { updated: false, reason: "no_pi_record" };
  }

  let messageId = params.messageId || null;
  if (!messageId && !row.outreachMessageId) {
    const { messages } = await import("@shared/schema");
    const outs = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.direction, "outbound")))
      .limit(1);
    messageId = outs[0]?.id || null;
  }

  const patch: Partial<typeof prospectIntelligence.$inferInsert> = {
    updatedAt: new Date(),
  };
  let changed = false;

  if (!row.outreachConversationId && conversationId) {
    patch.outreachConversationId = conversationId;
    changed = true;
  }
  if (!row.outreachMessageId && messageId) {
    patch.outreachMessageId = messageId;
    changed = true;
  }
  if (!row.outreachSentAt) {
    patch.outreachSentAt = new Date();
    changed = true;
  }

  const review = String(row.reviewStatus || "").toLowerCase();
  const outreach = String(row.outreachStatus || "").toLowerCase();
  if (review === "approved" && outreach === "not_sent") {
    patch.outreachStatus = "outreach_sent";
    changed = true;
  }

  if (!changed) {
    return {
      updated: false,
      reason: "already_linked",
      outreachStatus: row.outreachStatus,
    };
  }

  await db.update(prospectIntelligence).set(patch).where(eq(prospectIntelligence.contactId, contactId));

  console.info(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: "prior_outreach_linked",
      contactId,
      conversationId,
      messageId: messageId || row.outreachMessageId || null,
      outreachStatus: patch.outreachStatus || row.outreachStatus,
      reviewStatus: row.reviewStatus,
      source: params.source || "prior_outreach_link",
    }),
  );

  return {
    updated: true,
    reason: "prior_outreach_linked",
    outreachStatus: String(patch.outreachStatus || row.outreachStatus),
  };
}

/**
 * Mark outreach_sent only after a successful native email send (Gmail API success).
 * Links the exact conversationId for reply matching. Idempotent.
 */
export async function markProspectOutreachSent(params: {
  contactId: string;
  conversationId: string;
  messageId?: string | null;
  source?: string;
}): Promise<{ updated: boolean; reason: string; outreachStatus?: string }> {
  const { contactId, conversationId, messageId } = params;
  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    console.info(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "send_succeeded",
        reason: "no_pi_record",
        contactId,
        conversationId,
      }),
    );
    return { updated: false, reason: "no_pi_record" };
  }

  const { nextOutreachStatusAfterSend, shouldPersistFirstOutreachSentAt } = await import(
    "@shared/prospectOutreachLifecycle"
  );
  const next = nextOutreachStatusAfterSend({
    reviewStatus: row.reviewStatus,
    outreachStatus: row.outreachStatus,
    outreachSentAt: row.outreachSentAt,
    repliedAt: row.repliedAt,
  });
  if (!next) {
    console.info(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "send_succeeded",
        reason: "lifecycle_not_eligible",
        contactId,
        conversationId,
        reviewStatus: row.reviewStatus,
        outreachStatus: row.outreachStatus,
      }),
    );
    return { updated: false, reason: "lifecycle_not_eligible", outreachStatus: row.outreachStatus };
  }

  // Idempotent: already sent/replied — keep original conversation link, but heal
  // missing outreachConversationId / messageId (Max Zuz–style inbox hide leak).
  if (row.outreachStatus === "outreach_sent" || row.outreachStatus === "replied") {
    const heal: Partial<typeof prospectIntelligence.$inferInsert> = {};
    if (!row.outreachConversationId && conversationId) {
      heal.outreachConversationId = conversationId;
    }
    if (messageId && !row.outreachMessageId) {
      heal.outreachMessageId = messageId;
    }
    if (Object.keys(heal).length > 0) {
      heal.updatedAt = new Date();
      await db
        .update(prospectIntelligence)
        .set(heal)
        .where(eq(prospectIntelligence.contactId, contactId));
      console.info(
        JSON.stringify({
          tag: "[ProspectOutreachLifecycle]",
          event: "outreach_marked_sent",
          reason: "idempotent_healed_linkage",
          contactId,
          conversationId: heal.outreachConversationId || row.outreachConversationId || conversationId,
          messageId: heal.outreachMessageId || row.outreachMessageId || messageId || null,
          outreachStatus: row.outreachStatus,
        }),
      );
      return {
        updated: true,
        reason: "idempotent_healed_linkage",
        outreachStatus: row.outreachStatus,
      };
    }
    console.info(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "outreach_marked_sent",
        reason: "idempotent_already_sent",
        contactId,
        conversationId: row.outreachConversationId || conversationId,
        outreachStatus: row.outreachStatus,
      }),
    );
    return {
      updated: false,
      reason: "idempotent_already_sent",
      outreachStatus: row.outreachStatus,
    };
  }

  const persistSentAt = shouldPersistFirstOutreachSentAt({
    outreachStatus: row.outreachStatus,
    outreachSentAt: row.outreachSentAt,
    repliedAt: row.repliedAt,
  });

  const patch: Partial<typeof prospectIntelligence.$inferInsert> = {
    outreachStatus: next,
    outreachConversationId: conversationId,
    updatedAt: new Date(),
  };
  if (persistSentAt || !row.outreachSentAt) {
    patch.outreachSentAt = new Date();
  }
  if (messageId && !row.outreachMessageId) {
    patch.outreachMessageId = messageId;
  }

  await db.update(prospectIntelligence).set(patch).where(eq(prospectIntelligence.contactId, contactId));

  console.info(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: "outreach_marked_sent",
      contactId,
      conversationId,
      messageId: messageId || null,
      outreachStatus: next,
      source: params.source || "email_send",
    }),
  );

  return { updated: true, reason: "outreach_marked_sent", outreachStatus: next };
}

/**
 * Mark replied only when inbound arrives on the exact linked outreach conversationId.
 */
export async function markProspectOutreachReplied(params: {
  conversationId: string;
  contactId?: string | null;
  fromEmail?: string | null;
  subject?: string | null;
  isCalendarOrInvite?: boolean;
  direction: string;
}): Promise<{ updated: boolean; reason: string }> {
  const { shouldMarkOutreachReplied } = await import("@shared/prospectOutreachLifecycle");

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.outreachConversationId, params.conversationId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    console.info(
      JSON.stringify({
        tag: "[ProspectOutreachLifecycle]",
        event: "inbound_checked",
        reason: "no_linked_pi",
        conversationId: params.conversationId,
      }),
    );
    return { updated: false, reason: "no_linked_pi" };
  }

  const decision = shouldMarkOutreachReplied({
    direction: params.direction,
    conversationId: params.conversationId,
    linkedOutreachConversationId: row.outreachConversationId,
    outreachStatus: row.outreachStatus,
    outreachSentAt: row.outreachSentAt,
    repliedAt: row.repliedAt,
    fromEmail: params.fromEmail,
    subject: params.subject,
    isCalendarOrInvite: params.isCalendarOrInvite,
  });

  console.info(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: decision.mark ? "reply_matched" : "reply_ignored",
      reason: decision.reason,
      contactId: row.contactId,
      conversationId: params.conversationId,
      outreachStatus: row.outreachStatus,
    }),
  );

  if (!decision.mark) {
    return { updated: false, reason: decision.reason };
  }

  if (row.outreachStatus === "replied" && row.repliedAt) {
    return { updated: false, reason: "already_replied" };
  }

  await db
    .update(prospectIntelligence)
    .set({
      outreachStatus: "replied",
      repliedAt: row.repliedAt || new Date(),
      updatedAt: new Date(),
    })
    .where(eq(prospectIntelligence.contactId, row.contactId));

  console.info(
    JSON.stringify({
      tag: "[ProspectOutreachLifecycle]",
      event: "outreach_marked_replied",
      contactId: row.contactId,
      conversationId: params.conversationId,
    }),
  );

  return { updated: true, reason: "outreach_marked_replied" };
}

/**
 * Safe one-time backfill: link an already-sent outreach conversation when
 * review=approved, outreach not_sent, and exactly one deterministic email
 * conversation matches (outbound-first, subject Idea for …).
 */
export async function reconcileProspectOutreachConversation(params: {
  contactId: string;
  conversationId: string;
  messageId?: string | null;
  dryRun?: boolean;
}): Promise<{ updated: boolean; reason: string }> {
  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const row = rows[0];
  if (!row) return { updated: false, reason: "no_pi_record" };
  if (row.reviewStatus !== "approved") return { updated: false, reason: "not_approved" };
  if (row.outreachStatus === "outreach_sent" || row.outreachStatus === "replied") {
    return { updated: false, reason: "already_sent_or_later" };
  }
  if (params.dryRun) {
    return { updated: false, reason: "dry_run_eligible" };
  }
  return markProspectOutreachSent({
    contactId: params.contactId,
    conversationId: params.conversationId,
    messageId: params.messageId,
    source: "reconcile",
  });
}

/**
 * Batches available for the Review Batch filter.
 * Discovery batches: searches with ≥1 result linked to a contact.
 * Import batches: prospect_import_jobs with ≥1 intelligence row.
 */
export async function listProspectReviewBatches(
  workspaceUserId: string,
): Promise<{ batches: ProspectReviewBatchOption[]; latestDiscoveryKey: string | null }> {
  if (!workspaceUserId) throw new Error("workspaceUserId is required");

  const batches: ProspectReviewBatchOption[] = [];

  try {
    const searches = await db
      .select({
        id: prospectAiDiscoverySearches.id,
        businessType: prospectAiDiscoverySearches.businessType,
        location: prospectAiDiscoverySearches.location,
        radiusKm: prospectAiDiscoverySearches.radiusKm,
        createdAt: prospectAiDiscoverySearches.createdAt,
        resultCount: prospectAiDiscoverySearches.resultCount,
      })
      .from(prospectAiDiscoverySearches)
      .where(eq(prospectAiDiscoverySearches.workspaceUserId, workspaceUserId))
      .orderBy(desc(prospectAiDiscoverySearches.createdAt))
      .limit(40);

    for (const search of searches) {
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(prospectAiDiscoveryResults)
        .where(
          and(
            eq(prospectAiDiscoveryResults.searchId, search.id),
            eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
            isNotNull(prospectAiDiscoveryResults.contactId),
          ),
        );
      const prospectCount = Number(countRow?.total ?? 0);
      if (prospectCount <= 0) continue;
      const createdAt = search.createdAt?.toISOString?.() ?? null;
      const label = formatDiscoveryBatchLabel({
        businessType: search.businessType,
        location: search.location,
        createdAt,
        resultCount: prospectCount,
      });
      const radius =
        search.radiusKm != null && Number.isFinite(Number(search.radiusKm))
          ? `${Number(search.radiusKm)} km`
          : null;
      batches.push({
        key: encodeProspectReviewBatchKey("discovery", search.id),
        kind: "discovery",
        id: search.id,
        label,
        detail: [radius, `${prospectCount} prospect${prospectCount === 1 ? "" : "s"}`]
          .filter(Boolean)
          .join(" · "),
        prospectCount,
        createdAt,
        businessType: search.businessType,
        location: search.location,
        radiusKm: search.radiusKm != null ? Number(search.radiusKm) : null,
        batchName: `Prospect AI: ${search.businessType} in ${search.location}`,
      });
    }
  } catch {
    /* discovery tables may be absent */
  }

  try {
    const jobs = await db
      .select({
        id: prospectImportJobs.id,
        batchName: prospectImportJobs.batchName,
        createdAt: prospectImportJobs.createdAt,
      })
      .from(prospectImportJobs)
      .where(eq(prospectImportJobs.destinationUserId, workspaceUserId))
      .orderBy(desc(prospectImportJobs.createdAt))
      .limit(30);

    for (const job of jobs) {
      const [countRow] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(prospectIntelligence)
        .where(eq(prospectIntelligence.importJobId, job.id));
      const prospectCount = Number(countRow?.total ?? 0);
      if (prospectCount <= 0) continue;
      const createdAt = job.createdAt?.toISOString?.() ?? null;
      batches.push({
        key: encodeProspectReviewBatchKey("import", job.id),
        kind: "import",
        id: job.id,
        label: formatImportBatchLabel({ batchName: job.batchName, createdAt }),
        detail: `${prospectCount} prospect${prospectCount === 1 ? "" : "s"}`,
        prospectCount,
        createdAt,
        batchName: job.batchName,
      });
    }
  } catch {
    /* ignore */
  }

  batches.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });

  const latestDiscovery = batches.find((b) => b.kind === "discovery") || null;
  if (latestDiscovery) latestDiscovery.isLatestDiscovery = true;

  return {
    batches,
    latestDiscoveryKey: latestDiscovery?.key ?? null,
  };
}

export const prospectIntelligenceService = {
  getImportJobContactIds,
  createProspectIntelligenceJob,
  getProspectIntelligenceJob,
  listProspectIntelligence,
  listProspectReviewBatches,
  getProspectIntelligenceDetail,
  getProspectIntelligenceDashboardCounts,
  approveProspectIntelligence,
  markProspectNeedsReview,
  setProspectQualificationDecision,
  patchProspectIntelligence,
  reanalyzeProspectContact,
  analyzeProspectContact,
  claimProspectContactForAnalysis,
  markProspectAnalysisFailed,
  healAbandonedProcessingAnalysis,
  markProspectOutreachSent,
  linkProspectPriorOutreachHistory,
  markProspectOutreachReplied,
  reconcileProspectOutreachConversation,
};

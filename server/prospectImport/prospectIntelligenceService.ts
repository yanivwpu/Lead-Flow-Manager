import { and, desc, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import {
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
  PROSPECT_ANALYSIS_STALE_PROCESSING_MS,
  claimableAnalysisStatuses,
  contactOwnedByActiveBulkLease,
} from "@shared/prospectAnalysisOwnership";
import { db } from "../../drizzle/db";
import { aiProvider } from "../aiProvider";
import { storage } from "../storage";
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

const runningBatchJobs = new Set<string>();
const runningContactAnalysis = new Set<string>();
const ANALYSIS_CONCURRENCY = 1;
const MAX_AI_RETRIES = 2;

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
    reasoningSummary: row.reasoningSummary ?? undefined,
    needsReview: row.needsReview ?? undefined,
    confidence: row.confidence ?? undefined,
    analyzedAt: row.analyzedAt?.toISOString(),
    aiModel: row.aiModel ?? undefined,
    aiVersion: row.aiVersion ?? undefined,
    analysisStatus: (row.analysisStatus as ProspectIntelligence["analysisStatus"]) ?? undefined,
    reviewStatus: (row.reviewStatus as ProspectIntelligence["reviewStatus"]) ?? undefined,
    outreachStatus: (row.outreachStatus as ProspectIntelligence["outreachStatus"]) ?? undefined,
    outreachSentAt: row.outreachSentAt?.toISOString(),
    outreachConversationId: row.outreachConversationId ?? undefined,
    outreachMessageId: row.outreachMessageId ?? undefined,
    repliedAt: row.repliedAt?.toISOString(),
    errorMessage: row.errorMessage ?? undefined,
    createdAt: row.createdAt?.toISOString(),
    enrichmentStatus: row.enrichmentStatus ?? undefined,
    enrichmentProvider: row.enrichmentProvider ?? undefined,
    websiteAnalyzedAt: row.websiteAnalyzedAt?.toISOString(),
    websiteUrlUsed: row.websiteUrlUsed ?? undefined,
    enrichmentEmailFound: row.enrichmentEmailFound ?? undefined,
    enrichmentPhoneFound: row.enrichmentPhoneFound ?? undefined,
    enrichmentResult: (row.enrichmentResult as Record<string, unknown>) ?? undefined,
    enrichmentErrorMessage: row.enrichmentErrorMessage ?? undefined,
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

function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /rate limit|timeout|503|502|429|overloaded/i.test(msg);
}

// #region agent log
type QualDebugStage =
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

function agentQualDebugLog(payload: {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
}): void {
  fetch("http://127.0.0.1:7693/ingest/2f005315-cdf4-402a-a15b-868ee3486ee2", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4bac18" },
    body: JSON.stringify({
      sessionId: "4bac18",
      runId: payload.runId || "pre-fix",
      hypothesisId: payload.hypothesisId,
      location: payload.location,
      message: payload.message,
      data: payload.data || {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

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
  stage: QualDebugStage | string;
  err: unknown;
  hypothesisId?: string;
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
  agentQualDebugLog({
    hypothesisId: params.hypothesisId || "FAIL",
    location: "prospectIntelligenceService.ts:prospect_qualification_failed",
    message: "prospect_qualification_failed",
    data: {
      contactId: params.contactId,
      workspaceId: params.workspaceId || null,
      model: params.model || null,
      stage: params.stage,
      errorName: meta.errorName,
      errorMessage: meta.errorMessage,
      providerStatus: meta.providerStatus ?? null,
      providerCode: meta.providerCode ?? null,
      stack: meta.stack ?? null,
    },
  });
}
// #endregion


export type ProspectAnalysisClaimOutcome =
  | { outcome: "claimed" }
  | { outcome: "already_completed"; row: ProspectIntelligenceRow }
  | { outcome: "already_processing" };

/**
 * Atomically claim a prospect intelligence row for analysis (pending/failed → processing).
 * With force, completed rows may also be claimed for re-analyze.
 * Job creation must never call this — only the worker / analyze entrypoint.
 */
export async function claimProspectContactForAnalysis(params: {
  contactId: string;
  force?: boolean;
  importJobId?: string | null;
  aiModel?: string | null;
}): Promise<ProspectAnalysisClaimOutcome> {
  const existingRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  let existing = existingRows[0];

  if (
    !params.force &&
    existing &&
    existing.analysisStatus === "completed" &&
    existing.aiVersion === PROSPECT_INTELLIGENCE_AI_VERSION &&
    !existing.errorMessage
  ) {
    return { outcome: "already_completed", row: existing };
  }

  if (existing?.analysisStatus === "processing") {
    return { outcome: "already_processing" };
  }

  const now = new Date();
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
        updatedAt: now,
      })
      .onConflictDoNothing({ target: prospectIntelligence.contactId })
      .returning();
    if (inserted[0]) return { outcome: "claimed" };
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
      !params.force &&
      existing &&
      existing.analysisStatus === "completed" &&
      existing.aiVersion === PROSPECT_INTELLIGENCE_AI_VERSION &&
      !existing.errorMessage
    ) {
      return { outcome: "already_completed", row: existing };
    }
  }

  const updated = await db
    .update(prospectIntelligence)
    .set({
      analysisStatus: "processing",
      errorMessage: null,
      updatedAt: now,
      ...(params.aiModel ? { aiModel: params.aiModel } : {}),
      ...(params.importJobId !== undefined
        ? { importJobId: params.importJobId }
        : {}),
    })
    .where(
      and(
        eq(prospectIntelligence.contactId, params.contactId),
        inArray(prospectIntelligence.analysisStatus, claimableAnalysisStatuses(Boolean(params.force))),
      ),
    )
    .returning();

  if (updated.length) return { outcome: "claimed" };

  const again = (
    await db
      .select()
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, params.contactId))
      .limit(1)
  )[0];
  if (
    !params.force &&
    again &&
    again.analysisStatus === "completed" &&
    again.aiVersion === PROSPECT_INTELLIGENCE_AI_VERSION &&
    !again.errorMessage
  ) {
    return { outcome: "already_completed", row: again };
  }
  return { outcome: "already_processing" };
}

/** Clear stuck/failed analysis without overwriting a successful completed row. */
export async function markProspectAnalysisFailed(
  contactId: string,
  reason: string,
): Promise<boolean> {
  const message = reason.substring(0, 500);
  const updated = await db
    .update(prospectIntelligence)
    .set({
      analysisStatus: "failed",
      errorMessage: message,
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

  const healed = await db
    .update(prospectIntelligence)
    .set({
      analysisStatus: "failed",
      errorMessage: "Abandoned stale processing (auto-heal)",
      updatedAt: now,
    })
    .where(
      and(
        inArray(prospectIntelligence.contactId, toHeal),
        eq(prospectIntelligence.analysisStatus, "processing"),
      ),
    )
    .returning({ contactId: prospectIntelligence.contactId });

  if (healed.length) {
    console.info(
      `[ProspectIntelligence] healed ${healed.length} abandoned processing row(s)`,
    );
  }
  return healed.length;
}

export async function analyzeProspectContact(params: {
  contactId: string;
  importJobId?: string | null;
  force?: boolean;
  /**
   * When true, the caller (bulk worker) already atomically claimed this row.
   * Skips the processing guard / re-claim so the owning worker can run AI.
   */
  preClaimed?: boolean;
  completeFn?: AiCompleteFn;
}): Promise<ProspectIntelligence> {
  let stage: QualDebugStage | string = "contact_loaded";
  let model = "";
  let workspaceId: string | null = null;

  if (runningContactAnalysis.has(params.contactId)) {
    const err = new Error("Analysis already in progress for this contact.");
    logProspectQualificationFailed({
      contactId: params.contactId,
      stage: "claim",
      err,
      hypothesisId: "E",
    });
    throw err;
  }

  try {
    const contact = await storage.getContact(params.contactId);
    if (!contact) throw new Error("Contact not found");
    workspaceId = contact.userId;
    // #region agent log
    agentQualDebugLog({
      hypothesisId: "E",
      location: "prospectIntelligenceService.ts:analyzeProspectContact",
      message: "contact_loaded",
      data: {
        contactId: params.contactId,
        workspaceId,
        force: Boolean(params.force),
        preClaimed: Boolean(params.preClaimed),
        source: contact.source,
        pipelineStage: contact.pipelineStage,
      },
    });
    // #endregion
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
    // #region agent log
    agentQualDebugLog({
      hypothesisId: "PRIOR",
      location: "prospectIntelligenceService.ts:prior_error",
      message: "intel_row_loaded",
      data: {
        contactId: params.contactId,
        analysisStatus: priorRows[0]?.analysisStatus ?? null,
        priorErrorMessage: (priorRows[0]?.errorMessage || "").substring(0, 500) || null,
        model,
      },
    });
    // #endregion
    stage = "claim";

    if (!params.preClaimed) {
      const claim = await claimProspectContactForAnalysis({
        contactId: params.contactId,
        force: params.force,
        importJobId,
        aiModel: model,
      });
      // #region agent log
      agentQualDebugLog({
        hypothesisId: "E",
        location: "prospectIntelligenceService.ts:claim",
        message: "claim_result",
        data: { contactId: params.contactId, outcome: claim.outcome },
      });
      // #endregion
      if (claim.outcome === "already_completed") {
        return mapIntelligenceRow(claim.row);
      }
      if (claim.outcome === "already_processing") {
        throw new Error("Analysis already in progress for this contact.");
      }
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
    }

    runningContactAnalysis.add(params.contactId);

    try {
      stage = "prompt_built";
      const input = buildProspectIntelligenceInput(contact);
      // #region agent log
      agentQualDebugLog({
        hypothesisId: "F",
        location: "prospectIntelligenceService.ts:input",
        message: "places_data_normalized",
        data: {
          contactId: params.contactId,
          hasName: Boolean(input.name),
          hasCompany: Boolean(input.company),
          hasWebsite: Boolean(input.websiteUrl),
          hasPhone: Boolean(input.phone),
          hasEmail: Boolean(input.email),
          businessType: input.businessType || null,
          insufficient: hasInsufficientProspectData(input),
        },
      });
      // #endregion

      stage = "workspace_context";
      const workspaceContext = await loadProspectAiWorkspaceContext(contact.userId, {
        contactId: contact.id,
        analysisPath: params.force ? "reanalyze" : "analyze",
      });
      // #region agent log
      agentQualDebugLog({
        hypothesisId: "D",
        location: "prospectIntelligenceService.ts:workspace_context",
        message: "workspace_context_loaded",
        data: {
          contactId: params.contactId,
          configured: workspaceContext.configured,
          hasAiBrain: workspaceContext.hasAiBrain,
          hasBusinessProfile: workspaceContext.hasBusinessProfile,
          aiBrainIsPrimary: workspaceContext.aiBrainIsPrimary,
          fallbackUsed: workspaceContext.fallbackUsed,
        },
      });
      // #endregion

      let intel: ProspectIntelligence;
      let promptTokens = 0;
      let completionTokens = 0;

      if (hasInsufficientProspectData(input)) {
        intel = buildInsufficientDataResult(model, input, workspaceContext);
        // #region agent log
        agentQualDebugLog({
          hypothesisId: "F",
          location: "prospectIntelligenceService.ts:insufficient",
          message: "insufficient_data_path",
          data: { contactId: params.contactId },
        });
        // #endregion
      } else {
        const completeFn = params.completeFn ?? defaultAiComplete;
        const messages = [
          {
            role: "system" as const,
            content:
              "You are Prospect AI, a growth analyst for the current workspace. Prefer AI Brain business intelligence over Business Profile identity when both exist. Output strict JSON only. Never hallucinate unsupported business facts. Never confuse the prospect's industry with what the sender sells.",
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
            // #region agent log
            agentQualDebugLog({
              hypothesisId: "A",
              location: "prospectIntelligenceService.ts:model_call_start",
              message: "model_call_started",
              data: { contactId: params.contactId, model, attempt },
            });
            // #endregion
            const response = await completeFn(messages);
            promptTokens += response.usage?.promptTokens ?? 0;
            completionTokens += response.usage?.completionTokens ?? 0;
            const rawText = response.content || "";
            stage = "model_response";
            // #region agent log
            agentQualDebugLog({
              hypothesisId: "A",
              location: "prospectIntelligenceService.ts:model_response",
              message: "model_response_received",
              data: {
                contactId: params.contactId,
                model,
                attempt,
                contentLength: rawText.length,
                contentPreview: rawText.substring(0, 400),
                startsWithBrace: rawText.trimStart().startsWith("{"),
              },
            });
            // #endregion

            stage = "json_parse";
            const raw = JSON.parse(rawText || "{}");
            // #region agent log
            agentQualDebugLog({
              hypothesisId: "B",
              location: "prospectIntelligenceService.ts:json_parse",
              message: "json_parsed",
              data: {
                contactId: params.contactId,
                keys: raw && typeof raw === "object" ? Object.keys(raw as object).slice(0, 30) : [],
              },
            });
            // #endregion

            stage = "schema_validate";
            parsed = parseAndValidateProspectIntelligence(raw, model, input, workspaceContext);
            // #region agent log
            agentQualDebugLog({
              hypothesisId: "C",
              location: "prospectIntelligenceService.ts:schema_validate",
              message: "schema_validated",
              data: {
                contactId: params.contactId,
                priority: parsed.priority ?? null,
                needsReview: Boolean(parsed.needsReview),
                leadScore: parsed.leadScore ?? null,
              },
            });
            // #endregion
            break;
          } catch (err) {
            lastErr = err;
            const meta = extractProviderErrorMeta(err);
            // #region agent log
            agentQualDebugLog({
              hypothesisId: stage === "model_call_start" ? "A" : stage === "json_parse" ? "B" : "C",
              location: "prospectIntelligenceService.ts:attempt_catch",
              message: "attempt_failed",
              data: {
                contactId: params.contactId,
                stage,
                attempt,
                ...meta,
              },
            });
            // #endregion
            if (!isTransientAiError(err) || attempt === MAX_AI_RETRIES) break;
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }

        if (!parsed) {
          const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
          logProspectQualificationFailed({
            contactId: params.contactId,
            workspaceId,
            model,
            stage,
            err: lastErr ?? new Error(message),
            hypothesisId: stage === "model_call_start" ? "A" : stage === "json_parse" ? "B" : "C",
          });
          await db
            .update(prospectIntelligence)
            .set({
              analysisStatus: "failed",
              errorMessage: message.substring(0, 500),
              updatedAt: new Date(),
            })
            .where(eq(prospectIntelligence.contactId, params.contactId));
          throw new Error(message);
        }
        intel = parsed;
      }

      stage = "db_persist";
      await db
        .update(prospectIntelligence)
        .set({
          ...toDbPatch(intel, {
            importJobId,
            promptTokens,
            completionTokens,
            rawResult: intel as unknown as Record<string, unknown>,
            errorMessage: null,
          }),
        })
        .where(eq(prospectIntelligence.contactId, params.contactId));

      await syncContactIntelligence(contact, intel, importJobId);
      // #region agent log
      agentQualDebugLog({
        hypothesisId: "G",
        location: "prospectIntelligenceService.ts:db_persist",
        message: "completed",
        data: { contactId: params.contactId, analysisStatus: intel.analysisStatus || "completed" },
      });
      // #endregion
      return intel;
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
        hypothesisId: "E",
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

  for (const row of rows) {
    const contact = contactMap.get(row.contactId);
    if (!contact) continue;
    if (filters.importJobId && row.importJobId !== filters.importJobId) continue;
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
    if (filters.hasPhone === true) {
      const { isValidProspectPhone } = await import("@shared/prospectContactEnrichment");
      if (!isValidProspectPhone(contact.phone)) continue;
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
      intelligence: mapIntelligenceRow(row),
    });
  }

  const sortBy = filters.sortBy ?? "action";
  const sortDir = filters.sortDir ?? "desc";
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
        // Reconstruct rank from mapped fields (list items don't carry raw row).
        const rankOf = (item: ProspectIntelligenceListItem): number => {
          const analysis = String(item.intelligence.analysisStatus || "pending").toLowerCase();
          const review = String(item.intelligence.reviewStatus || "pending").toLowerCase();
          const outreach = String(item.intelligence.outreachStatus || "not_sent").toLowerCase();
          if (analysis === "processing") return 0;
          if (analysis === "pending") return 1;
          if (analysis === "failed") return 2;
          if (review === "needs_review" || item.intelligence.needsReview) return 3;
          if (review === "pending" && analysis === "completed") return 4;
          if (review === "approved" && outreach === "not_sent") return 5;
          if (outreach === "outreach_sent") return 6;
          if (outreach === "replied") return 7;
          return 8;
        };
        cmp = rankOf(a) - rankOf(b);
        if (cmp !== 0) return cmp; // action rank always ascending (needs action first)
        const at = a.intelligence.createdAt ? Date.parse(a.intelligence.createdAt) : 0;
        const bt = b.intelligence.createdAt ? Date.parse(b.intelligence.createdAt) : 0;
        return bt - at; // newest first within rank
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
  opts?: { suggestedFirstMessage?: string; workspaceUserId?: string },
): Promise<ProspectIntelligenceListItem | null> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (opts?.workspaceUserId) assertContactInWorkspace(contact, opts.workspaceUserId);
  assertInternalImportedProspect(contact);

  const messagePatch: Partial<typeof prospectIntelligence.$inferInsert> = {
    reviewStatus: "approved",
    needsReview: false,
    approvedAt: new Date(),
    approvedByUserId: userId,
    updatedAt: new Date(),
  };
  // Approval retains the current edited outreach draft when provided (Save message not required).
  if (opts?.suggestedFirstMessage !== undefined) {
    messagePatch.suggestedFirstMessage = opts.suggestedFirstMessage;
  }

  await db
    .update(prospectIntelligence)
    .set(messagePatch)
    .where(eq(prospectIntelligence.contactId, contactId));

  // Phase 2: start website enrichment only after human approval (async — never on discover).
  try {
    const { enqueueProspectEnrichment } = await import("./prospectEnrichmentService");
    await enqueueProspectEnrichment({
      contactId,
      workspaceUserId: opts?.workspaceUserId || contact.userId,
      initiatedByUserId: userId,
      trigger: "approve",
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

  await db
    .update(prospectIntelligence)
    .set({
      reviewStatus: "needs_review",
      needsReview: true,
      priority: "needs_review",
      updatedAt: new Date(),
    })
    .where(eq(prospectIntelligence.contactId, contactId));

  const rows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, contactId))
    .limit(1);
  if (rows[0]) {
    const intel = mapIntelligenceRow(rows[0]);
    await syncContactIntelligence(contact, intel, rows[0].importJobId);
  }
}

export async function patchProspectIntelligence(
  contactId: string,
  patch: Partial<Pick<ProspectIntelligence, "suggestedFirstMessage" | "suggestedOutreachAngle" | "reasoningSummary">>,
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
  if (patch.suggestedOutreachAngle !== undefined) {
    dbPatch.suggestedOutreachAngle = patch.suggestedOutreachAngle;
  }
  if (patch.reasoningSummary !== undefined) {
    dbPatch.reasoningSummary = patch.reasoningSummary;
  }

  await db.update(prospectIntelligence).set(dbPatch).where(eq(prospectIntelligence.contactId, contactId));

  const detail = await getProspectIntelligenceDetail(contactId, workspaceUserId || contact.userId);
  if (detail && contact) {
    await syncContactIntelligence(contact, detail.intelligence, null);
  }
  return detail;
}

export async function reanalyzeProspectContact(
  contactId: string,
  workspaceUserId?: string,
): Promise<ProspectIntelligence> {
  const contact = await storage.getContact(contactId);
  if (!contact) throw new Error("Contact not found");
  if (workspaceUserId) assertContactInWorkspace(contact, workspaceUserId);
  return analyzeProspectContact({ contactId, force: true });
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

  // Idempotent: already sent/replied — keep original conversation link.
  if (row.outreachStatus === "outreach_sent" || row.outreachStatus === "replied") {
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

export const prospectIntelligenceService = {
  getImportJobContactIds,
  createProspectIntelligenceJob,
  getProspectIntelligenceJob,
  listProspectIntelligence,
  getProspectIntelligenceDetail,
  getProspectIntelligenceDashboardCounts,
  approveProspectIntelligence,
  markProspectNeedsReview,
  patchProspectIntelligence,
  reanalyzeProspectContact,
  analyzeProspectContact,
  claimProspectContactForAnalysis,
  markProspectAnalysisFailed,
  healAbandonedProcessingAnalysis,
  markProspectOutreachSent,
  markProspectOutreachReplied,
  reconcileProspectOutreachConversation,
};

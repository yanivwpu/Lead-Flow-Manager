import { and, desc, eq, inArray } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import {
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
  type ProspectWorkspaceBusinessContext,
} from "./prospectIntelligenceAi";
import {
  assertInternalImportedProspect,
  isInternalImportedProspect,
  readProspectImportMetadata,
  resolvePipelineStageAfterAnalysis,
} from "./prospectIntelligenceEligibility";
import { assertContactInWorkspace } from "./prospectWorkspaceScope";

const runningBatchJobs = new Set<string>();
const runningContactAnalysis = new Set<string>();
const ANALYSIS_CONCURRENCY = 1;
const MAX_AI_RETRIES = 2;

type AiCompleteFn = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
) => Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }>;

function text(value: unknown): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v || undefined;
}

async function loadWorkspaceBusinessContext(
  userId: string,
): Promise<ProspectWorkspaceBusinessContext> {
  const knowledge = await storage.getAiBusinessKnowledge(userId);
  if (!knowledge) return { configured: false };

  const faqs = Array.isArray(knowledge.faqs)
    ? knowledge.faqs
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const question = text(row.question);
          const answer = text(row.answer);
          return question && answer ? { question, answer } : null;
        })
        .filter((item): item is { question: string; answer: string } => Boolean(item))
        .slice(0, 20)
    : [];

  const businessName = text(knowledge.businessName);
  const industry = text(knowledge.industry);
  const servicesProducts = text(knowledge.servicesProducts);
  const websiteKnowledgeSummary = text(knowledge.websiteKnowledgeSummary);
  const about = text(knowledge.aboutText);
  const configured = Boolean(
    businessName ||
      industry ||
      servicesProducts ||
      websiteKnowledgeSummary ||
      about ||
      faqs.length,
  );

  return {
    configured,
    businessName,
    industry,
    servicesProducts,
    websiteKnowledgeSummary,
    faqs,
    // AI Brain has no standalone Executive Summary column yet; derive one from canonical knowledge.
    executiveSummary: about || websiteKnowledgeSummary || servicesProducts,
  };
}

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

export async function analyzeProspectContact(params: {
  contactId: string;
  importJobId?: string | null;
  force?: boolean;
  completeFn?: AiCompleteFn;
}): Promise<ProspectIntelligence> {
  if (runningContactAnalysis.has(params.contactId)) {
    throw new Error("Analysis already in progress for this contact.");
  }

  const contact = await storage.getContact(params.contactId);
  if (!contact) throw new Error("Contact not found");
  assertInternalImportedProspect(contact);

  const existingRows = await db
    .select()
    .from(prospectIntelligence)
    .where(eq(prospectIntelligence.contactId, params.contactId))
    .limit(1);
  const existing = existingRows[0];

  if (
    !params.force &&
    existing &&
    existing.analysisStatus === "completed" &&
    existing.aiVersion === PROSPECT_INTELLIGENCE_AI_VERSION &&
    !existing.errorMessage
  ) {
    return mapIntelligenceRow(existing);
  }

  if (existing?.analysisStatus === "processing") {
    throw new Error("Analysis already in progress for this contact.");
  }

  runningContactAnalysis.add(params.contactId);
  const model = aiProvider.getModelConfig("extraction").model;

  try {
    await db
      .insert(prospectIntelligence)
      .values({
        contactId: params.contactId,
        importJobId: params.importJobId ?? readProspectImportMetadata(contact)?.importJobId ?? null,
        analysisStatus: "processing",
        reviewStatus: "pending",
        aiModel: model,
        aiVersion: PROSPECT_INTELLIGENCE_AI_VERSION,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: prospectIntelligence.contactId,
        set: {
          analysisStatus: "processing",
          errorMessage: null,
          updatedAt: new Date(),
        },
      });

    const input = buildProspectIntelligenceInput(contact);
    const workspaceContext = await loadWorkspaceBusinessContext(contact.userId);
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
            "You are Prospect AI, a growth analyst for the current workspace. Use the workspace's existing AI Brain context when provided. Output strict JSON only. Never hallucinate unsupported business facts.",
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
          const response = await completeFn(messages);
          promptTokens += response.usage?.promptTokens ?? 0;
          completionTokens += response.usage?.completionTokens ?? 0;
          const raw = JSON.parse(response.content || "{}");
          parsed = parseAndValidateProspectIntelligence(raw, model, input, workspaceContext);
          break;
        } catch (err) {
          lastErr = err;
          if (!isTransientAiError(err) || attempt === MAX_AI_RETRIES) break;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }

      if (!parsed) {
        const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
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

    await db
      .update(prospectIntelligence)
      .set({
        ...toDbPatch(intel, {
          importJobId: params.importJobId ?? readProspectImportMetadata(contact)?.importJobId ?? null,
          promptTokens,
          completionTokens,
          rawResult: intel as unknown as Record<string, unknown>,
          errorMessage: null,
        }),
      })
      .where(eq(prospectIntelligence.contactId, params.contactId));

    await syncContactIntelligence(contact, intel, params.importJobId);
    return intel;
  } finally {
    runningContactAnalysis.delete(params.contactId);
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

  // Queue state lookup for statusFilter / eligibility filters
  let queuedContactIds = new Set<string>();
  let failedContactIds = new Set<string>();
  const needsQueueLookup =
    !!filters.statusFilter || filters.emailEligible || filters.anyEligibleChannel;
  if (needsQueueLookup) {
    const { prospectOutreachQueueItems } = await import("@shared/schema");
    const qRows = await db
      .select({
        contactId: prospectOutreachQueueItems.contactId,
        status: prospectOutreachQueueItems.queueStatus,
      })
      .from(prospectOutreachQueueItems)
      .where(eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId));
    queuedContactIds = new Set(
      qRows
        .filter((r) => ["queued", "sending", "paused"].includes(r.status))
        .map((r) => r.contactId),
    );
    failedContactIds = new Set(
      qRows.filter((r) => r.status === "failed").map((r) => r.contactId),
    );
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
    items.push({
      contactId: contact.id,
      name: contact.name,
      company: row.companyName ?? meta?.batchName ?? null,
      email: contact.email,
      phone: contact.phone,
      importTag: contact.tag,
      batchName: meta?.batchName ?? null,
      importReason: meta?.importReason ?? null,
      pipelineStage: contact.pipelineStage,
      intelligence: mapIntelligenceRow(row),
    });
  }

  const sortBy = filters.sortBy ?? "leadScore";
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
  return {
    contactId: contact.id,
    name: contact.name,
    company: rows[0].companyName ?? null,
    email: contact.email,
    phone: contact.phone,
    importTag: contact.tag,
    batchName: meta?.batchName ?? null,
    importReason: meta?.importReason ?? null,
    pipelineStage: contact.pipelineStage,
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
  markProspectOutreachSent,
  markProspectOutreachReplied,
  reconcileProspectOutreachConversation,
};

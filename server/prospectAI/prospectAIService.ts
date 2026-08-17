import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { SubscriptionPlan } from "@shared/schema";
import {
  campaignEnrollments,
  prospectAiActivations,
  prospectAiDiscoveryResults,
  prospectAiDiscoverySearches,
  prospectAiDiscoveryUsageEvents,
  prospectIntelligence,
  prospectOutreachQueueItems,
  users,
} from "@shared/schema";
import {
  PROSPECT_AI_DEFAULT_PROVIDER,
  PROSPECT_AI_IMPORT_PROVIDER,
  PROSPECT_AI_INTERNAL_TAG,
  getProspectAiMonthlyQuota,
  isProspectAiPlanEligible,
  prospectAiQuotaExceededUserMessage,
  type ProspectAiAiBrainStatus,
  type ProspectAiQuotaSnapshot,
  type ProspectAiStatusResponse,
} from "@shared/prospectAI";
import {
  PROSPECT_AI_DISCOVERY_STATUS_DISCARDED,
  selectActiveUnsentDiscoverySearch,
} from "@shared/prospectAiDiscoveryBatch";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { INCLUDE_INBOX_IDENTITIES, isEmailInboxIdentitySource } from "@shared/contactCrmVisibility";
import { promoteInboxIdentityToCrm } from "../emailChannel/contactMatch";
import { subscriptionService } from "../subscriptionService";
import { getBusinessProfileForUser } from "../businessProfileService";
import { getProspectDiscoveryProvider } from "./providers";
import type { ProspectDiscoveryProvider } from "./providers/types";
import { validateDiscoverInput } from "./normalize";
import {
  buildProspectDedupIndex,
  findProspectDuplicate,
} from "../prospectImport/prospectImportDedup";
import {
  normalizeDiagnosticsRecord,
  parseDiscoveryDiagnostics,
  serializeDiscoveryDiagnostics,
} from "@shared/prospectAiDiscoveryDiagnostics";

/** In-process concurrent Discover guard (same workspace). */
const activeDiscoveryRuns = new Map<string, { startedAt: number; runKey: string }>();
const DISCOVERY_RUN_STALE_MS = 15 * 60 * 1000;

function acquireDiscoveryRunLock(
  workspaceUserId: string,
  runKey: string,
): () => void {
  const now = Date.now();
  const existing = activeDiscoveryRuns.get(workspaceUserId);
  if (existing && now - existing.startedAt < DISCOVERY_RUN_STALE_MS) {
    throw new ProspectAiError(
      "A discovery search is already running for this workspace. Wait for it to finish.",
      "concurrent_discovery",
      409,
    );
  }
  activeDiscoveryRuns.set(workspaceUserId, { startedAt: now, runKey });
  return () => {
    const cur = activeDiscoveryRuns.get(workspaceUserId);
    if (cur?.runKey === runKey) activeDiscoveryRuns.delete(workspaceUserId);
  };
}

export type ProspectAiErrorDetails = {
  remaining_quota?: number;
  plan_limit?: number;
  used?: number;
  plan?: SubscriptionPlan;
};

export class ProspectAiError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "upgrade_required"
      | "not_activated"
      | "quota_exceeded"
      | "invalid_input"
      | "provider_unavailable"
      | "not_found"
      | "forbidden"
      | "active_batch_exists"
      | "concurrent_discovery",
    public readonly status = 400,
    public readonly details: ProspectAiErrorDetails = {},
  ) {
    super(message);
    this.name = "ProspectAiError";
  }
}

export function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Pure period resolver for discovery quota (billing cycle when active, else UTC month).
 * Exported for tests — production path uses resolveDiscoveryQuotaPeriodStart.
 */
export function resolveDiscoveryQuotaPeriodStartFromDates(
  currentPeriodStart: Date | null | undefined,
  currentPeriodEnd: Date | null | undefined,
  now = new Date(),
): { periodStart: Date; source: "billing_period" | "utc_month" } {
  const start =
    currentPeriodStart instanceof Date && !Number.isNaN(currentPeriodStart.getTime())
      ? currentPeriodStart
      : null;
  const end =
    currentPeriodEnd instanceof Date && !Number.isNaN(currentPeriodEnd.getTime())
      ? currentPeriodEnd
      : null;
  if (start && end && now <= end) {
    return { periodStart: start, source: "billing_period" };
  }
  return { periodStart: startOfUtcMonth(now), source: "utc_month" };
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Billing-period start for discovery quota. Prefer Stripe/user period when active;
 * otherwise UTC calendar month. Never tied to Review/Campaign row mutations.
 */
export async function resolveDiscoveryQuotaPeriodStart(
  workspaceUserId: string,
  now = new Date(),
): Promise<{ periodStart: Date; source: "billing_period" | "utc_month" }> {
  const rows = await db
    .select({
      currentPeriodStart: users.currentPeriodStart,
      currentPeriodEnd: users.currentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, workspaceUserId))
    .limit(1);
  const start = rows[0]?.currentPeriodStart ? new Date(rows[0].currentPeriodStart) : null;
  const end = rows[0]?.currentPeriodEnd ? new Date(rows[0].currentPeriodEnd) : null;
  return resolveDiscoveryQuotaPeriodStartFromDates(start, end, now);
}

/** Immutable ledger sum for the active quota period. */
export async function countMonthlyDiscoveryUsage(
  workspaceUserId: string,
  now = new Date(),
): Promise<number> {
  const { periodStart } = await resolveDiscoveryQuotaPeriodStart(workspaceUserId, now);

  const [ledgerPresence] = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryUsageEvents)
    .where(eq(prospectAiDiscoveryUsageEvents.workspaceUserId, workspaceUserId));

  // Pre-migration safety: if ledger empty for workspace, fall back to result rows.
  if (Number(ledgerPresence?.total ?? 0) === 0) {
    const rows = await db
      .select({ total: count() })
      .from(prospectAiDiscoveryResults)
      .where(
        and(
          eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
          gte(prospectAiDiscoveryResults.createdAt, periodStart),
        ),
      );
    return Math.max(0, Number(rows[0]?.total ?? 0));
  }

  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${prospectAiDiscoveryUsageEvents.units}), 0)`,
    })
    .from(prospectAiDiscoveryUsageEvents)
    .where(
      and(
        eq(prospectAiDiscoveryUsageEvents.workspaceUserId, workspaceUserId),
        gte(prospectAiDiscoveryUsageEvents.createdAt, periodStart),
      ),
    );
  return Math.max(0, Number(rows[0]?.total ?? 0));
}

/** Explicit admin/manual adjustment — never delete ledger rows to "reset". */
export async function recordDiscoveryUsageAdjustment(params: {
  workspaceUserId: string;
  units: number;
  note?: string;
}): Promise<void> {
  const units = Math.trunc(Number(params.units) || 0);
  if (!units) return;
  await db.insert(prospectAiDiscoveryUsageEvents).values({
    workspaceUserId: params.workspaceUserId,
    units,
    reason: "admin_adjustment",
    note: params.note ? String(params.note).slice(0, 500) : null,
  });
}

/** One immutable ledger row per net-new usable result (units=1). No-op when empty. */
async function recordDiscoveryUsageEventsForResults(params: {
  workspaceUserId: string;
  searchId: string;
  resultIds: string[];
  reason?: string;
}): Promise<void> {
  const ids = Array.from(new Set(params.resultIds.filter(Boolean)));
  if (!ids.length) return;
  await db.insert(prospectAiDiscoveryUsageEvents).values(
    ids.map((resultId) => ({
      workspaceUserId: params.workspaceUserId,
      searchId: params.searchId,
      resultId,
      units: 1,
      reason: params.reason || "discover",
    })),
  );
}

export async function resolveAiBrainSourceFlags(
  workspaceUserId: string,
): Promise<ProspectAiAiBrainStatus> {
  const [knowledge, profile] = await Promise.all([
    storage.getAiBusinessKnowledge(workspaceUserId),
    getBusinessProfileForUser(workspaceUserId),
  ]);

  const businessProfile = Boolean(
    String(profile.displayName || "").trim() ||
      String(profile.businessName || "").trim() ||
      String(profile.aboutText || "").trim() ||
      String(profile.publicWebsite || "").trim() ||
      String(profile.publicPhone || "").trim(),
  );

  const businessKnowledge = Boolean(
    knowledge &&
      (String(knowledge.businessName || "").trim() ||
        String(knowledge.industry || "").trim() ||
        String(knowledge.servicesProducts || "").trim() ||
        String(knowledge.customInstructions || "").trim() ||
        (Array.isArray(knowledge.faqs) && knowledge.faqs.length > 0)),
  );

  const websiteKnowledge = Boolean(
    String(knowledge?.websiteKnowledgeSummary || "").trim() ||
      String(knowledge?.websiteKnowledgeUrl || "").trim(),
  );

  return {
    configured: businessProfile || businessKnowledge || websiteKnowledge,
    businessProfile,
    businessKnowledge,
    websiteKnowledge,
  };
}

async function getActivation(workspaceUserId: string) {
  const rows = await db
    .select()
    .from(prospectAiActivations)
    .where(eq(prospectAiActivations.workspaceUserId, workspaceUserId))
    .limit(1);
  return rows[0] ?? null;
}

export async function buildQuotaSnapshot(
  workspaceUserId: string,
  plan: SubscriptionPlan,
): Promise<ProspectAiQuotaSnapshot> {
  const monthlyQuota = getProspectAiMonthlyQuota(plan);
  const used = await countMonthlyDiscoveryUsage(workspaceUserId);
  const remaining = Math.max(0, monthlyQuota - used);
  return { monthlyQuota, used, remaining };
}

export async function getProspectAiStatus(workspaceUserId: string): Promise<ProspectAiStatusResponse> {
  const limits = await subscriptionService.getUserLimits(workspaceUserId);
  if (!limits) {
    throw new ProspectAiError("Subscription state could not be loaded", "forbidden", 503);
  }

  const plan = limits.plan;
  const eligible = isProspectAiPlanEligible(plan);
  const activation = await getActivation(workspaceUserId);
  const activated = activation?.status === "active";
  const quota = await buildQuotaSnapshot(workspaceUserId, plan);
  const aiBrain = await resolveAiBrainSourceFlags(workspaceUserId);

  let denialReason: ProspectAiStatusResponse["denialReason"] = null;
  if (!eligible) denialReason = "upgrade_required";
  else if (!activated) denialReason = "not_activated";

  return {
    activated,
    plan,
    monthlyQuota: quota.monthlyQuota,
    used: quota.used,
    remaining: quota.remaining,
    eligible,
    denialReason,
    aiBrain,
    provider: PROSPECT_AI_DEFAULT_PROVIDER,
  };
}

export async function activateProspectAi(workspaceUserId: string): Promise<ProspectAiStatusResponse> {
  const limits = await subscriptionService.getUserLimits(workspaceUserId);
  if (!limits) {
    throw new ProspectAiError("Subscription state could not be loaded", "forbidden", 503);
  }
  if (!isProspectAiPlanEligible(limits.plan)) {
    throw new ProspectAiError(
      "Prospect AI is not available on your current plan.",
      "upgrade_required",
      403,
      {
        plan: limits.plan,
        plan_limit: getProspectAiMonthlyQuota(limits.plan),
        remaining_quota: 0,
      },
    );
  }

  const existing = await getActivation(workspaceUserId);
  if (!existing) {
    await db.insert(prospectAiActivations).values({
      workspaceUserId,
      activatedByUserId: workspaceUserId,
      provider: PROSPECT_AI_DEFAULT_PROVIDER,
      status: "active",
      activatedAt: new Date(),
      updatedAt: new Date(),
    });
  } else if (existing.status !== "active") {
    await db
      .update(prospectAiActivations)
      .set({ status: "active", updatedAt: new Date(), activatedByUserId: workspaceUserId })
      .where(eq(prospectAiActivations.workspaceUserId, workspaceUserId));
  }

  return getProspectAiStatus(workspaceUserId);
}

async function assertActivatedAndEligible(
  workspaceUserId: string,
  opts?: { requireQuota?: boolean },
): Promise<{
  plan: SubscriptionPlan;
  quota: ProspectAiQuotaSnapshot;
}> {
  const limits = await subscriptionService.getUserLimits(workspaceUserId);
  if (!limits) {
    throw new ProspectAiError("Subscription state could not be loaded", "forbidden", 503);
  }
  if (!isProspectAiPlanEligible(limits.plan)) {
    throw new ProspectAiError(
      "Prospect AI is not available on your current plan.",
      "upgrade_required",
      403,
      {
        plan: limits.plan,
        plan_limit: getProspectAiMonthlyQuota(limits.plan),
        remaining_quota: 0,
      },
    );
  }
  const activation = await getActivation(workspaceUserId);
  if (!activation || activation.status !== "active") {
    throw new ProspectAiError("Activate Prospect AI before discovering prospects.", "not_activated", 403);
  }
  const quota = await buildQuotaSnapshot(workspaceUserId, limits.plan);
  if (opts?.requireQuota !== false && quota.remaining <= 0) {
    throw new ProspectAiError(
      prospectAiQuotaExceededUserMessage(limits.plan),
      "quota_exceeded",
      429,
      {
        plan: limits.plan,
        plan_limit: quota.monthlyQuota,
        remaining_quota: 0,
        used: quota.used,
      },
    );
  }
  return { plan: limits.plan, quota };
}

function mapResultRow(row: typeof prospectAiDiscoveryResults.$inferSelect) {
  const raw = (row.rawPayload || {}) as Record<string, unknown>;
  const disposition =
    raw.disposition === "needs_attention" ? "needs_attention" : "ready";
  return {
    id: row.id,
    name: row.name,
    businessName: row.name,
    businessType: row.businessType,
    location: row.address,
    address: row.address,
    website: row.website,
    phone: row.phone,
    email: row.email,
    providerPlaceId: row.providerPlaceId,
    latitude: row.latitude,
    longitude: row.longitude,
    rating: numOrNull(row.rating),
    reviewCount: row.reviewCount,
    contactId: row.contactId,
    sentToReviewAt: toIso(row.sentToReviewAt),
    disposition,
    attentionReason: raw.attentionReason != null ? String(raw.attentionReason) : null,
    group: disposition === "needs_attention" ? "needs_attention" : "ready",
  };
}

function mapSearchSummary(search: typeof prospectAiDiscoverySearches.$inferSelect) {
  return {
    id: search.id,
    businessType: search.businessType,
    location: search.location,
    radiusKm: numOrNull(search.radiusKm),
    createdAt: toIso(search.createdAt),
    resultCount: search.resultCount,
    status: search.status,
  };
}

/**
 * Latest non-discarded discovery search that still has unsent results.
 * Read-only — does not increment quota.
 */
export async function getActiveUnsentDiscoveryBatch(workspaceUserId: string): Promise<{
  search: ReturnType<typeof mapSearchSummary> | null;
  results: ReturnType<typeof mapResultRow>[];
  quota: ProspectAiQuotaSnapshot;
  diagnostics: ReturnType<typeof parseDiscoveryDiagnostics>;
}> {
  const { plan } = await assertActivatedAndEligible(workspaceUserId, { requireQuota: false });
  const quota = await buildQuotaSnapshot(workspaceUserId, plan);

  const searches = await db
    .select()
    .from(prospectAiDiscoverySearches)
    .where(eq(prospectAiDiscoverySearches.workspaceUserId, workspaceUserId))
    .orderBy(desc(prospectAiDiscoverySearches.createdAt))
    .limit(30);

  const unsentCountBySearchId = new Map<string, number>();
  for (const search of searches) {
    if (String(search.status || "").toLowerCase() === PROSPECT_AI_DISCOVERY_STATUS_DISCARDED) {
      unsentCountBySearchId.set(search.id, 0);
      continue;
    }
    const [row] = await db
      .select({ total: count() })
      .from(prospectAiDiscoveryResults)
      .where(
        and(
          eq(prospectAiDiscoveryResults.searchId, search.id),
          eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
          isNull(prospectAiDiscoveryResults.sentToReviewAt),
        ),
      );
    unsentCountBySearchId.set(search.id, Number(row?.total ?? 0));
  }

  const activeSearch = selectActiveUnsentDiscoverySearch(searches, unsentCountBySearchId);
  if (!activeSearch) {
    return { search: null, results: [], quota, diagnostics: null };
  }

  const resultRows = await db
    .select()
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.searchId, activeSearch.id),
        eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
        isNull(prospectAiDiscoveryResults.sentToReviewAt),
      ),
    )
    .orderBy(desc(prospectAiDiscoveryResults.createdAt));

  const diagnostics = parseDiscoveryDiagnostics(activeSearch.errorMessage);

  return {
    search: mapSearchSummary(activeSearch),
    results: resultRows.map(mapResultRow),
    quota,
    diagnostics,
  };
}

/** Mark a discovery search discarded so it is no longer restored (quota not refunded). */
export async function discardDiscoverySearch(
  workspaceUserId: string,
  searchId: string,
): Promise<{ discarded: true; searchId: string }> {
  await assertActivatedAndEligible(workspaceUserId, { requireQuota: false });
  const id = String(searchId || "").trim();
  if (!id) {
    throw new ProspectAiError("searchId is required", "invalid_input", 400);
  }
  const updated = await db
    .update(prospectAiDiscoverySearches)
    .set({ status: PROSPECT_AI_DISCOVERY_STATUS_DISCARDED })
    .where(
      and(
        eq(prospectAiDiscoverySearches.id, id),
        eq(prospectAiDiscoverySearches.workspaceUserId, workspaceUserId),
      ),
    )
    .returning({ id: prospectAiDiscoverySearches.id });
  if (!updated[0]) {
    throw new ProspectAiError("Discovery search not found", "not_found", 404);
  }
  return { discarded: true, searchId: updated[0].id };
}

export async function discoverProspects(
  workspaceUserId: string,
  body: unknown,
  provider?: ProspectDiscoveryProvider,
  opts?: { isCancelled?: () => boolean },
): Promise<{
  search: {
    id: string;
    businessType: string;
    location: string;
    radiusKm: number | null;
    createdAt: string | null;
    resultCount: number;
  };
  results: ReturnType<typeof mapResultRow>[];
  quota: ProspectAiQuotaSnapshot;
  diagnostics: Record<string, unknown> | null;
  excluded?: Array<Record<string, unknown>>;
}> {
  const validated = validateDiscoverInput(body);
  if (!validated.ok) {
    throw new ProspectAiError(validated.error, "invalid_input", 400);
  }

  const replaceActiveBatch =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    (body as { replaceActiveBatch?: unknown }).replaceActiveBatch === true;

  const idempotencyKey =
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as { idempotencyKey?: unknown }).idempotencyKey === "string"
      ? String((body as { idempotencyKey: string }).idempotencyKey).slice(0, 80)
      : `auto-${Date.now()}`;

  const releaseLock = acquireDiscoveryRunLock(workspaceUserId, idempotencyKey);
  try {
    const active = await getActiveUnsentDiscoveryBatch(workspaceUserId);
    if (active.search && active.results.length > 0) {
      if (!replaceActiveBatch) {
        throw new ProspectAiError(
          `You have ${active.results.length} discovered prospects not yet sent to Review. Send them to Review or clear results before running a new discovery.`,
          "active_batch_exists",
          409,
        );
      }
      await discardDiscoverySearch(workspaceUserId, active.search.id);
    }

    const { plan, quota } = await assertActivatedAndEligible(workspaceUserId);
    const discoveryProvider = provider ?? getProspectDiscoveryProvider();

    type SavedProspect = {
      providerPlaceId: string;
      name: string;
      businessType: string | null;
      address: string | null;
      phone: string | null;
      website: string | null;
      email: string | null;
      latitude: number | null;
      longitude: number | null;
      rating: number | null;
      reviewCount: number | null;
      discoveryQuery?: string;
      discoveryLocation?: string;
      disposition?: "ready" | "needs_attention";
      attentionReason?: string | null;
      discoveryQueries?: string[];
      discoveryLocations?: string[];
      providerPlaceIds?: string[];
      alternateNames?: string[];
      alternatePhones?: string[];
      alternateWebsites?: string[];
    };

    let prospects: SavedProspect[] = [];
    let diagnostics: Record<string, unknown> | null = null;
    try {
      if (provider) {
        // Tests / injected providers — single discover() call (may ignore expansion).
        const result = await provider.discover({
          businessType: validated.businessType,
          location: validated.location,
          radiusKm: validated.radiusKm,
          targetCount: validated.targetCount,
          locationExpansion: validated.locationExpansion,
          quotaRemaining: quota.remaining,
        });
        prospects = result.prospects.map((p) => ({
          ...p,
          disposition: "ready" as const,
          attentionReason: null,
        }));
        diagnostics = (result.meta as Record<string, unknown> | undefined) || null;
      } else {
        const { runProspectAiDiscoveryOrchestrator } = await import("./discoveryOrchestrator");
        const { loadDiscoveryWorkspaceIndex } = await import("./discoveryWorkspaceIndex");
        const workspaceIndex = await loadDiscoveryWorkspaceIndex(workspaceUserId);
        const orchestrated = await runProspectAiDiscoveryOrchestrator({
          businessType: validated.businessType,
          location: validated.location,
          radiusKm: validated.radiusKm,
          targetCount: validated.targetCount,
          locationExpansion: validated.locationExpansion,
          quotaRemaining: quota.remaining,
          isCancelled: opts?.isCancelled,
          workspaceIndex,
        });
        prospects = orchestrated.prospects;
        diagnostics = orchestrated.diagnostics as unknown as Record<string, unknown>;
      }
    } catch (err) {
      if (err instanceof ProspectAiError) throw err;
      const message = err instanceof Error ? err.message : "Discovery provider failed";
      const safe = message.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]");
      throw new ProspectAiError(safe, "provider_unavailable", 502);
    }

    // Only net-new usable rows are persisted → only they consume monthly quota.
    const capped = prospects.slice(0, quota.remaining);
    const safeDiagnostics = diagnostics
      ? normalizeDiagnosticsRecord({
          ...diagnostics,
          targetCount: diagnostics.targetCount ?? validated.targetCount,
          locationExpansion: diagnostics.locationExpansion ?? validated.locationExpansion,
          provider: diagnostics.provider ?? discoveryProvider.id,
          saved: capped.length,
          netNewUsable: capped.length,
          quotaConsumed: capped.length,
          readyForReview:
            diagnostics.readyForReview ??
            capped.filter((p) => p.disposition !== "needs_attention").length,
          usableNeedsAttention:
            diagnostics.usableNeedsAttention ??
            capped.filter((p) => p.disposition === "needs_attention").length,
          needsAttention:
            diagnostics.usableNeedsAttention ??
            diagnostics.needsAttention ??
            capped.filter((p) => p.disposition === "needs_attention").length,
          possibleDuplicates: diagnostics.possibleDuplicates ?? 0,
        })
      : null;

    const [search] = await db
      .insert(prospectAiDiscoverySearches)
      .values({
        workspaceUserId,
        createdByUserId: workspaceUserId,
        businessType: validated.businessType,
        location: validated.location,
        radiusKm: validated.radiusKm != null ? String(validated.radiusKm) : null,
        provider: discoveryProvider.id,
        status: "completed",
        resultCount: capped.length,
        // Persist run diagnostics without a schema migration.
        errorMessage: safeDiagnostics
          ? serializeDiscoveryDiagnostics({ ...safeDiagnostics, runId: null })
          : null,
      })
      .returning();

    let inserted: (typeof prospectAiDiscoveryResults.$inferSelect)[] = [];
    if (capped.length > 0) {
      inserted = await db
        .insert(prospectAiDiscoveryResults)
        .values(
          capped.map((p) => ({
            searchId: search.id,
            workspaceUserId,
            provider: discoveryProvider.id,
            providerPlaceId: p.providerPlaceId,
            name: p.name,
            businessType: p.businessType,
            address: p.address,
            phone: p.phone,
            website: p.website,
            email: p.email,
            latitude: p.latitude,
            longitude: p.longitude,
            rating: p.rating != null ? String(p.rating) : null,
            reviewCount: p.reviewCount,
            rawPayload: {
              providerPlaceId: p.providerPlaceId,
              name: p.name,
              businessType: p.businessType,
              address: p.address,
              hasPhone: Boolean(p.phone),
              hasWebsite: Boolean(p.website),
              hasEmail: Boolean(p.email),
              discoveryQuery: p.discoveryQuery ?? null,
              discoveryLocation: p.discoveryLocation ?? null,
              discoveryQueries: p.discoveryQueries ?? [],
              discoveryLocations: p.discoveryLocations ?? [],
              providerPlaceIds: p.providerPlaceIds ?? [p.providerPlaceId],
              alternateNames: p.alternateNames ?? [],
              alternatePhones: p.alternatePhones ?? [],
              alternateWebsites: p.alternateWebsites ?? [],
              disposition: p.disposition ?? "ready",
              attentionReason: p.attentionReason ?? null,
            },
          })),
        )
        .returning();
    }

    // Immutable quota: exactly one ledger event per net-new usable inserted row.
    // Duplicates/rejected/possible-duplicates never reach `inserted` → no usage event.
    await recordDiscoveryUsageEventsForResults({
      workspaceUserId,
      searchId: search.id,
      resultIds: inserted.map((r) => r.id),
      reason: "discover",
    });

    const nextQuota = await buildQuotaSnapshot(workspaceUserId, plan);
    const diagnosticsOut = safeDiagnostics
      ? {
          ...safeDiagnostics,
          runId: search.id,
          saved: inserted.length,
          netNewUsable: inserted.length,
        }
      : null;

    return {
      search: {
        id: search.id,
        businessType: search.businessType,
        location: search.location,
        radiusKm: numOrNull(search.radiusKm),
        createdAt: toIso(search.createdAt),
        resultCount: search.resultCount,
      },
      results: inserted.map(mapResultRow),
      quota: nextQuota,
      diagnostics: diagnosticsOut,
      excluded: (safeDiagnostics?.excludedSamples || []) as Array<Record<string, unknown>>,
    };
  } finally {
    releaseLock();
  }
}

function buildContactNotes(row: typeof prospectAiDiscoveryResults.$inferSelect): string {
  const lines: string[] = [`Company: ${row.name}`];
  if (row.businessType) lines.push(`Type: ${row.businessType}`);
  if (row.address) lines.push(`Address: ${row.address}`);
  if (row.phone) lines.push(`Phone: ${row.phone}`);
  if (row.website) {
    lines.push(row.website.startsWith("http") ? row.website : `https://${row.website}`);
  }
  if (row.rating != null) lines.push(`Google rating: ${row.rating}`);
  if (row.reviewCount != null) lines.push(`Google review count: ${row.reviewCount}`);
  lines.push("Source: Google Places discovery");
  return lines.join("\n");
}

async function ensurePendingIntelligence(contactId: string): Promise<void> {
  await db
    .insert(prospectIntelligence)
    .values({
      contactId,
      analysisStatus: "pending",
      reviewStatus: "pending",
      needsReview: false,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: prospectIntelligence.contactId });
}

export async function sendDiscoverResultsToReview(
  workspaceUserId: string,
  searchId: string,
  resultIds: unknown,
): Promise<{
  contactIds: string[];
  sent: number;
  analysisStarted: boolean;
  analysisJobId: string | null;
  searchId: string;
  reviewBatchKey: string;
  batchLabel: string;
  businessType: string;
  location: string;
  radiusKm: number | null;
}> {
  // Quota already consumed at discover time — do not block review handoff.
  await assertActivatedAndEligible(workspaceUserId, { requireQuota: false });

  if (!Array.isArray(resultIds) || resultIds.length === 0) {
    throw new ProspectAiError("resultIds must be a non-empty array", "invalid_input", 400);
  }
  const ids = [...new Set(resultIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new ProspectAiError("resultIds must be a non-empty array", "invalid_input", 400);
  }
  if (ids.length > 250) {
    throw new ProspectAiError("Too many resultIds (max 250)", "invalid_input", 400);
  }

  const searchRows = await db
    .select()
    .from(prospectAiDiscoverySearches)
    .where(
      and(
        eq(prospectAiDiscoverySearches.id, searchId),
        eq(prospectAiDiscoverySearches.workspaceUserId, workspaceUserId),
      ),
    )
    .limit(1);
  if (!searchRows[0]) {
    throw new ProspectAiError("Discovery search not found", "not_found", 404);
  }

  const resultRows = await db
    .select()
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.searchId, searchId),
        eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
        inArray(prospectAiDiscoveryResults.id, ids),
      ),
    );

  if (resultRows.length === 0) {
    throw new ProspectAiError("No matching discovery results in this search", "not_found", 404);
  }

  const existingContacts = await storage.getContacts(workspaceUserId, 5000, INCLUDE_INBOX_IDENTITIES);
  const dedupIndex = buildProspectDedupIndex(existingContacts);

  const placeIdIndex = new Map<string, (typeof existingContacts)[0]>();
  for (const c of existingContacts) {
    const sd = (c.sourceDetails || {}) as Record<string, unknown>;
    const pai = (sd.prospectAi || {}) as Record<string, unknown>;
    const placeId = String(pai.placeId || "").trim();
    if (placeId && !placeIdIndex.has(placeId)) placeIdIndex.set(placeId, c);
  }

  const contactIds: string[] = [];
  const now = new Date();

  for (const row of resultRows) {
    if (row.contactId) {
      const owned = existingContacts.find((c) => c.id === row.contactId);
      if (owned && owned.userId === workspaceUserId) {
        await ensurePendingIntelligence(owned.id);
        contactIds.push(owned.id);
        if (!row.sentToReviewAt) {
          await db
            .update(prospectAiDiscoveryResults)
            .set({ sentToReviewAt: now })
            .where(
              and(
                eq(prospectAiDiscoveryResults.id, row.id),
                eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
              ),
            );
        }
        continue;
      }
    }

    let contact = placeIdIndex.get(row.providerPlaceId) ?? null;
    if (!contact) {
      const dup = findProspectDuplicate(dedupIndex, {
        externalId: row.providerPlaceId,
        email: row.email || undefined,
        phone: row.phone || undefined,
      });
      contact = dup?.contact ?? null;
    }

    const rawPayload = (row.rawPayload || {}) as Record<string, unknown>;
    const attentionReason =
      rawPayload.attentionReason != null ? String(rawPayload.attentionReason) : null;
    const discoveryDisposition =
      rawPayload.disposition === "needs_attention" ? "needs_attention" : "ready";
    const prospectMeta = {
      placeId: row.providerPlaceId,
      discoverySearchId: searchId,
      discoveryResultId: row.id,
      businessType: row.businessType,
      address: row.address,
      website: row.website,
      phone: row.phone,
      email: row.email,
      rating: row.rating != null ? Number(row.rating) : null,
      reviewCount: row.reviewCount,
      disposition: discoveryDisposition,
      attentionReason,
      latitude: row.latitude,
      longitude: row.longitude,
      provider: PROSPECT_AI_IMPORT_PROVIDER,
      sourceLabel: "Google Places discovery",
      batchName: `Prospect AI: ${searchRows[0].businessType} in ${searchRows[0].location}`,
      importReason: "Local prospect discovery",
      importedAt: now.toISOString(),
      createdByImportJob: true,
    };

    if (contact && contact.userId === workspaceUserId) {
      if (isEmailInboxIdentitySource(contact.source)) {
        contact = await promoteInboxIdentityToCrm(contact, "import");
      }
      const sd = { ...(contact.sourceDetails as Record<string, unknown> | null) };
      const cf = { ...(contact.customFields as Record<string, unknown> | null) };
      const mergedSd = {
        ...sd,
        prospectImportProvider: PROSPECT_AI_IMPORT_PROVIDER,
        prospectAi: prospectMeta,
        prospectImport: {
          ...((sd.prospectImport as Record<string, unknown>) || {}),
          ...prospectMeta,
        },
      };
      const mergedCf = {
        ...cf,
        prospectImport: {
          ...((cf.prospectImport as Record<string, unknown>) || {}),
          ...prospectMeta,
        },
        prospectAi: prospectMeta,
      };
      const patch: Record<string, unknown> = {
        sourceDetails: mergedSd,
        customFields: mergedCf,
      };
      if (!contact.phone && row.phone) patch.phone = row.phone;
      if (!contact.email && row.email) patch.email = row.email;
      if (!String(contact.notes || "").trim() && row.name) {
        patch.notes = buildContactNotes(row);
      }
      await storage.updateContact(contact.id, patch);
      await ensurePendingIntelligence(contact.id);
      contactIds.push(contact.id);
    } else {
      const created = await storage.createContact({
        userId: workspaceUserId,
        name: row.name,
        email: row.email ?? null,
        phone: row.phone ?? null,
        primaryChannel: "whatsapp",
        source: "import",
        tag: PROSPECT_AI_INTERNAL_TAG,
        pipelineStage: "Imported",
        notes: buildContactNotes(row),
        sourceDetails: {
          prospectImportProvider: PROSPECT_AI_IMPORT_PROVIDER,
          prospectAi: prospectMeta,
          prospectImport: prospectMeta,
        },
        customFields: {
          prospectAi: prospectMeta,
          prospectImport: prospectMeta,
        },
      });
      contact = created;
      placeIdIndex.set(row.providerPlaceId, created);
      if (created.email) {
        dedupIndex.byEmail.set(created.email.trim().toLowerCase(), created);
      }
      if (created.phone) {
        const digits = created.phone.replace(/\D/g, "");
        if (digits.length >= 7) dedupIndex.byPhone.set(digits, created);
      }
      await ensurePendingIntelligence(created.id);
      contactIds.push(created.id);
    }

    await db
      .update(prospectAiDiscoveryResults)
      .set({ contactId: contact.id, sentToReviewAt: now })
      .where(
        and(
          eq(prospectAiDiscoveryResults.id, row.id),
          eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
        ),
      );
  }

  const uniqueContactIds = [...new Set(contactIds)];

  // Seed outcome rows (active) for attribution / Won funnel.
  try {
    const { ensureProspectOutcomeRow } = await import("./prospectAiOutcomeService");
    for (const cid of uniqueContactIds) {
      const c = await storage.getContact(cid);
      if (c) await ensureProspectOutcomeRow(workspaceUserId, c, workspaceUserId);
    }
  } catch (err) {
    console.error("[ProspectAI] Failed to seed outcome rows:", err);
  }

  let analysisStarted = false;
  let analysisJobId: string | null = null;
  if (uniqueContactIds.length > 0) {
    const { enqueueProspectAutoQualification } = await import(
      "../prospectImport/prospectAutoQualify"
    );
    const result = await enqueueProspectAutoQualification({
      contactIds: uniqueContactIds,
      workspaceUserId,
      initiatedByUserId: workspaceUserId,
    });
    analysisStarted = result.analysisStarted;
    analysisJobId = result.analysisJobId;
  }

  return {
    contactIds: uniqueContactIds,
    sent: uniqueContactIds.length,
    analysisStarted,
    analysisJobId,
    searchId,
    reviewBatchKey: `discovery:${searchId}`,
    batchLabel: `Prospect AI: ${searchRows[0].businessType} in ${searchRows[0].location}`,
    businessType: searchRows[0].businessType,
    location: searchRows[0].location,
    radiusKm: searchRows[0].radiusKm != null ? Number(searchRows[0].radiusKm) : null,
  };
}

export async function getProspectAiActivity(workspaceUserId: string): Promise<{
  searches: Array<{
    id: string;
    businessType: string | null;
    location: string | null;
    radiusKm: number | null;
    createdAt: string | null;
    resultCount: number | null;
    status: string | null;
  }>;
  events: Array<{
    id: string;
    type: string;
    label: string;
    description: string | null;
    createdAt: string | null;
    status: string | null;
  }>;
  outreachEvents: Array<{
    id: string;
    type: string;
    label: string;
    description: string | null;
    createdAt: string | null;
    channel: string | null;
    status: string | null;
  }>;
  campaignEvents: Array<{
    id: string;
    type: string;
    label: string;
    description: string | null;
    createdAt: string | null;
    status: string | null;
  }>;
}> {
  const searches = await db
    .select()
    .from(prospectAiDiscoverySearches)
    .where(eq(prospectAiDiscoverySearches.workspaceUserId, workspaceUserId))
    .orderBy(desc(prospectAiDiscoverySearches.createdAt))
    .limit(50);

  const searchSummaries = searches.map((s) => ({
    id: s.id,
    businessType: s.businessType,
    location: s.location,
    radiusKm: numOrNull(s.radiusKm),
    createdAt: toIso(s.createdAt),
    resultCount: s.resultCount,
    status: s.status,
  }));

  const events = searchSummaries.map((s) => ({
    id: s.id,
    type: "discovery",
    label: `Discovered ${s.resultCount ?? 0} ${s.businessType || "prospects"}`,
    description: s.location ? `Near ${s.location}` : null,
    createdAt: s.createdAt,
    status: s.status,
  }));

  let outreachEvents: Array<{
    id: string;
    type: string;
    label: string;
    description: string | null;
    createdAt: string | null;
    channel: string | null;
    status: string | null;
  }> = [];
  try {
    const outreachRows = await db
      .select({
        id: prospectOutreachQueueItems.id,
        selectedChannel: prospectOutreachQueueItems.selectedChannel,
        queueStatus: prospectOutreachQueueItems.queueStatus,
        createdAt: prospectOutreachQueueItems.createdAt,
        sentAt: prospectOutreachQueueItems.sentAt,
      })
      .from(prospectOutreachQueueItems)
      .where(eq(prospectOutreachQueueItems.workspaceUserId, workspaceUserId))
      .orderBy(desc(prospectOutreachQueueItems.createdAt))
      .limit(20);
    outreachEvents = outreachRows.map((r) => ({
      id: r.id,
      type: "outreach",
      label: `Outreach ${r.queueStatus}`,
      description: null,
      createdAt: toIso(r.sentAt || r.createdAt),
      channel: r.selectedChannel,
      status: r.queueStatus,
    }));
  } catch {
    outreachEvents = [];
  }

  let campaignEvents: Array<{
    id: string;
    type: string;
    label: string;
    description: string | null;
    createdAt: string | null;
    status: string | null;
  }> = [];
  try {
    const campaignRows = await db
      .select({
        id: campaignEnrollments.id,
        status: campaignEnrollments.status,
        createdAt: campaignEnrollments.createdAt,
        campaignId: campaignEnrollments.campaignId,
      })
      .from(campaignEnrollments)
      .where(eq(campaignEnrollments.userId, workspaceUserId))
      .orderBy(desc(campaignEnrollments.createdAt))
      .limit(20);
    campaignEvents = campaignRows.map((r) => ({
      id: r.id,
      type: "campaign",
      label: "Campaign enrollment",
      description: r.campaignId ? `Campaign ${r.campaignId}` : null,
      createdAt: toIso(r.createdAt),
      status: r.status,
    }));
  } catch {
    campaignEvents = [];
  }

  return { searches: searchSummaries, events, outreachEvents, campaignEvents };
}

/** Pure helpers exported for unit tests. */
export const prospectAiQuotaHelpers = {
  startOfUtcMonth,
  resolveDiscoveryQuotaPeriodStartFromDates,
  getProspectAiMonthlyQuota,
  isProspectAiPlanEligible,
  prospectAiQuotaExceededUserMessage,
};

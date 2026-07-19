import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { SubscriptionPlan } from "@shared/schema";
import {
  campaignEnrollments,
  prospectAiActivations,
  prospectAiDiscoveryResults,
  prospectAiDiscoverySearches,
  prospectIntelligence,
  prospectOutreachQueueItems,
} from "@shared/schema";
import {
  PROSPECT_AI_DEFAULT_PROVIDER,
  PROSPECT_AI_IMPORT_PROVIDER,
  PROSPECT_AI_INTERNAL_TAG,
  getProspectAiMonthlyQuota,
  isProspectAiPlanEligible,
  type ProspectAiAiBrainStatus,
  type ProspectAiQuotaSnapshot,
  type ProspectAiStatusResponse,
} from "@shared/prospectAI";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { subscriptionService } from "../subscriptionService";
import { getBusinessProfileForUser } from "../businessProfileService";
import { getProspectDiscoveryProvider } from "./providers";
import type { ProspectDiscoveryProvider } from "./providers/types";
import { validateDiscoverInput } from "./normalize";
import {
  buildProspectDedupIndex,
  findProspectDuplicate,
} from "../prospectImport/prospectImportDedup";

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
      | "forbidden",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ProspectAiError";
  }
}

function startOfUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
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

export async function countMonthlyDiscoveryUsage(
  workspaceUserId: string,
  now = new Date(),
): Promise<number> {
  const since = startOfUtcMonth(now);
  const rows = await db
    .select({ total: count() })
    .from(prospectAiDiscoveryResults)
    .where(
      and(
        eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId),
        gte(prospectAiDiscoveryResults.createdAt, since),
      ),
    );
  return Number(rows[0]?.total ?? 0);
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
      "Prospect AI requires Starter or Pro. Upgrade to activate.",
      "upgrade_required",
      403,
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
      "Prospect AI requires Starter or Pro.",
      "upgrade_required",
      403,
    );
  }
  const activation = await getActivation(workspaceUserId);
  if (!activation || activation.status !== "active") {
    throw new ProspectAiError("Activate Prospect AI before discovering prospects.", "not_activated", 403);
  }
  const quota = await buildQuotaSnapshot(workspaceUserId, limits.plan);
  if (opts?.requireQuota !== false && quota.remaining <= 0) {
    throw new ProspectAiError(
      limits.plan === "pro"
        ? "You've used all of your monthly Prospect Discoveries. Your quota resets next month."
        : "You've used all of your monthly Prospect Discoveries. Upgrade to Pro for 500 Prospect Discoveries each month.",
      "quota_exceeded",
      429,
    );
  }
  return { plan: limits.plan, quota };
}

function mapResultRow(row: typeof prospectAiDiscoveryResults.$inferSelect) {
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
  };
}

export async function discoverProspects(
  workspaceUserId: string,
  body: unknown,
  provider?: ProspectDiscoveryProvider,
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
}> {
  const validated = validateDiscoverInput(body);
  if (!validated.ok) {
    throw new ProspectAiError(validated.error, "invalid_input", 400);
  }

  const { plan, quota } = await assertActivatedAndEligible(workspaceUserId);
  const discoveryProvider = provider ?? getProspectDiscoveryProvider();

  let prospects;
  try {
    const result = await discoveryProvider.discover({
      businessType: validated.businessType,
      location: validated.location,
      radiusKm: validated.radiusKm,
    });
    prospects = result.prospects;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery provider failed";
    // Never leak API keys if somehow present in error text.
    const safe = message.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]");
    throw new ProspectAiError(safe, "provider_unavailable", 502);
  }

  const capped = prospects.slice(0, quota.remaining);

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
          },
        })),
      )
      .returning();
  }

  const nextQuota = await buildQuotaSnapshot(workspaceUserId, plan);

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
  };
}

function buildContactNotes(row: typeof prospectAiDiscoveryResults.$inferSelect): string {
  const lines: string[] = [`Company: ${row.name}`];
  if (row.address) lines.push(`Address: ${row.address}`);
  if (row.website) lines.push(row.website.startsWith("http") ? row.website : `https://${row.website}`);
  if (row.businessType) lines.push(`Type: ${row.businessType}`);
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
): Promise<{ contactIds: string[]; sent: number }> {
  // Quota already consumed at discover time — do not block review handoff.
  await assertActivatedAndEligible(workspaceUserId, { requireQuota: false });

  if (!Array.isArray(resultIds) || resultIds.length === 0) {
    throw new ProspectAiError("resultIds must be a non-empty array", "invalid_input", 400);
  }
  const ids = [...new Set(resultIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new ProspectAiError("resultIds must be a non-empty array", "invalid_input", 400);
  }
  if (ids.length > 100) {
    throw new ProspectAiError("Too many resultIds (max 100)", "invalid_input", 400);
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

  const existingContacts = await storage.getContacts(workspaceUserId, 5000);
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

    const prospectMeta = {
      placeId: row.providerPlaceId,
      discoverySearchId: searchId,
      discoveryResultId: row.id,
      businessType: row.businessType,
      address: row.address,
      website: row.website,
      batchName: `Prospect AI: ${searchRows[0].businessType} in ${searchRows[0].location}`,
      importReason: "Local prospect discovery",
      importedAt: now.toISOString(),
      createdByImportJob: true,
      provider: PROSPECT_AI_IMPORT_PROVIDER,
    };

    if (contact && contact.userId === workspaceUserId) {
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
  return { contactIds: uniqueContactIds, sent: uniqueContactIds.length };
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
  getProspectAiMonthlyQuota,
  isProspectAiPlanEligible,
};

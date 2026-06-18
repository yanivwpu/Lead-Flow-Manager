/**
 * Agent page DB — settings, slug lookup, analytics, published listings.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import {
  aiBusinessKnowledge,
  inventoryListings,
  users,
  type InventoryListing,
} from "@shared/schema";
import { MATCHABLE_INVENTORY_STATUSES } from "@shared/inventory/inventoryListingSchema";
import { normalizeListingCompliance } from "@shared/inventory/inventoryListingCompliance";
import { canResolveIndexedPublicListing } from "@shared/inventory/publicListingPublication";
import { isProductionDevSeedGuardEnabled } from "@shared/inventory/inventoryDevSeedGuard";
import {
  EMPTY_AGENT_PAGE_ANALYTICS,
  normalizeAgentPageAnalytics,
  type AgentPageAnalytics,
  type AgentPageLeadCapture,
} from "@shared/agent/agentPageSchema";
import { canResolvePublicAgentPage } from "@shared/agent/publicAgentPage";
import { normalizeAgentPageSlug } from "@shared/agent/agentPageSlug";

function devSeedListingExcludeCondition() {
  if (!isProductionDevSeedGuardEnabled()) return null;
  return sql`${inventoryListings.providerListingId} not like 'dev-seed-%'`;
}

export type AgentPageKnowledgeRow = {
  userId: string;
  publishListingsPublicly: boolean;
  agentPageEnabled: boolean;
  agentPageSlug: string | null;
  agentPageUseCustomBio: boolean;
  agentPageBio: string | null;
  agentPageMarketArea: string | null;
  agentPagePreferredLeadCapture: string;
  agentPageShowHomeValueCta: boolean;
  agentPageAnalytics: AgentPageAnalytics;
  displayName: string | null;
  businessName: string | null;
  companyLogo: string | null;
  publicPhone: string | null;
  publicEmail: string | null;
  aboutText: string | null;
  avatarUrl: string | null;
};

export async function getAgentPageSettingsRow(userId: string): Promise<AgentPageKnowledgeRow | undefined> {
  const [row] = await db
    .select({
      userId: aiBusinessKnowledge.userId,
      publishListingsPublicly: aiBusinessKnowledge.publishListingsPublicly,
      agentPageEnabled: aiBusinessKnowledge.agentPageEnabled,
      agentPageSlug: aiBusinessKnowledge.agentPageSlug,
      agentPageUseCustomBio: aiBusinessKnowledge.agentPageUseCustomBio,
      agentPageBio: aiBusinessKnowledge.agentPageBio,
      agentPageMarketArea: aiBusinessKnowledge.agentPageMarketArea,
      agentPagePreferredLeadCapture: aiBusinessKnowledge.agentPagePreferredLeadCapture,
      agentPageShowHomeValueCta: aiBusinessKnowledge.agentPageShowHomeValueCta,
      agentPageAnalytics: aiBusinessKnowledge.agentPageAnalytics,
      displayName: aiBusinessKnowledge.displayName,
      businessName: aiBusinessKnowledge.businessName,
      companyLogo: aiBusinessKnowledge.companyLogo,
      publicPhone: aiBusinessKnowledge.publicPhone,
      publicEmail: aiBusinessKnowledge.publicEmail,
      aboutText: aiBusinessKnowledge.aboutText,
      avatarUrl: users.avatarUrl,
    })
    .from(aiBusinessKnowledge)
    .innerJoin(users, eq(aiBusinessKnowledge.userId, users.id))
    .where(eq(aiBusinessKnowledge.userId, userId))
    .limit(1);

  if (!row) return undefined;
  return {
    ...row,
    agentPageAnalytics: normalizeAgentPageAnalytics(row.agentPageAnalytics),
  };
}

export async function resolveAgentPageBySlug(slug: string): Promise<AgentPageKnowledgeRow | undefined> {
  const normalized = normalizeAgentPageSlug(slug);
  if (!normalized) return undefined;

  const [row] = await db
    .select({
      userId: aiBusinessKnowledge.userId,
      publishListingsPublicly: aiBusinessKnowledge.publishListingsPublicly,
      agentPageEnabled: aiBusinessKnowledge.agentPageEnabled,
      agentPageSlug: aiBusinessKnowledge.agentPageSlug,
      agentPageUseCustomBio: aiBusinessKnowledge.agentPageUseCustomBio,
      agentPageBio: aiBusinessKnowledge.agentPageBio,
      agentPageMarketArea: aiBusinessKnowledge.agentPageMarketArea,
      agentPagePreferredLeadCapture: aiBusinessKnowledge.agentPagePreferredLeadCapture,
      agentPageShowHomeValueCta: aiBusinessKnowledge.agentPageShowHomeValueCta,
      agentPageAnalytics: aiBusinessKnowledge.agentPageAnalytics,
      displayName: aiBusinessKnowledge.displayName,
      businessName: aiBusinessKnowledge.businessName,
      companyLogo: aiBusinessKnowledge.companyLogo,
      publicPhone: aiBusinessKnowledge.publicPhone,
      publicEmail: aiBusinessKnowledge.publicEmail,
      aboutText: aiBusinessKnowledge.aboutText,
      avatarUrl: users.avatarUrl,
    })
    .from(aiBusinessKnowledge)
    .innerJoin(users, eq(aiBusinessKnowledge.userId, users.id))
    .where(sql`lower(${aiBusinessKnowledge.agentPageSlug}) = ${normalized}`)
    .limit(1);

  if (!row) return undefined;
  const mapped: AgentPageKnowledgeRow = {
    ...row,
    agentPageAnalytics: normalizeAgentPageAnalytics(row.agentPageAnalytics),
  };
  if (!canResolvePublicAgentPage(mapped)) return undefined;
  return mapped;
}

export async function patchAgentPageSettings(
  userId: string,
  patch: {
    agentPageEnabled?: boolean;
    agentPageSlug?: string | null;
    agentPageUseCustomBio?: boolean;
    agentPageBio?: string | null;
    agentPageMarketArea?: string | null;
    agentPagePreferredLeadCapture?: AgentPageLeadCapture;
    agentPageShowHomeValueCta?: boolean;
  },
): Promise<AgentPageKnowledgeRow | undefined> {
  const set: Partial<typeof aiBusinessKnowledge.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.agentPageEnabled !== undefined) set.agentPageEnabled = patch.agentPageEnabled;
  if (patch.agentPageSlug !== undefined) {
    set.agentPageSlug = patch.agentPageSlug
      ? normalizeAgentPageSlug(patch.agentPageSlug)
      : null;
  }
  if (patch.agentPageUseCustomBio !== undefined) {
    set.agentPageUseCustomBio = patch.agentPageUseCustomBio;
  }
  if (patch.agentPageBio !== undefined) set.agentPageBio = patch.agentPageBio;
  if (patch.agentPageMarketArea !== undefined) set.agentPageMarketArea = patch.agentPageMarketArea;
  if (patch.agentPagePreferredLeadCapture !== undefined) {
    set.agentPagePreferredLeadCapture = patch.agentPagePreferredLeadCapture;
  }
  if (patch.agentPageShowHomeValueCta !== undefined) {
    set.agentPageShowHomeValueCta = patch.agentPageShowHomeValueCta;
  }

  const updated = await db
    .update(aiBusinessKnowledge)
    .set(set)
    .where(eq(aiBusinessKnowledge.userId, userId))
    .returning({ userId: aiBusinessKnowledge.userId });

  if (updated.length === 0) {
    await db.insert(aiBusinessKnowledge).values({ userId, ...set });
  }

  return getAgentPageSettingsRow(userId);
}

export type AgentPageAnalyticsEvent =
  | "page_view"
  | "listing_view"
  | "ask_about"
  | "schedule_showing"
  | "home_value";

const ANALYTICS_FIELD: Record<AgentPageAnalyticsEvent, keyof AgentPageAnalytics> = {
  page_view: "pageViews",
  listing_view: "listingViews",
  ask_about: "askAboutClicks",
  schedule_showing: "scheduleShowingClicks",
  home_value: "homeValueClicks",
};

export async function incrementAgentPageAnalytics(
  userId: string,
  event: AgentPageAnalyticsEvent,
): Promise<void> {
  const row = await getAgentPageSettingsRow(userId);
  if (!row) return;
  const field = ANALYTICS_FIELD[event];
  const next = {
    ...row.agentPageAnalytics,
    [field]: row.agentPageAnalytics[field] + 1,
  };
  await db
    .update(aiBusinessKnowledge)
    .set({ agentPageAnalytics: next, updatedAt: new Date() })
    .where(eq(aiBusinessKnowledge.userId, userId));
}

export async function fetchPublishedListingsForAgentPage(
  userId: string,
  limit = 200,
): Promise<InventoryListing[]> {
  const conditions = [
    eq(inventoryListings.userId, userId),
    eq(inventoryListings.publishPublicly, true),
    inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
  ];
  const devSeedExclude = devSeedListingExcludeCondition();
  if (devSeedExclude) conditions.push(devSeedExclude);

  const [workspace] = await db
    .select({ publishListingsPublicly: aiBusinessKnowledge.publishListingsPublicly })
    .from(aiBusinessKnowledge)
    .where(eq(aiBusinessKnowledge.userId, userId))
    .limit(1);

  if (!workspace?.publishListingsPublicly) return [];

  const rows = await db
    .select()
    .from(inventoryListings)
    .where(and(...conditions))
    .orderBy(desc(inventoryListings.syncedAt))
    .limit(limit);

  return rows
    .map((row) => ({
      ...row,
      listingCompliance: normalizeListingCompliance(row.listingCompliance),
    }))
    .filter((listing) =>
      canResolveIndexedPublicListing({
        workspacePublishListingsPublicly: true,
        listingPublishPublicly: true,
        status: listing.status,
        listingCompliance: listing.listingCompliance,
      }),
    );
}

export { EMPTY_AGENT_PAGE_ANALYTICS };

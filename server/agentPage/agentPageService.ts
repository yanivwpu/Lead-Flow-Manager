import type { AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";
import type { AgentPageListingCard, PublicAgentPageRenderInput } from "@shared/agent/agentPageTypes";
import { buildAgentPageUrl } from "@shared/agent/agentPageSlug";
import { resolveAgentPageBio, resolveAgentPageDisplayName } from "@shared/agent/agentPageProfile";
import { resolveAgentPageSocialUrls } from "@shared/agent/agentPageSocialUrls";
import { buildListingCanonicalShareUrl, pickPrimaryPhotoUrl } from "@shared/inventory/listingViewUrl";
import { formatListingPriceForComposer } from "@shared/inventory/inventoryComposerDraft";
import { canShowPublicStreetAddress } from "@shared/inventory/publicListingPublication";
import {
  resolveFlyerListingLabel,
  resolveFlyerSpecFields,
  type PublicListingFlyerListing,
} from "@shared/inventory/publicListingFlyer";
import { getCalendlyPublicSchedulingUrl, isUserCalendlyBookingConnected } from "../calendlyBookingConnected";
import { resolveRgeCustomerSchedulingUrl } from "../rgeCustomerSchedulingUrl";
import { storage } from "../storage";
import { getListingPublicationStats } from "../inventory/inventoryDb";
import {
  fetchPublishedListingsForAgentPage,
  getAgentPageSettingsRow,
  incrementAgentPageAnalytics,
  resolveAgentPageBySlug,
  type AgentPageKnowledgeRow,
} from "./agentPageDb";

function str(value: string | null | undefined): string {
  return (value || "").trim();
}

function mergeWidgetEnabled(widgetSettings: unknown): boolean {
  const ws = widgetSettings && typeof widgetSettings === "object"
    ? (widgetSettings as Record<string, unknown>)
    : {};
  return ws.enabled !== false;
}

export async function buildAgentPageSettingsResponse(
  userId: string,
  appOrigin: string,
): Promise<AgentPageSettingsResponse | undefined> {
  let row = await getAgentPageSettingsRow(userId);
  if (!row) {
    const user = await storage.getUser(userId);
    if (!user) return undefined;
    await storage.upsertAiBusinessKnowledge(userId, {});
    row = await getAgentPageSettingsRow(userId);
    if (!row) return undefined;
  }

  const scheduling = await resolveRgeCustomerSchedulingUrl(userId);
  const calendly = await isUserCalendlyBookingConnected(userId)
    ? await getCalendlyPublicSchedulingUrl(userId)
    : "";
  const schedulingUrl = calendly || scheduling.url || "";
  const user = await storage.getUser(userId);
  const widgetEnabled = mergeWidgetEnabled(user?.widgetSettings);
  const publicationStats = await getListingPublicationStats(userId);

  const businessProfileDisplayName = resolveAgentPageDisplayName(row, user?.name);
  const businessProfileAbout = str(row.aboutText);
  const resolvedBio = resolveAgentPageBio(row);
  const socialLinks = resolveAgentPageSocialUrls(row);

  return {
    agentPageEnabled: row.agentPageEnabled,
    agentPageSlug: row.agentPageSlug,
    agentPageUseCustomBio: row.agentPageUseCustomBio ?? false,
    agentPageBio: row.agentPageBio,
    agentPageMarketArea: row.agentPageMarketArea,
    agentPagePreferredLeadCapture: (row.agentPagePreferredLeadCapture as "webchat" | "email" | "phone") || "webchat",
    agentPageShowHomeValueCta: row.agentPageShowHomeValueCta,
    publishListingsPublicly: row.publishListingsPublicly,
    publicPageUrl:
      row.agentPageSlug && row.publishListingsPublicly && row.agentPageEnabled
        ? buildAgentPageUrl(row.agentPageSlug, appOrigin)
        : null,
    analytics: row.agentPageAnalytics,
    businessProfileDisplayName,
    businessProfileAbout,
    resolvedDisplayName: businessProfileDisplayName,
    resolvedBio,
    resolvedAvatarUrl: str(row.avatarUrl) || null,
    resolvedCompanyLogo: str(row.companyLogo) || null,
    resolvedBrokerageName: str(row.businessName),
    publicWebsite: socialLinks.websiteUrl,
    facebookUrl: socialLinks.facebookUrl,
    instagramUrl: socialLinks.instagramUrl,
    linkedinUrl: socialLinks.linkedinUrl,
    youtubeUrl: socialLinks.youtubeUrl,
    schedulingUrl,
    widgetEnabled,
    publishedOnAgentPage: publicationStats.publishedOnAgentPage,
    eligibleToPublish: publicationStats.eligibleToPublish,
    totalSynced: publicationStats.totalSynced,
    mlsEligible: publicationStats.mlsEligible,
    hiddenUnpublished: publicationStats.hiddenUnpublished,
    workspacePublishEnabled: publicationStats.workspacePublishEnabled,
  };
}

export type { AgentPageListingCard } from "@shared/agent/agentPageTypes";

export type PublicAgentPageData = PublicAgentPageRenderInput & {
  agent: AgentPageKnowledgeRow;
  pageUrl: string;
};

function listingToCard(
  listing: Awaited<ReturnType<typeof fetchPublishedListingsForAgentPage>>[number],
  appOrigin: string,
): AgentPageListingCard {
  const flyerListing: PublicListingFlyerListing = {
    id: listing.id,
    priceCents: listing.priceCents,
    beds: listing.beds != null ? Number(listing.beds) : null,
    baths: listing.baths != null ? Number(listing.baths) : null,
    squareFeet: listing.squareFeet,
    yearBuilt: listing.yearBuilt,
    hoaFeeCents: listing.hoaFeeCents,
    propertyType: listing.propertyType,
    propertySubtype: listing.propertySubtype,
    description: listing.description,
    features: Array.isArray(listing.features) ? listing.features.map(String) : [],
    photos: Array.isArray(listing.photos) ? (listing.photos as { url: string }[]) : [],
    addressLine1: listing.addressLine1,
    addressLine2: listing.addressLine2,
    city: listing.city,
    state: listing.state,
    zip: listing.zip,
    latitude: listing.latitude,
    longitude: listing.longitude,
    status: listing.status,
    providerListingId: listing.providerListingId,
    listingDetails: (listing.listingDetails || {}) as PublicListingFlyerListing["listingDetails"],
    listingCompliance: listing.listingCompliance,
  };

  const allowStreet = canShowPublicStreetAddress(listing.listingCompliance);
  const street = allowStreet
    ? [listing.addressLine1, listing.addressLine2].filter(Boolean).join(", ") || null
    : null;
  const cityState = [listing.city, listing.state].filter(Boolean).join(", ");
  const { sqft } = resolveFlyerSpecFields(flyerListing);
  const bedsNum = listing.beds != null ? Number(listing.beds) : null;
  const bathsNum = listing.baths != null ? Number(listing.baths) : null;
  const beds =
    bedsNum != null && Number.isFinite(bedsNum)
      ? `${bedsNum % 1 === 0 ? Math.round(bedsNum) : bedsNum} bed`
      : null;
  const baths =
    bathsNum != null && Number.isFinite(bathsNum)
      ? `${bathsNum % 1 === 0 ? Math.round(bathsNum) : bathsNum} bath`
      : null;
  const sqftNum = listing.squareFeet ?? null;

  return {
    id: listing.id,
    shareUrl: buildListingCanonicalShareUrl(
      { listingId: listing.id, publicSlug: listing.publicSlug },
      appOrigin,
    ),
    imageUrl: pickPrimaryPhotoUrl(flyerListing.photos),
    street,
    cityState,
    price: formatListingPriceForComposer(listing.priceCents) || "Price on request",
    priceCents: listing.priceCents ?? null,
    beds,
    baths,
    sqft,
    bedsNum: Number.isFinite(bedsNum) ? bedsNum : null,
    bathsNum: Number.isFinite(bathsNum) ? bathsNum : null,
    sqftNum,
    propertyType: listing.propertyType ?? null,
    status: listing.status === "coming_soon" ? "Coming Soon" : "Active",
    listingLabel: resolveFlyerListingLabel(flyerListing),
  };
}

export async function getPublicAgentPageData(
  slug: string,
  appOrigin: string,
): Promise<PublicAgentPageData | undefined> {
  const agent = await resolveAgentPageBySlug(slug);
  if (!agent) return undefined;

  const scheduling = await resolveRgeCustomerSchedulingUrl(agent.userId);
  const calendly = await isUserCalendlyBookingConnected(agent.userId)
    ? await getCalendlyPublicSchedulingUrl(agent.userId)
    : "";
  const user = await storage.getUser(agent.userId);
  const widgetEnabled = mergeWidgetEnabled(user?.widgetSettings);

  const listingsRaw = await fetchPublishedListingsForAgentPage(agent.userId);
  const listings = listingsRaw.map((l) => listingToCard(l, appOrigin));

  const displayName = resolveAgentPageDisplayName(agent, user?.name);
  const bio = resolveAgentPageBio(agent);
  const socialLinks = resolveAgentPageSocialUrls(agent);

  await incrementAgentPageAnalytics(agent.userId, "page_view");

  return {
    agent,
    pageUrl: buildAgentPageUrl(agent.agentPageSlug!, appOrigin),
    userId: agent.userId,
    agentPageSlug: agent.agentPageSlug || "",
    displayName,
    bio,
    marketArea: str(agent.agentPageMarketArea),
    brokerageName: str(agent.businessName),
    avatarUrl: str(agent.avatarUrl) || null,
    companyLogo: str(agent.companyLogo) || null,
    socialLinks,
    publicEmail: str(agent.publicEmail),
    publicPhone: str(agent.publicPhone),
    schedulingUrl: calendly || scheduling.url || "",
    widgetEnabled,
    preferredLeadCapture: (agent.agentPagePreferredLeadCapture as "webchat" | "email" | "phone") || "webchat",
    showHomeValueCta: agent.agentPageShowHomeValueCta,
    listings,
  };
}

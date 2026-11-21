import type { AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";
import type { PublicAgentPageRenderInput } from "@shared/agent/agentPageTypes";
import { buildAgentPageUrl } from "@shared/agent/agentPageSlug";
import { resolveAgentPageBio, resolveAgentPageDisplayName } from "@shared/agent/agentPageProfile";
import { resolveAgentPageSocialUrls } from "@shared/agent/agentPageSocialUrls";
import { AGENT_PAGE_BROWSE_PAGE_SIZE } from "@shared/agent/agentPageBrowseConstants";
import type { AgentPageInitialListingChip } from "@shared/agent/agentPageEmbed";
import { canResolvePublicAgentPage } from "@shared/agent/publicAgentPage";
import { hasAgentPagePublicationAccess } from "./agentPagePublication";
import {
  browseAgentPageListings,
  DEFAULT_AGENT_PAGE_BROWSE_FILTERS,
} from "./agentPageBrowseService";
import { getCalendlyPublicSchedulingUrl, isUserCalendlyBookingConnected } from "../calendlyBookingConnected";
import { resolveRgeCustomerSchedulingUrl } from "../rgeCustomerSchedulingUrl";
import { storage } from "../storage";
import { getListingPublicationStats } from "../inventory/inventoryDb";
import {
  getAgentPageSettingsRow,
  resolveAgentPageBySlug,
  type AgentPageKnowledgeRow,
} from "./agentPageDb";

export { inventoryListingToAgentPageCard } from "./agentPageListingCard";

function str(value: string | null | undefined): string {
  return (value || "").trim();
}

function mergeWidgetEnabled(widgetSettings: unknown): boolean {
  const ws = widgetSettings && typeof widgetSettings === "object"
    ? (widgetSettings as Record<string, unknown>)
    : {};
  return ws.enabled === true;
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
      row.agentPageSlug && canResolvePublicAgentPage(row) && await hasAgentPagePublicationAccess(userId)
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

export type PublicAgentPageLoadOptions = {
  embedMode?: boolean;
  hideChat?: boolean;
  profileOnly?: boolean;
  preview?: boolean;
  initialListingType?: AgentPageInitialListingChip;
};

export async function getPublicAgentPageData(
  slug: string,
  appOrigin: string,
  options: PublicAgentPageLoadOptions = {},
): Promise<PublicAgentPageData | undefined> {
  const agent = await resolveAgentPageBySlug(slug);
  return agent ? buildPublicAgentPageData(agent, appOrigin, options) : undefined;
}

export async function buildPublicAgentPageData(
  agent: AgentPageKnowledgeRow, appOrigin: string, options: PublicAgentPageLoadOptions,
): Promise<PublicAgentPageData> {
  const scheduling = options.preview ? undefined : await resolveRgeCustomerSchedulingUrl(agent.userId);
  const calendly = !options.preview && await isUserCalendlyBookingConnected(agent.userId)
    ? await getCalendlyPublicSchedulingUrl(agent.userId)
    : "";
  const user = await storage.getUser(agent.userId);
  const widgetEnabled = !options.preview && mergeWidgetEnabled(user?.widgetSettings);

  const initialListingType = options.initialListingType ?? "all";
  const browseFilters =
    initialListingType !== "all"
      ? { ...DEFAULT_AGENT_PAGE_BROWSE_FILTERS, listingType: initialListingType }
      : DEFAULT_AGENT_PAGE_BROWSE_FILTERS;

  const browse = agent.publishListingsPublicly && !options.profileOnly
    ? await browseAgentPageListings({
        userId: agent.userId,
        appOrigin,
        filters: browseFilters,
        limit: AGENT_PAGE_BROWSE_PAGE_SIZE,
      })
    : { listings: [], total: 0, hasMore: false };

  const displayName = resolveAgentPageDisplayName(agent, user?.name);
  const bio = resolveAgentPageBio(agent);
  const socialLinks = resolveAgentPageSocialUrls(agent);

  return {
    agent,
    pageUrl: buildAgentPageUrl(agent.agentPageSlug || "", appOrigin),
    userId: agent.userId,
    agentPageSlug: agent.agentPageSlug || "",
    displayName,
    bio,
    marketArea: str(agent.agentPageMarketArea),
    brokerageName: str(agent.businessName),
    avatarUrl: str(agent.avatarUrl) || null,
    companyLogo: str(agent.companyLogo) || null,
    socialLinks,
    publicPhone: str(agent.publicPhone),
    schedulingUrl: calendly || scheduling?.url || "",
    widgetEnabled,
    widgetPublicId: widgetEnabled ? await (async () => {
      try {
        const { getWidgetPublicIdForUser } = await import("../widgetIdentity");
        return await getWidgetPublicIdForUser(agent.userId);
      } catch {
        return "";
      }
    })() : "",
    preferredLeadCapture: (agent.agentPagePreferredLeadCapture as "webchat" | "email" | "phone") || "webchat",
    showHomeValueCta: agent.agentPageShowHomeValueCta,
    listings: browse.listings,
    browseTotal: browse.total,
    browseHasMore: browse.hasMore,
    browsePageSize: AGENT_PAGE_BROWSE_PAGE_SIZE,
    embedMode: options.embedMode ?? false,
    hideChat: options.embedMode === true && options.hideChat === true,
    initialListingType,
  };
}

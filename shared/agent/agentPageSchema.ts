import { z } from "zod";
import { agentPageSocialUrlsPatchSchema } from "./agentPageSocialUrls";

export const agentPageLeadCaptureSchema = z.enum(["webchat", "email", "phone"]);

export type AgentPageLeadCapture = z.infer<typeof agentPageLeadCaptureSchema>;

export const agentPageAnalyticsSchema = z.object({
  pageViews: z.number().int().nonnegative().default(0),
  listingViews: z.number().int().nonnegative().default(0),
  askAboutClicks: z.number().int().nonnegative().default(0),
  scheduleShowingClicks: z.number().int().nonnegative().default(0),
  homeValueClicks: z.number().int().nonnegative().default(0),
});

export type AgentPageAnalytics = z.infer<typeof agentPageAnalyticsSchema>;

export const EMPTY_AGENT_PAGE_ANALYTICS: AgentPageAnalytics = {
  pageViews: 0,
  listingViews: 0,
  askAboutClicks: 0,
  scheduleShowingClicks: 0,
  homeValueClicks: 0,
};

export function normalizeAgentPageAnalytics(raw: unknown): AgentPageAnalytics {
  const parsed = agentPageAnalyticsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...EMPTY_AGENT_PAGE_ANALYTICS };
}

export const agentPageSettingsPatchSchema = z
  .object({
    agentPageEnabled: z.boolean().optional(),
    agentPageSlug: z.string().max(80).optional().nullable(),
    agentPageUseCustomBio: z.boolean().optional(),
    agentPageBio: z.string().max(4000).optional().nullable(),
    agentPageMarketArea: z.string().max(500).optional().nullable(),
    agentPagePreferredLeadCapture: agentPageLeadCaptureSchema.optional(),
    agentPageShowHomeValueCta: z.boolean().optional(),
  })
  .merge(agentPageSocialUrlsPatchSchema);

export type AgentPageSettingsPatch = z.infer<typeof agentPageSettingsPatchSchema>;

export type AgentPageSettingsResponse = {
  agentPageEnabled: boolean;
  agentPageSlug: string | null;
  agentPageUseCustomBio: boolean;
  agentPageBio: string | null;
  agentPageMarketArea: string | null;
  agentPagePreferredLeadCapture: AgentPageLeadCapture;
  agentPageShowHomeValueCta: boolean;
  publishListingsPublicly: boolean;
  publicPageUrl: string | null;
  analytics: AgentPageAnalytics;
  /** From Business Profile — source of truth for public display name */
  businessProfileDisplayName: string;
  /** From Business Profile aboutText */
  businessProfileAbout: string;
  /** Resolved for public page render */
  resolvedDisplayName: string;
  resolvedBio: string;
  resolvedAvatarUrl: string | null;
  resolvedCompanyLogo: string | null;
  resolvedBrokerageName: string;
  publicWebsite: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
  schedulingUrl: string;
  widgetEnabled: boolean;
  publishedOnAgentPage: number;
  eligibleToPublish: number;
  totalSynced: number;
  mlsEligible: number;
  hiddenUnpublished: number;
  workspacePublishEnabled: boolean;
};

export const publicAgentLeadBodySchema = z.object({
  intent: z.enum(["message", "ask_about", "schedule_showing", "home_worth"]),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  message: z.string().max(4000).optional(),
  listingId: z.string().uuid().optional(),
  propertyAddress: z.string().max(500).optional(),
  listingUrl: z.string().url().max(500).optional(),
  source: z.string().max(120).optional(),
  timeline: z.string().max(120).optional(),
  reasonForSelling: z.string().max(1000).optional(),
});

export type PublicAgentLeadBody = z.infer<typeof publicAgentLeadBodySchema>;

export const publicAgentAnalyticsBodySchema = z.object({
  event: z.enum([
    "listing_view",
    "ask_about",
    "schedule_showing",
    "home_value",
  ]),
  listingId: z.string().uuid().optional(),
});

const optionalBrowseNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}, z.number().nonnegative().optional());

const optionalBrowsePropertyType = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return null;
  return value;
}, z.enum(["house", "condo", "townhouse", "multi_family", "land", "other"]).nullable());

export const publicAgentBrowseQuerySchema = z.object({
  listingType: z.enum(["all", "sale", "rent", "coming_soon"]).default("all"),
  location: z.string().max(200).optional(),
  minPrice: optionalBrowseNumber,
  maxPrice: optionalBrowseNumber,
  minBeds: optionalBrowseNumber,
  minBaths: optionalBrowseNumber,
  minSqft: optionalBrowseNumber,
  propertyType: optionalBrowsePropertyType,
  sort: z.enum(["newest", "price_desc", "price_asc"]).default("newest"),
  offset: z.preprocess((value) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }, z.number().int().nonnegative()),
  limit: z.preprocess((value) => {
    const n = Number(value ?? 24);
    if (!Number.isFinite(n) || n < 1) return 24;
    return Math.min(48, Math.floor(n));
  }, z.number().int().min(1).max(48)),
});

export type PublicAgentBrowseQuery = z.infer<typeof publicAgentBrowseQuerySchema>;

export type PublicAgentBrowseListingsResponse = {
  listings: import("./agentPageTypes").AgentPageListingCard[];
  html: string;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
};

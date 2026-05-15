/**
 * In-app Growth Engines marketplace metadata.
 * Add new rows here; wire `detailHref` when an engine ships. Backend install / gating stays on engine-specific routes + APIs.
 */
export type GrowthEngineCardStatus = "available" | "coming_soon";

/** How optional gallery pricing row behaves for coming-soon engines */
export type GrowthEngineGalleryPricingMode = "show" | "coming_soon" | "hidden";

export interface GrowthEngineCardModel {
  /** Lower sort values appear first in the gallery */
  sortOrder: number;
  slug: string;
  title: string;
  industry: string;
  /** Public URL under / (Vite `public/`). Omit for coming-soon placeholders. */
  image?: string | null;
  badges: string[];
  /** One-line value proposition */
  summary: string;
  /** Short bullets for gallery cards (max ~3 in UI) */
  benefits: string[];
  status: GrowthEngineCardStatus;
  /** In-app path when status === "available" */
  detailHref?: string;
  /** Primary gallery CTA label */
  ctaLabel: string;
  /**
   * When `status === "coming_soon"` and no `image`, picks gradient + icon for the media area.
   */
  placeholderKey?: "wellness" | "capital" | "trades" | "property";
  /** Displayed on gallery as “$199 one-time license” when set */
  oneTimePrice?: string | null;
  /** Shown on the RGE detail “Pricing & access” block (not on the gallery pricing strip). */
  subscriptionRequirementShort?: string | null;
  /** Detail page: headline monthly bundle, e.g. “$78/mo Pro + AI Brain” */
  monthlyRequirementLabel?: string | null;
  /** Detail page: breakdown line, e.g. “Pro $49/mo + AI Brain $29/mo” */
  monthlyRequirementBreakdown?: string | null;
  /** Detail page: checklist (pricing / access requirements) */
  requirements?: string[];
  /** Detail page: Meta / WhatsApp pass-through fees disclaimer */
  metaFeesNote?: string | null;
  /** Gallery second pricing line when oneTimePrice is not set yet */
  galleryPricingMode?: GrowthEngineGalleryPricingMode;
}

/** Use for “Back to Growth Engines” and any link that should open the Growth Engines tab on Templates */
export const TEMPLATES_GROWTH_ENGINES_TAB_PATH = "/app/templates?tab=growth-engines" as const;

export const GROWTH_ENGINE_CARDS: GrowthEngineCardModel[] = [
  {
    sortOrder: 10,
    slug: "realtor-growth-engine",
    title: "Realtor Growth Engine",
    industry: "Real estate",
    image: "/og/og-realtor-growth-engine.png",
    badges: ["Premium", "AI Automation", "WhatsApp-first"],
    summary: "Turn inbound chats into qualified tours — automatically.",
    benefits: [
      "Instant AI replies and qualification",
      "Booking intent + no-reply nurture",
      "Pipeline, tags, and tasks kept in sync",
    ],
    status: "available",
    detailHref: "/app/templates/realtor-growth-engine",
    ctaLabel: "View & Activate",
    oneTimePrice: "$199",
    subscriptionRequirementShort: "Requires Pro + AI Brain",
    monthlyRequirementLabel: "$78/mo Pro + AI Brain",
    monthlyRequirementBreakdown: "Pro $49/mo + AI Brain $29/mo",
    requirements: [
      "Pro plan required",
      "AI Brain required",
      "WhatsApp Business connected before activation",
    ],
    metaFeesNote: "WhatsApp / Meta messaging fees are billed separately by Meta.",
    galleryPricingMode: "show",
  },
  {
    sortOrder: 20,
    slug: "property-management-growth-engine",
    title: "Property Management Growth Engine",
    industry: "Property management",
    badges: ["Premium", "AI Automation", "WhatsApp-first"],
    summary:
      "Automate tenant communication, leasing follow-ups, maintenance requests, and more — directly through WhatsApp.",
    benefits: [
      "Property-aware AI context for every conversation",
      "Maintenance and lease renewal follow-ups",
      "System that runs part of their business",
    ],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "property",
    oneTimePrice: null,
    subscriptionRequirementShort: null,
    monthlyRequirementLabel: null,
    monthlyRequirementBreakdown: null,
    requirements: [],
    metaFeesNote: null,
    galleryPricingMode: "coming_soon",
  },
  {
    sortOrder: 30,
    slug: "med-spa-growth-engine",
    title: "Med Spa Growth Engine",
    industry: "Aesthetic & wellness",
    badges: ["Premium", "AI Automation"],
    summary: "Consultation booking, treatment routing, and VIP follow-up — tuned for clinics.",
    benefits: ["Lead capture across channels", "Treatment-intent scoring", "Retention sequences"],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "wellness",
    oneTimePrice: null,
    subscriptionRequirementShort: null,
    galleryPricingMode: "coming_soon",
  },
  {
    sortOrder: 40,
    slug: "investor-capital-engine",
    title: "Investor / Capital Raise Engine",
    industry: "Capital & syndication",
    badges: ["Premium", "AI Automation"],
    summary: "Screen investor interest, route decks, and keep diligence moving without dropping threads.",
    benefits: ["Investor qualification", "Document / call scheduling", "Long-cycle nurture"],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "capital",
    oneTimePrice: null,
    subscriptionRequirementShort: null,
    galleryPricingMode: "coming_soon",
  },
  {
    sortOrder: 50,
    slug: "home-services-engine",
    title: "Home Services Engine",
    industry: "Trades & field service",
    badges: ["Premium", "WhatsApp-first"],
    summary: "Dispatch-ready intake: job type, urgency, service area, and booked estimates from chat.",
    benefits: ["Job triage and routing", "Estimate booking", "Review / upsell follow-ups"],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "trades",
    oneTimePrice: null,
    subscriptionRequirementShort: null,
    galleryPricingMode: "coming_soon",
  },
];

export function sortGrowthEnginesCatalog(cards: GrowthEngineCardModel[]): GrowthEngineCardModel[] {
  return [...cards].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getGrowthEngineBySlug(slug: string): GrowthEngineCardModel | undefined {
  return GROWTH_ENGINE_CARDS.find((e) => e.slug === slug);
}

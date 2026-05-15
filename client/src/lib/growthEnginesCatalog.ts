/**
 * In-app Growth Engines marketplace metadata.
 * Add new rows here; wire `href` when an engine ships. Backend install / gating stays on engine-specific routes + APIs.
 */
export type GrowthEngineCardStatus = "available" | "coming_soon";

export interface GrowthEngineCardModel {
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
  placeholderKey?: "wellness" | "capital" | "trades";
}

export const GROWTH_ENGINE_CARDS: GrowthEngineCardModel[] = [
  {
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
  },
  {
    slug: "med-spa-growth-engine",
    title: "Med Spa Growth Engine",
    industry: "Aesthetic & wellness",
    badges: ["Premium", "AI Automation"],
    summary: "Consultation booking, treatment routing, and VIP follow-up — tuned for clinics.",
    benefits: ["Lead capture across channels", "Treatment-intent scoring", "Retention sequences"],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "wellness",
  },
  {
    slug: "investor-capital-engine",
    title: "Investor / Capital Raise Engine",
    industry: "Capital & syndication",
    badges: ["Premium", "AI Automation"],
    summary: "Screen investor interest, route decks, and keep diligence moving without dropping threads.",
    benefits: ["Investor qualification", "Document / call scheduling", "Long-cycle nurture"],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "capital",
  },
  {
    slug: "home-services-engine",
    title: "Home Services Engine",
    industry: "Trades & field service",
    badges: ["Premium", "WhatsApp-first"],
    summary: "Dispatch-ready intake: job type, urgency, service area, and booked estimates from chat.",
    benefits: ["Job triage and routing", "Estimate booking", "Review / upsell follow-ups"],
    status: "coming_soon",
    ctaLabel: "Coming soon",
    placeholderKey: "trades",
  },
];

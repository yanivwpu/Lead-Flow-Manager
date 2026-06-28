/** Public marketing screenshot paths (WebP in /images/screenshots/). */
export const MARKETING_SCREENSHOTS = {
  dashboard: "/images/screenshots/dashboard.webp",
  unifiedInbox: "/images/screenshots/unified-inbox.webp",
  aiCopilot: "/images/screenshots/ai-copilot.webp",
  leadScore: "/images/screenshots/lead-score.webp",
  propertyMatching: "/images/screenshots/property-matching.webp",
  propertyMatchDetails: "/images/screenshots/property-match-details.webp",
  automationWorkflows: "/images/screenshots/automation-workflows.webp",
  agentPageSettings: "/images/screenshots/agent-page-settings.webp",
  agentPagePublic: "/images/screenshots/agent-page-public.webp",
  inventorySource: "/images/screenshots/inventory-source.webp",
  inventoryHealth: "/images/screenshots/inventory-health.webp",
  embeddedSignup: "/images/screenshots/embedded-signup.webp",
  connectWhatsapp: "/images/screenshots/connect-whatsapp.webp",
  channels: "/images/screenshots/channels.webp",
  metaBusinessSelection: "/images/screenshots/meta-business-selection.webp",
} as const;

export type MarketingScreenshotKey = keyof typeof MARKETING_SCREENSHOTS;

export type MarketingScreenshotMeta = {
  src: string;
  alt: string;
  caption?: string;
  title?: string;
  figure?: number;
  width?: number;
  height?: number;
};

export function screenshot(
  key: MarketingScreenshotKey,
  alt: string,
  options?: Omit<MarketingScreenshotMeta, "src" | "alt">,
): MarketingScreenshotMeta {
  return { src: MARKETING_SCREENSHOTS[key], alt, ...options };
}

/** Pre-captioned screenshots for SEO pages and Help Center. */
export const S = {
  unifiedInbox: screenshot("unifiedInbox", "WhachatCRM unified inbox with Messenger conversation and AI property matches", {
    caption:
      "A buyer sends a message, AI qualifies the lead, searches MLS inventory, and surfaces matching listings in the inbox.",
  }),
  leadScore: screenshot("leadScore", "AI Copilot lead score and customer insights panel", {
    caption:
      "AI extracts budget, property type, bedrooms, bathrooms, neighborhoods, and timeline — then updates lead score automatically.",
  }),
  propertyMatchDetails: screenshot("propertyMatchDetails", "AI property recommendation modal with listing details", {
    caption:
      "AI explains why a listing matches preferred location, budget, bedrooms, and lifestyle criteria.",
  }),
  propertyMatching: screenshot("propertyMatching", "Inventory matches ranked in the inbox sidebar", {
    caption: "AI property matching ranks listings by area, budget, and property type inside the conversation.",
  }),
  automationWorkflows: screenshot("automationWorkflows", "Active automation workflows in Realtor Growth Engine", {
    caption:
      "Active automation workflows running inside the Realtor Growth Engine — follow-up sequences launch when leads qualify.",
  }),
  agentPagePublic: screenshot("agentPagePublic", "Public Agent Page settings in WhachatCRM", {
    caption: "Public Agent Page used for SEO, lead capture, market areas, and embeddable MLS listing widgets.",
  }),
  agentPageSettings: screenshot("agentPageSettings", "Agent Page market area and profile link settings", {
    caption: "Agent Page branding with market/service areas and social profile links for public SEO pages.",
  }),
  inventorySource: screenshot("inventorySource", "MLS Grid inventory source connection settings", {
    caption:
      "Bridge Interactive and MLS Grid inventory synchronization powering AI property matching and recurring listing updates.",
  }),
  inventoryHealth: screenshot("inventoryHealth", "AI Qualification, CRM pipeline, Agent Page, and inventory status", {
    caption: "Connected inventory, live agent page, and AI qualification status at a glance.",
  }),
  aiCopilot: screenshot("aiCopilot", "AI Copilot sidebar with lead score and recommendations", {
    caption: "AI Copilot summarizes conversations, scores leads, and recommends the next best action.",
  }),
  embeddedSignup: screenshot("embeddedSignup", "Meta embedded WhatsApp signup flow", {
    caption: "Connect WhatsApp through Meta embedded signup without manual API tokens.",
  }),
  connectWhatsapp: screenshot("connectWhatsapp", "Connect WhatsApp channel in WhachatCRM", {
    caption: "Launch WhatsApp Cloud API setup from channel settings.",
  }),
  channels: screenshot("channels", "Communication channel settings in WhachatCRM", {
    caption: "Connect WhatsApp, Messenger, Instagram, and other channels from Settings.",
  }),
  metaBusinessSelection: screenshot("metaBusinessSelection", "Meta business asset selection during WhatsApp signup", {
    caption: "Select your Meta business portfolio and WhatsApp Business Account during embedded signup.",
  }),
  dashboard: screenshot("dashboard", "WhachatCRM dashboard overview", {
    caption: "Dashboard with inbox, automations, and channel health at a glance.",
  }),
} as const;

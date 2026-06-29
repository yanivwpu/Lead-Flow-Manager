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
  embeddedSignupMeta: "/images/screenshots/embedded-signup-meta.webp",
  automationTemplateCards: "/images/screenshots/automation-template-cards.webp",
  connectWhatsapp: "/images/screenshots/connect-whatsapp.webp",
  channels: "/images/screenshots/channels.webp",
  metaBusinessSelection: "/images/screenshots/meta-business-selection.webp",
} as const;

export type MarketingScreenshotKey = keyof typeof MARKETING_SCREENSHOTS;

/** Native pixel dimensions — never display wider than these values. */
export const SCREENSHOT_DIMENSIONS: Record<
  MarketingScreenshotKey,
  { width: number; height: number }
> = {
  unifiedInbox: { width: 862, height: 595 },
  leadScore: { width: 280, height: 445 },
  aiCopilot: { width: 280, height: 445 },
  propertyMatching: { width: 862, height: 595 },
  propertyMatchDetails: { width: 625, height: 579 },
  automationWorkflows: { width: 1024, height: 509 },
  agentPageSettings: { width: 367, height: 585 },
  agentPagePublic: { width: 561, height: 568 },
  inventorySource: { width: 843, height: 427 },
  inventoryHealth: { width: 297, height: 567 },
  embeddedSignup: { width: 460, height: 593 },
  embeddedSignupMeta: { width: 561, height: 601 },
  automationTemplateCards: { width: 327, height: 444 },
  connectWhatsapp: { width: 460, height: 312 },
  channels: { width: 460, height: 257 },
  metaBusinessSelection: { width: 460, height: 610 },
  dashboard: { width: 704, height: 384 },
};

export type MarketingScreenshotSize = "hero" | "content" | "compact";

export type MarketingScreenshotMeta = {
  src: string;
  alt: string;
  caption?: string;
  title?: string;
  figure?: number;
  width?: number;
  height?: number;
  /** Display tier — caps width without upscaling beyond native pixels. */
  size?: MarketingScreenshotSize;
};

export function screenshot(
  key: MarketingScreenshotKey,
  alt: string,
  options?: Omit<MarketingScreenshotMeta, "src" | "alt">,
): MarketingScreenshotMeta {
  const dims = SCREENSHOT_DIMENSIONS[key];
  return {
    src: MARKETING_SCREENSHOTS[key],
    alt,
    width: dims.width,
    height: dims.height,
    ...options,
  };
}

/** Pre-captioned screenshots for SEO pages and Help Center. */
export const S = {
  unifiedInbox: screenshot("unifiedInbox", "WhachatCRM unified inbox with Messenger conversation and AI property matches", {
    size: "content",
    caption:
      "A buyer sends a message, AI qualifies the lead, searches MLS inventory, and surfaces matching listings in the inbox.",
  }),
  leadScore: screenshot("leadScore", "AI Copilot lead score and customer insights panel", {
    size: "compact",
    caption:
      "AI extracts budget, property type, bedrooms, bathrooms, neighborhoods, and timeline — then updates lead score automatically.",
  }),
  propertyMatchDetails: screenshot("propertyMatchDetails", "AI property recommendation modal with listing details", {
    size: "content",
    caption:
      "AI explains why a listing matches preferred location, budget, bedrooms, and lifestyle criteria.",
  }),
  propertyMatching: screenshot("propertyMatching", "Inventory matches ranked in the inbox sidebar", {
    size: "content",
    caption: "AI property matching ranks listings by area, budget, and property type inside the conversation.",
  }),
  automationWorkflows: screenshot("automationWorkflows", "Active automation workflows in Realtor Growth Engine", {
    size: "content",
    caption:
      "Active automation workflows running inside the Realtor Growth Engine — follow-up sequences launch when leads qualify.",
  }),
  agentPagePublic: screenshot("agentPagePublic", "Public Agent Page settings in WhachatCRM", {
    size: "content",
    caption: "Public Agent Page used for SEO, lead capture, market areas, and embeddable MLS listing widgets.",
  }),
  agentPageSettings: screenshot("agentPageSettings", "Agent Page market area and profile link settings", {
    size: "compact",
    caption: "Agent Page branding with market/service areas and social profile links for public SEO pages.",
  }),
  inventorySource: screenshot("inventorySource", "MLS Grid inventory source connection settings", {
    size: "content",
    caption:
      "Bridge Interactive and MLS Grid inventory synchronization powering AI property matching and recurring listing updates.",
  }),
  inventoryHealth: screenshot("inventoryHealth", "AI Qualification, CRM pipeline, Agent Page, and inventory status", {
    size: "compact",
    caption: "Connected inventory, live agent page, and AI qualification status at a glance.",
  }),
  aiCopilot: screenshot("aiCopilot", "AI Copilot sidebar with lead score and recommendations", {
    size: "compact",
    caption: "AI Copilot summarizes conversations, scores leads, and recommends the next best action.",
  }),
  embeddedSignup: screenshot("embeddedSignup", "Meta embedded WhatsApp signup flow", {
    size: "content",
    caption: "Connect WhatsApp through Meta embedded signup without manual API tokens.",
  }),
  embeddedSignupMeta: screenshot("embeddedSignupMeta", "Meta Facebook Login for Business connecting to WhachatCRM", {
    size: "content",
    caption: "Official Meta embedded signup connects a client's WhatsApp Business Account to WhachatCRM.",
  }),
  automationTemplateCards: screenshot(
    "automationTemplateCards",
    "Abandoned Cart Recovery and Limited-Time Offers automation templates",
    {
      size: "compact",
      caption: "Preset ecommerce templates including Abandoned Cart Recovery and customer retention sequences.",
    },
  ),
  connectWhatsapp: screenshot("connectWhatsapp", "Connect WhatsApp channel in WhachatCRM", {
    size: "content",
    caption: "Launch WhatsApp Cloud API setup from channel settings.",
  }),
  channels: screenshot("channels", "Communication channel settings in WhachatCRM", {
    size: "content",
    caption: "Connect WhatsApp, Messenger, Instagram, and other channels from Settings.",
  }),
  metaBusinessSelection: screenshot("metaBusinessSelection", "Meta business asset selection during WhatsApp signup", {
    size: "content",
    caption: "Select your Meta business portfolio and WhatsApp Business Account during embedded signup.",
  }),
  dashboard: screenshot("dashboard", "WhachatCRM dashboard overview", {
    size: "content",
    caption: "Dashboard with inbox, automations, and channel health at a glance.",
  }),
} as const;

/** Max display width (px) per tier — always clamped to native width. */
export const SCREENSHOT_SIZE_CAP: Record<MarketingScreenshotSize, number> = {
  hero: 900,
  content: 640,
  compact: 380,
};

export function screenshotDisplayWidth(
  nativeWidth: number,
  size: MarketingScreenshotSize = "content",
): number {
  return Math.min(nativeWidth, SCREENSHOT_SIZE_CAP[size]);
}

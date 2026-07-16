/**
 * Shared types + WhachatCRM capability rows for competitor alternative pages.
 * Keep URLs stable — only content depth and accuracy change.
 *
 * Capability claims must match PLAN_LIMITS in shared/schema.ts and live Pricing.
 */

export type CompareCell = "yes" | "partial" | "no" | string;

export type FeatureCompareRow = {
  category: string;
  feature: string;
  whachat: CompareCell;
  /** Competitor column — filled per page */
  competitor: CompareCell;
};

export type TitleDesc = { title: string; description: string };

export type FaqItem = { question: string; answer: string };

export type RelatedLink = { href: string; label: string };

export type ProductScreenshot = {
  src: string;
  alt: string;
  caption: string;
};

export type CompetitorAlternativeContent = {
  slug: string;
  competitorName: string;
  meta: {
    title: string;
    description: string;
    keywords: string;
    h1: string;
  };
  heroEyebrow: string;
  heroLead: string;
  /** 2–4 sentence buying-guide summary under the hero. */
  quickSummary: string;
  whoFor: string[];
  competitorGoodWhen: string[];
  competitorStrengths: TitleDesc[];
  competitorLimitations: TitleDesc[];
  whachatBetterWhen: string[];
  /** Extra competitor-specific advantages beyond WHACHAT_PLATFORM_ADVANTAGES. */
  advantages: TitleDesc[];
  /** Competitor-specific matrix (Whachat column already set). */
  matrix: FeatureCompareRow[];
  migrationSteps: string[];
  pricingNotes: {
    competitorSummary: string;
    whachatSummary: string;
  };
  freeVsPaid: {
    freeHighlights: string[];
    paidHighlights: string[];
  };
  faqs: FaqItem[];
  recommendation: string;
  relatedLinks: RelatedLink[];
  screenshots?: ProductScreenshot[];
};

export const PRICING_DISCLAIMER =
  "Competitor pricing and plan limits may change. Verify current details on the provider's official website before purchasing. Meta may update WhatsApp pricing independently. WhachatCRM does not add its own per-message markup on top of Meta's official charges.";

/** Soft competitor cells when a claim is not independently verified. */
export const CHECK_PACKAGING = "Check current packaging";
export const VARIES_BY_PLAN = "Varies by plan";
export const NOT_CLEARLY_DISCLOSED = "Not clearly disclosed";

/** Current WhachatCRM UI — used on comparison pages (alt text SEO + trust). */
export const DEFAULT_COMPARISON_SCREENSHOTS: ProductScreenshot[] = [
  {
    src: "/images/screenshots/unified-inbox.webp",
    alt: "WhachatCRM Unified Inbox showing WhatsApp and multi-channel conversations",
    caption: "Unified Inbox across WhatsApp, Messenger, Instagram, Email, and web chat",
  },
  {
    src: "/images/screenshots/embedded-signup.webp",
    alt: "WhachatCRM Meta Embedded Signup for WhatsApp Cloud API onboarding",
    caption: "Meta Embedded Signup — native WhatsApp Cloud API onboarding (Twilio not required)",
  },
  {
    src: "/images/screenshots/channels.webp",
    alt: "WhachatCRM channel connections including WhatsApp Messenger Instagram Email and web chat",
    caption: "Connect channels without upgrading solely to unlock another messaging pipe",
  },
  {
    src: "/images/screenshots/ai-copilot.webp",
    alt: "WhachatCRM AI Assist suggesting replies in the conversation timeline",
    caption: "AI Assist on Starter/Pro; optional AI Brain add-on for deeper intelligence",
  },
  {
    src: "/images/screenshots/automation-template-cards.webp",
    alt: "WhachatCRM preset automation templates for chatbots and workflows on Starter and Pro",
    caption: "Chatbot + preset automation templates included on Starter and Pro",
  },
  {
    src: "/images/screenshots/dashboard.webp",
    alt: "WhachatCRM workspace overview for conversations CRM and team activity",
    caption: "CRM workspace with conversation limits, pipeline, and team collaboration",
  },
];

/** Core advantages explained — reuse across pages. Must match production gating. */
export const WHACHAT_PLATFORM_ADVANTAGES: TitleDesc[] = [
  {
    title: "Channels without channel paywalls",
    description:
      "WhatsApp, Facebook Messenger, Instagram Messaging, Email (Gmail), SMS (via connected providers), Telegram, and the live web chat widget can be connected without forcing an upgrade solely to unlock another messaging channel. You pay for capacity, automation, and AI — not for each pipe.",
  },
  {
    title: "Meta Embedded Signup — Twilio not required",
    description:
      "WhachatCRM onboards WhatsApp through Meta Embedded Signup and the WhatsApp Cloud API. Twilio is optional for legacy setups only, so SMBs are not forced into a Twilio-dependent onboarding path.",
  },
  {
    title: "No WhachatCRM markup on Meta conversation fees",
    description:
      "Meta may update WhatsApp pricing independently. WhachatCRM does not add its own per-message markup on top of Meta's official charges — the subscription covers inbox, CRM, and product features.",
  },
  {
    title: "Unlimited users on Pro",
    description:
      "Pro ($49/mo) includes unlimited team members so sales, support, and marketing can collaborate in one inbox without buying extra seats. Starter includes up to 3 users; Free is single-user.",
  },
  {
    title: "Chatbot and templates without hiring developers",
    description:
      "Starter and Pro include the visual chatbot / Flow Builder plus ready-made automation templates so SMBs can launch FAQs, routing, and nurture flows without hiring a developer for day one. These are not included on Free.",
  },
  {
    title: "Unified Inbox with Email beside WhatsApp",
    description:
      "One timeline per contact across WhatsApp, Messenger, Instagram, Email, and web chat — with notes, tags, and pipeline — instead of separate channel inboxes and a disconnected mailbox.",
  },
  {
    title: "Shopify and GoHighLevel on paid plans",
    description:
      "Starter+ unlocks the Integrations page: Shopify can sync new orders and customers into inbox context; GoHighLevel (LeadConnector) supports contact, message, and pipeline sync. Calendly booking integration is also available on Starter+.",
  },
  {
    title: "AI Assist with optional AI Brain",
    description:
      "Starter includes AI Assist Basic; Pro includes AI Assist Enhanced. An optional AI Brain add-on ($29/mo) unlocks deeper memory, scoring, and Growth Engine intelligence — including Realtor Growth Engine eligibility (Pro + AI Brain).",
  },
];

/**
 * Buyer-focused comparison matrix.
 * Whachat cells reflect production PLAN_LIMITS / Pricing — not aspirational roadmap.
 */
export const WHACHAT_MATRIX_BASE: Array<{
  category: string;
  feature: string;
  whachat: CompareCell;
}> = [
  // Channels
  { category: "Channels", feature: "WhatsApp included", whachat: "yes" },
  { category: "Channels", feature: "Facebook Messenger included", whachat: "yes" },
  { category: "Channels", feature: "Instagram Messaging included", whachat: "yes" },
  { category: "Channels", feature: "Email inbox included (Gmail OAuth)", whachat: "yes" },
  { category: "Channels", feature: "Web chat widget", whachat: "yes" },
  { category: "Channels", feature: "Channels without per-channel upsell", whachat: "yes" },
  // Onboarding
  { category: "WhatsApp onboarding", feature: "Meta Embedded Signup / Cloud API onboarding", whachat: "yes" },
  { category: "WhatsApp onboarding", feature: "Twilio required for WhatsApp", whachat: "no" },
  // Inbox & CRM
  { category: "Inbox & CRM", feature: "Unified multi-channel inbox", whachat: "yes" },
  { category: "Inbox & CRM", feature: "CRM / contact management", whachat: "yes" },
  { category: "Inbox & CRM", feature: "Team collaboration / shared inbox", whachat: "yes" },
  // Automation
  { category: "Automation", feature: "Chatbot / flow builder", whachat: "Starter+" },
  { category: "Automation", feature: "Ready-made automation templates", whachat: "Starter+" },
  { category: "Automation", feature: "Workflow builder", whachat: "Starter+" },
  // AI
  { category: "AI", feature: "AI Assist / Copilot", whachat: "Starter+" },
  { category: "AI", feature: "AI Brain (optional add-on)", whachat: "$29/mo on Starter/Pro" },
  // Integrations
  { category: "Integrations", feature: "Shopify integration (orders/customers → inbox)", whachat: "Starter+" },
  { category: "Integrations", feature: "GoHighLevel integration", whachat: "Starter+" },
  { category: "Integrations", feature: "Calendly booking integration", whachat: "Starter+" },
  // Vertical
  { category: "Growth products", feature: "Realtor Growth Engine", whachat: "Pro + AI Brain" },
  { category: "Growth products", feature: "Conversation / template analytics", whachat: "partial" },
  // Team & pricing philosophy
  { category: "Team & pricing", feature: "Included users", whachat: "Free 1 · Starter 3 · Pro unlimited" },
  { category: "Team & pricing", feature: "Unlimited users on Pro", whachat: "yes" },
  { category: "Team & pricing", feature: "Additional seat charges on Pro", whachat: "no" },
  { category: "Team & pricing", feature: "Free plan available", whachat: "yes" },
  { category: "Team & pricing", feature: "Entry-level paid pricing", whachat: "Starter $19/mo" },
  { category: "Team & pricing", feature: "Pro subscription", whachat: "$49/mo" },
  { category: "Team & pricing", feature: "Cost predictability as team grows", whachat: "High (unlimited Pro seats)" },
  { category: "Team & pricing", feature: "Platform per-message markup on Meta", whachat: "no" },
  { category: "Team & pricing", feature: "Meta fees passed through without WhachatCRM markup", whachat: "yes" },
  { category: "Buying fit", feature: "Technical skill required", whachat: "Low–medium (self-serve)" },
  { category: "Buying fit", feature: "Best fit", whachat: "SMBs & agencies needing inbox + CRM" },
  { category: "Buying fit", feature: "Migration assistance", whachat: "Self-serve + docs; parallel-run recommended" },
];

export function withCompetitorMatrix(
  competitorCells: Record<string, CompareCell>,
): FeatureCompareRow[] {
  return WHACHAT_MATRIX_BASE.map((row) => ({
    category: row.category,
    feature: row.feature,
    whachat: row.whachat,
    competitor: competitorCells[row.feature] ?? CHECK_PACKAGING,
  }));
}

export const DEFAULT_COMPARISON_RELATED: RelatedLink[] = [
  { href: "/wati-alternative", label: "WATI Alternative" },
  { href: "/manychat-alternative", label: "ManyChat Alternative" },
  { href: "/interakt-alternative", label: "Interakt Alternative" },
  { href: "/respond-io-alternative", label: "Respond.io Alternative" },
  { href: "/waba360-alternative", label: "360dialog Alternative" },
  { href: "/zoko-alternative", label: "Zoko Alternative" },
  { href: "/pabbly-alternative", label: "Pabbly Alternative" },
  { href: "/best-whatsapp-crm-2026", label: "Best WhatsApp CRM 2026" },
  { href: "/whatsapp-crm", label: "WhatsApp CRM guide" },
  { href: "/unified-inbox", label: "Unified Inbox" },
  { href: "/pricing", label: "Pricing" },
  { href: "/auth", label: "Start free" },
];

export function relatedLinksExcluding(slug: string): RelatedLink[] {
  return DEFAULT_COMPARISON_RELATED.filter((link) => link.href !== slug);
}

export const DEFAULT_MIGRATION_STEPS = [
  "Export contacts, tags, and template catalogs from your current tool where possible.",
  "Create a WhachatCRM Free account and invite teammates only after you know which plan you need (Free = 1 user).",
  "Connect WhatsApp with Meta Embedded Signup (Cloud API). Twilio is not required for new setups.",
  "Connect Messenger, Instagram (via Meta/Facebook Page), Gmail, and web chat if those channels matter.",
  "On Starter or Pro, rebuild critical chatbots and install preset automation templates.",
  "On Starter+, connect Shopify, GoHighLevel, or Calendly from Integrations if you use those systems.",
  "Parallel-run for a few days: route a share of conversations to WhachatCRM and compare response time and context.",
  "Cut over templates and team login once the Unified Inbox matches your daily workflow.",
];

export const DEFAULT_FREE_VS_PAID = {
  freeHighlights: [
    "Free forever: Unified Inbox, basic CRM, pipeline/tasks, and channel connect (WhatsApp, Messenger, Instagram, Email, web chat)",
    "50 active conversations · 1 user · 1 WhatsApp number",
    "Validate workflows before paying — no credit card required to start",
    "Chatbot, automation templates, Integrations (Shopify/GHL/Calendly), and AI are not included on Free",
  ],
  paidHighlights: [
    "Starter ($19/mo): up to 3 users, chatbot + Flow Builder, basic automations & templates, Integrations page, AI Assist Basic",
    "Pro ($49/mo): unlimited users, higher conversation capacity, AI Assist Enhanced, advanced automations",
    "Optional AI Brain add-on ($29/mo) on Starter or Pro for deeper intelligence and Growth Engine eligibility",
    "Realtor Growth Engine requires Pro + AI Brain (specialized vertical — not a Free/Starter default)",
    "0% WhachatCRM markup on Meta WhatsApp conversation fees — Meta may change its rates independently",
  ],
};

/** Shared FAQs aligned with production gating. */
export function sharedComparisonFaqs(competitorName: string): FaqItem[] {
  return [
    {
      question: `Is WhachatCRM a complete ${competitorName} alternative?`,
      answer: `For many SMBs, yes — if you need a Unified Inbox, CRM context, Meta Embedded Signup, Starter+ chatbot/templates, and transparent Meta fee pass-through. ${competitorName} may still fit better for niche workflows it specializes in; use the matrix on this page to decide.`,
    },
    {
      question: "Does WhachatCRM use WhatsApp Cloud API without requiring Twilio?",
      answer:
        "Yes. New WhatsApp connections use Meta Embedded Signup and the WhatsApp Cloud API. Twilio remains optional only for legacy setups — it is not required to get started.",
    },
    {
      question: "Do you add markup on Meta WhatsApp conversation fees?",
      answer:
        "No. Meta may update WhatsApp pricing independently. WhachatCRM does not add its own per-message markup on top of Meta's official charges. The subscription covers the product (inbox, CRM, automation, AI).",
    },
    {
      question: "Which channels are included?",
      answer:
        "You can connect WhatsApp, Facebook Messenger, Instagram Messaging, Email (Gmail OAuth), SMS (via connected providers), Telegram, and the web chat widget without upgrading solely to unlock another channel. Conversation capacity still follows your plan limits.",
    },
    {
      question: "Is the chatbot free?",
      answer:
        "The visual chatbot / Flow Builder and preset automation templates are included on Starter ($19/mo) and Pro ($49/mo) — not on the Free plan. Free is for validating inbox and CRM workflows before you upgrade.",
    },
    {
      question: "Are users unlimited?",
      answer:
        "Unlimited users are included on Pro only. Starter includes up to 3 users; Free is 1 user. That is why growing sales + support teams often move to Pro to avoid seat packs.",
    },
    {
      question: "Does WhachatCRM integrate with Shopify?",
      answer:
        "Yes on Starter and Pro. Shopify integration can bring new orders and customers into inbox context. Ecommerce automation templates are available on paid plans — confirm live webhook options in-product for your workflow.",
    },
    {
      question: "Does WhachatCRM work with GoHighLevel?",
      answer:
        "Yes on Starter and Pro via the Integrations page (LeadConnector OAuth) for contact, message, and pipeline sync. Always verify the latest sync scope in Settings → Integrations.",
    },
    {
      question: "What about AI Brain and Realtor Growth Engine?",
      answer:
        "AI Assist is included on Starter (Basic) and Pro (Enhanced). AI Brain is an optional $29/mo add-on. Realtor Growth Engine is a specialized product that requires Pro + AI Brain — it is not included on Free or as a default Starter feature.",
    },
    {
      question: "How hard is migration?",
      answer: `Most teams export contacts and templates from ${competitorName}, reconnect WhatsApp via Embedded Signup, rebuild critical bots on Starter/Pro from templates, then parallel-run for a few days before full cutover. See the migration steps on this page.`,
    },
  ];
}

export const BEST_WHATSAPP_CRM_2026_META = {
  title: "Best WhatsApp CRM in 2026 | Omnichannel CRM Comparison",
  description:
    "Compare the best WhatsApp CRM platforms in 2026 and learn why businesses are moving toward omnichannel inboxes with AI, automation, Shopify support, and team collaboration.",
  keywords:
    "best WhatsApp CRM 2026, best CRM for WhatsApp, WhatsApp CRM comparison, omnichannel CRM platform, WhatsApp CRM vs omnichannel CRM",
  h1: "Best WhatsApp CRM in 2026: Why Businesses Are Choosing Omnichannel CRM Platforms",
} as const;

export const HERO_CHANNEL_PILLS = [
  "WhatsApp",
  "Messenger",
  "Instagram",
  "Email / Gmail",
  "SMS",
  "Website chat",
  "Automation",
  "AI Assist",
  "Team inbox",
] as const;

export const WHATSAPP_ONLY_PAIN_POINTS = [
  {
    title: "Customers message everywhere",
    description:
      "Leads rarely stay on one app. Teams that only manage WhatsApp still miss conversations on Instagram, Messenger, SMS, and web chat.",
  },
  {
    title: "One shared inbox matters",
    description:
      "Without a unified workspace, handoffs break, duplicate replies happen, and managers lose visibility into who owns each lead.",
  },
  {
    title: "Manual follow-up loses deals",
    description:
      "Spreadsheets and memory-based reminders do not scale. Missed follow-ups are one of the biggest hidden costs in messaging-led sales.",
  },
  {
    title: "Automation and AI prioritize work",
    description:
      "High-intent conversations get buried without lead scoring, suggested replies, and workflow templates that route urgent chats first.",
  },
  {
    title: "Agencies need multi-client tooling",
    description:
      "Agencies and operators serving multiple brands need repeatable onboarding, templates, and inbox structure they can deploy across clients.",
  },
] as const;

export const BUYER_CRITERIA = [
  {
    title: "Official WhatsApp Business API",
    description:
      "Look for platforms connected through Meta's official API path—not unofficial workarounds that risk number bans or unstable delivery.",
    link: { href: "/whatsapp-business-api", label: "WhatsApp Business API guide" },
  },
  {
    title: "Embedded Signup",
    description:
      "Guided Meta Embedded Signup helps non-technical teams connect a business number without a long implementation project.",
    link: { href: "/whatsapp-business-api", label: "Embedded Signup walkthrough" },
  },
  {
    title: "Unified omnichannel inbox",
    description:
      "The best WhatsApp CRM in 2026 usually includes WhatsApp plus Messenger, Instagram, Email, SMS, and website chat in one timeline per contact.",
    link: { href: "/unified-inbox", label: "Unified inbox overview" },
  },
  {
    title: "AI Assist and lead scoring",
    description:
      "AI should help draft replies, summarize context, and surface hotter leads—not replace your team or add opaque black-box decisions. Confirm which AI features are included vs add-ons.",
    link: { href: "/ai-lead-scoring", label: "AI lead scoring" },
  },
  {
    title: "Automation templates",
    description:
      "Pre-built flows for follow-ups, qualification, and handoffs save weeks compared with building every sequence from scratch. On WhachatCRM these ship on Starter and Pro.",
    link: { href: "/automation-templates", label: "Automation templates" },
  },
  {
    title: "Shared team inbox",
    description:
      "Assignment, internal notes, and collision-aware replies let multiple agents work from one official number or channel set.",
    link: { href: "/shared-team-inbox", label: "Shared team inbox" },
  },
  {
    title: "Notes, tags, and pipeline context",
    description:
      "Conversations should connect to contact records, deal stage, and reminders so WhatsApp is part of a sales process—not a separate silo.",
    link: { href: "/whatsapp-crm", label: "WhatsApp CRM guide" },
  },
  {
    title: "Email / Gmail in the same inbox",
    description:
      "Modern buyers email and message. Native Gmail OAuth keeps Email beside WhatsApp and Meta channels so follow-ups are not siloed in a separate mailbox.",
    link: { href: "/unified-inbox", label: "Unified inbox overview" },
  },
  {
    title: "GoHighLevel and CRM sync",
    description:
      "Agencies often need contact and pipeline sync with tools like GoHighLevel. Prefer platforms with documented OAuth/integrations rather than one-way CSV workarounds.",
    link: { href: "/pricing", label: "Plans and integrations" },
  },
  {
    title: "Shopify support",
    description:
      "Ecommerce teams benefit from order and customer context in chat, plus automation templates for retention workflows on paid plans.",
    link: { href: "/shopify-crm", label: "Shopify CRM" },
  },
  {
    title: "Real estate and property matching",
    description:
      "For brokerages and agents, specialized Growth Engine workflows (where offered) and listing recommendations inside chat can shorten time-to-showing.",
    link: { href: "/crm-with-mls-integration", label: "MLS integration" },
  },
  {
    title: "Unlimited team seats on a clear Pro plan",
    description:
      "Seat packs inflate cost as sales and support grow. Prefer Pro-style unlimited users so collaboration does not require buying another license for every teammate.",
    link: { href: "/pricing", label: "WhachatCRM pricing" },
  },
  {
    title: "Transparent Meta messaging fees",
    description:
      "Meta may update WhatsApp pricing independently. Prefer vendors that do not add their own per-message markup on top of Meta's official charges.",
    link: { href: "/pricing", label: "WhachatCRM pricing" },
  },
] as const;

export type ComparisonCell = "yes" | "partial" | "no" | string;

export interface PlatformComparisonRow {
  platform: string;
  highlight?: boolean;
  whatsappApi: ComparisonCell;
  omnichannelInbox: ComparisonCell;
  aiCopilot: ComparisonCell;
  automationTemplates: ComparisonCell;
  teamInbox: ComparisonCell;
  shopifySupport: ComparisonCell;
  realEstateMls: ComparisonCell;
  metaFeeTransparency: ComparisonCell;
  bestFit: string;
}

/** Balanced, high-level comparison for education—not a live pricing sheet. */
export const PLATFORM_COMPARISON: PlatformComparisonRow[] = [
  {
    platform: "WATI",
    whatsappApi: "yes",
    omnichannelInbox: "partial",
    aiCopilot: "partial",
    automationTemplates: "yes",
    teamInbox: "yes",
    shopifySupport: "partial",
    realEstateMls: "no",
    metaFeeTransparency: "partial",
    bestFit: "WhatsApp-first teams that want a established SMB inbox with automation add-ons",
  },
  {
    platform: "Respond.io",
    whatsappApi: "yes",
    omnichannelInbox: "yes",
    aiCopilot: "partial",
    automationTemplates: "yes",
    teamInbox: "yes",
    shopifySupport: "partial",
    realEstateMls: "no",
    metaFeeTransparency: "partial",
    bestFit: "Mid-market teams prioritizing broad channel coverage and routing rules",
  },
  {
    platform: "Interakt",
    whatsappApi: "yes",
    omnichannelInbox: "partial",
    aiCopilot: "partial",
    automationTemplates: "yes",
    teamInbox: "yes",
    shopifySupport: "partial",
    realEstateMls: "no",
    metaFeeTransparency: "partial",
    bestFit: "WhatsApp-led sales and support with campaign-style automation",
  },
  {
    platform: "Zoko",
    whatsappApi: "yes",
    omnichannelInbox: "partial",
    aiCopilot: "partial",
    automationTemplates: "yes",
    teamInbox: "yes",
    shopifySupport: "yes",
    realEstateMls: "no",
    metaFeeTransparency: "partial",
    bestFit: "Shopify merchants wanting WhatsApp tied closely to store workflows",
  },
  {
    platform: "ManyChat",
    whatsappApi: "partial",
    omnichannelInbox: "partial",
    aiCopilot: "partial",
    automationTemplates: "yes",
    teamInbox: "partial",
    shopifySupport: "partial",
    realEstateMls: "no",
    metaFeeTransparency: "partial",
    bestFit: "Marketing automation and chatbot flows across social and messaging entry points",
  },
  {
    platform: "WhachatCRM",
    highlight: true,
    whatsappApi: "yes",
    omnichannelInbox: "yes",
    aiCopilot: "yes",
    automationTemplates: "yes",
    teamInbox: "yes",
    shopifySupport: "yes",
    realEstateMls: "yes",
    metaFeeTransparency: "yes",
    bestFit: "SMBs and agencies wanting omnichannel inbox, AI, templates, Shopify, and real estate workflows with 0% Meta fee markup",
  },
];

export const WHACHAT_DIFFERENTIATORS = [
  "Meta Embedded Signup with native WhatsApp Cloud API onboarding (Twilio not required for new setups)",
  "Omnichannel inbox for WhatsApp, Messenger, Instagram, Email (Gmail), SMS, Telegram, and website chat",
  "AI Assist on Starter/Pro, with optional AI Brain add-on for deeper intelligence",
  "Chatbot / Flow Builder and preset automation templates included on Starter and Pro",
  "Shopify integration and GoHighLevel sync on Starter+ (Integrations page)",
  "Realtor Growth Engine for eligible Pro + AI Brain workspaces",
  "Unlimited users on Pro ($49/mo) with Free and Starter ($19/mo) entry points",
  "0% WhachatCRM markup on Meta messaging fees—Meta may change its rates independently",
] as const;

export const BEST_FOR_SEGMENTS = [
  { title: "Agencies", description: "Deploy repeatable inbox, automation, and AI workflows across client accounts." },
  { title: "Shopify & ecommerce", description: "Connect store context to WhatsApp and recovery flows." },
  { title: "Real estate teams", description: "Qualify buyers, match listings, and route leads from messaging channels." },
  { title: "Service businesses", description: "Book appointments, answer FAQs, and assign conversations without inbox chaos." },
  { title: "Sales teams", description: "Track follow-ups, notes, and pipeline stage beside every chat." },
  { title: "Support teams", description: "Use shared inbox, tags, and AI assist to resolve tickets faster." },
] as const;

export const RELATED_GUIDE_LINKS = [
  { href: "/whatsapp-crm", label: "WhatsApp CRM" },
  { href: "/whatsapp-business-api", label: "WhatsApp Business API" },
  { href: "/unified-inbox", label: "Unified Inbox" },
  { href: "/automation-templates", label: "Automation Templates" },
  { href: "/ai-lead-scoring", label: "AI Lead Scoring" },
  { href: "/shopify-crm", label: "Shopify CRM" },
  { href: "/real-estate-crm", label: "Real Estate CRM" },
  { href: "/crm-with-mls-integration", label: "MLS Integration" },
  { href: "/wati-alternative", label: "WATI Alternative" },
  { href: "/manychat-alternative", label: "ManyChat Alternative" },
  { href: "/interakt-alternative", label: "Interakt Alternative" },
  { href: "/respond-io-alternative", label: "Respond.io Alternative" },
  { href: "/waba360-alternative", label: "360dialog Alternative" },
  { href: "/zoko-alternative", label: "Zoko Alternative" },
  { href: "/pabbly-alternative", label: "Pabbly Alternative" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const FAQ_ITEMS = [
  {
    question: "What is the best WhatsApp CRM in 2026?",
    answer:
      "The best WhatsApp CRM in 2026 depends on your channels and team size, but most growing businesses shortlist platforms that combine official WhatsApp Business API access with an omnichannel inbox, automation, AI assistance, and transparent Meta pricing. WhachatCRM is built for teams that want those capabilities without per-message markups.",
  },
  {
    question: "Do I need WhatsApp Business API?",
    answer:
      "You need the WhatsApp Business API when multiple team members must share one official number, when you want CRM-grade automation and integrations, or when message volume outgrows the free WhatsApp Business app. Smaller solo operators may start on the app, but scaling teams typically move to API-backed CRM software.",
  },
  {
    question: "What is the difference between WhatsApp Business App and WhatsApp CRM?",
    answer:
      "The WhatsApp Business app is a mobile-first tool for one device and limited team workflows. A WhatsApp CRM connects through the official API and adds shared inbox, assignments, notes, automation, AI, and integrations with Shopify, pipelines, and other channels.",
  },
  {
    question: "Why is an omnichannel inbox important?",
    answer:
      "Customers message on WhatsApp, Instagram, Messenger, SMS, and your website. An omnichannel inbox keeps one timeline per contact so your team does not miss context, duplicate replies, or lose leads that started on a different channel.",
  },
  {
    question: "Can a WhatsApp CRM work with Instagram and Messenger?",
    answer:
      "Yes. Many modern platforms—including WhachatCRM—support Meta messaging channels alongside WhatsApp so agents can reply from one workspace instead of switching apps.",
  },
  {
    question: "Can agencies use WhachatCRM for clients?",
    answer:
      "Yes. Agencies use WhachatCRM to standardize inbox structure, automation templates, and AI-assisted replies across client brands. The partner program also supports operators who resell or implement messaging CRM workflows.",
  },
  {
    question: "Does WhachatCRM mark up Meta messaging fees?",
    answer:
      "No. WhachatCRM does not add a markup on Meta messaging fees. Subscription pricing is separate from Meta conversation charges, which are billed according to Meta's published rates.",
  },
  {
    question: "Does WhachatCRM support Shopify?",
    answer:
      "Yes. WhachatCRM includes Shopify-oriented workflows such as abandoned-cart recovery and retention templates, with customer and order context available inside conversations.",
  },
  {
    question: "Does WhachatCRM support real estate teams?",
    answer:
      "Yes. Real estate teams use WhachatCRM for lead qualification, follow-up automation, agent pages, and—where configured—MLS-linked property matching through the Realtor Growth Engine and MLS integration options.",
  },
  {
    question: "Can AI help qualify WhatsApp leads?",
    answer:
      "Yes. AI Copilot and lead scoring can summarize conversations, suggest replies, and highlight higher-intent chats so reps spend time on leads most likely to convert—without removing human judgment from the sales process.",
  },
  {
    question: "Does WhachatCRM include Email / Gmail?",
    answer:
      "Yes. WhachatCRM supports Email via Gmail OAuth in the Unified Inbox alongside WhatsApp, Messenger, and Instagram—so follow-ups are not stuck in a separate mailbox.",
  },
  {
    question: "Is the chatbot included on the Free plan?",
    answer:
      "No. The visual chatbot / Flow Builder and preset automation templates are included on Starter ($19/mo) and Pro ($49/mo). Free is for validating Unified Inbox and CRM workflows before you upgrade.",
  },
  {
    question: "How much does WhachatCRM cost?",
    answer:
      "WhachatCRM offers a Free plan, Starter at $19/mo (up to 3 users), and Pro at $49/mo with unlimited users. Optional AI Brain is $29/mo on Starter or Pro. Meta WhatsApp conversation fees are separate; WhachatCRM does not add its own per-message markup. Meta may update WhatsApp pricing independently.",
  },
  {
    question: "How is WhachatCRM different from Respond.io or WATI?",
    answer:
      "Respond.io and WATI are strong WhatsApp and omnichannel options for many teams. WhachatCRM differentiates with Meta Embedded Signup, Email/Gmail in the same inbox, chatbot and templates on Starter+, Shopify and GoHighLevel integrations on paid plans, unlimited users on Pro, a free plan to start, and 0% WhachatCRM markup on Meta messaging fees—aimed at SMBs and agencies that want breadth without enterprise complexity.",
  },
  {
    question: "What should I compare before choosing a WhatsApp CRM?",
    answer:
      "Compare Embedded Signup, channel coverage (including Email), automation depth, AI features, team inbox controls, integrations (Shopify or GoHighLevel), seat model, and how Meta conversation fees are passed through. A side-by-side trial on your real workflows beats feature checklists alone.",
  },
] as const;

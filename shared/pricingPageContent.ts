/**
 * Public Pricing page content model (English base).
 * Descriptive copy only — brand/plan/channel names stay as approved.
 */

export type PricingFaqItem = { q: string; a: string };
export type PricingCard = { id?: string; title: string; body: string };
export type PricingChip = { id: string; label: string };
export type PricingChannel = { id: string; label: string };

export type PricingPageContent = {
  seo: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    twitterTitle: string;
    twitterDescription: string;
  };
  trialBanner: string;
  hero: { h1: string; subtitle: string };
  heroChips: PricingChip[];
  channels: {
    title: string;
    messagingLabel: string;
    leadSourcesLabel: string;
    messaging: PricingChannel[];
    leadSources: PricingChannel[];
  };
  transparent: { title: string; points: string[] };
  freeUpsell: string;
  starterCallout: { title: string; body: string };
  proCallout: { title: string; body: string };
  proBadge: string;
  compareTitle: string;
  featureColumnHeader: string;
  aiBrain: {
    badge: string;
    title: string;
    intro: string;
    cardDesc: string;
    highlights: string[];
  };
  prospectAi: {
    badge: string;
    title: string;
    body: string;
    quotaNote: string;
    cta: string;
  };
  capabilities: { title: string; cards: PricingCard[] };
  whyChoose: { title: string; cards: PricingCard[] };
  faq: { title: string; items: PricingFaqItem[] };
  bottomCta: {
    title: string;
    subtitle: string;
    startFree: string;
    bookDemo: string;
  };
  compareLabels: Record<string, string>;
  compareHints: Record<string, string>;
  compareGroups: Record<string, string>;
  compareCells: {
    connectedChannels: string;
    notIncluded: string;
    addOn: string;
    growthEngineReady: string;
    basic: string;
    unlimited: string;
    upTo: string;
    perMonth: string;
    user: string;
    users: string;
  };
  highlights: {
    prospectDiscoveries: string;
    activeConversations: string;
    usersOne: string;
    usersMany: string;
    usersUnlimited: string;
    whatsappOne: string;
    whatsappMany: string;
    multiChannelInbox: string;
    connectIntegrations: string;
    basicWhatsappTemplates: string;
    chatbotWidget: string;
    workflowAutomation: string;
    growthEnginesRequired: string;
  };
  ssr: { h1: string; lead: string; bullets: string[] };
};

export function formatPricingTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
  }
  return out;
}

export const PRICING_PAGE_CONTENT_EN: PricingPageContent = {
  seo: {
    title: "WhachatCRM Pricing | Prospect AI, Unified Inbox & WhatsApp CRM",
    description:
      "WhachatCRM Pricing: Prospect AI, Unified Inbox, WhatsApp CRM, AI Chatbot, and sales automation. Find, engage, and convert more customers. Free plan includes 50 Prospect AI discoveries/month.",
    ogTitle: "WhachatCRM Pricing | Prospect AI, Unified Inbox & WhatsApp CRM",
    ogDescription:
      "Multi-channel inbox, Prospect AI, AI Chatbot, and Workflow Automation in one platform. Start free.",
    twitterTitle: "WhachatCRM Pricing | Unified Inbox & Prospect AI",
    twitterDescription:
      "Prospect AI, multi-channel inbox, AI Chatbot, and sales automation—clear plans from Free to Pro.",
  },
  trialBanner: "Every new account includes a full 14-day Pro + AI Brain trial.",
  hero: {
    h1: "Everything you need to find, engage, and convert more customers",
    subtitle:
      "Prospect AI, Unified Inbox, Chatbot, Workflow Automation and AI Copilot—all in one platform.",
  },
  heroChips: [
    { id: "prospect-ai", label: "Prospect AI" },
    { id: "inbox", label: "Unified Inbox" },
    { id: "chatbot", label: "AI Chatbot" },
    { id: "workflows", label: "Workflow Automation" },
    { id: "copilot", label: "AI Copilot" },
  ],
  channels: {
    title: "Works with your customer channels",
    messagingLabel: "Messaging",
    leadSourcesLabel: "Lead Sources",
    messaging: [
      { id: "whatsapp", label: "WhatsApp Business" },
      { id: "facebook", label: "Facebook Messenger" },
      { id: "instagram", label: "Instagram" },
      { id: "gmail", label: "Gmail" },
      { id: "telegram", label: "Telegram" },
      { id: "webchat", label: "Website Chat" },
      { id: "sms", label: "SMS" },
    ],
    leadSources: [
      { id: "tiktok", label: "TikTok Lead Forms" },
      { id: "website-forms", label: "Website Forms" },
    ],
  },
  transparent: {
    title: "Transparent Pricing",
    points: [
      "No active-contact pricing",
      "0% WhachatCRM markup on Meta conversation fees",
      "Upgrade only as your business grows",
    ],
  },
  freeUpsell: "Upgrade when you need chatbot, campaign automation, and more capacity.",
  starterCallout: {
    title: "AI Chatbot & Website Widget",
    body: "Capture, qualify and respond to website visitors automatically.",
  },
  proCallout: {
    title: "Growth Engine Ready",
    body: "Activate compatible industry Growth Engines such as Realtor Growth Engine. Growth Engines may require a separate purchase.",
  },
  proBadge: "Most Popular",
  compareTitle: "Compare plans",
  featureColumnHeader: "Feature",
  aiBrain: {
    badge: "Optional Add-on",
    title: "AI Brain",
    intro: "Enhances WhachatCRM with your business knowledge—not a separate subscription plan.",
    cardDesc: "Add AI Brain to Starter or Pro — enhances the platform, not a standalone plan.",
    highlights: [
      "Learns your business",
      "Uses company knowledge",
      "Connects Offers & Payment Links",
      "Improves Prospect AI personalization",
      "Smarter AI Copilot",
      "Better recommendations",
    ],
  },
  prospectAi: {
    badge: "NEW",
    title: "Prospect AI Included — Free with Every Plan",
    body: "Find local businesses, qualify opportunities with AI, and launch personalized outreach campaigns—all within WhachatCRM.",
    quotaNote: "Monthly Prospect AI discoveries by plan",
    cta: "Explore Prospect AI",
  },
  capabilities: {
    title: "What you can do",
    cards: [
      {
        id: "prospect-ai",
        title: "Prospect AI",
        body: "Find businesses, qualify opportunities, and launch outreach from one workspace.",
      },
      {
        id: "inbox",
        title: "Multi-channel Inbox",
        body: "Reply across WhatsApp, Messenger, Instagram, Gmail, Telegram, SMS, and Website Chat.",
      },
      {
        id: "chatbot",
        title: "AI Chatbot & Automations",
        body: "Capture, qualify, and respond to website visitors—then automate follow-ups.",
      },
      {
        id: "copilot",
        title: "AI Copilot",
        body: "Draft replies, understand conversations, and see recommended next actions.",
      },
      {
        id: "brain",
        title: "AI Brain",
        body: "Teach WhachatCRM your business so Copilot, Prospect AI, and replies get smarter.",
      },
    ],
  },
  whyChoose: {
    title: "Why businesses switch to WhachatCRM",
    cards: [
      {
        title: "FREE Prospect AI",
        body: "Discover and qualify local businesses on every plan—including Free.",
      },
      {
        title: "No Active Contact Pricing",
        body: "Your bill does not rise just because more contacts exist in your CRM.",
      },
      {
        title: "0% WhachatCRM markup on Meta conversation fees",
        body: "You only pay Meta’s published WhatsApp conversation rates.",
      },
      {
        title: "Unified Inbox for messaging and email",
        body: "Manage WhatsApp, Messenger, Instagram, Gmail, and more in one place.",
      },
      {
        title: "AI Chatbot & Workflow Automation",
        body: "Capture, qualify, and follow up automatically on Starter and Pro.",
      },
    ],
  },
  faq: {
    title: "Common questions",
    items: [
      {
        q: "Are integrations included on Free?",
        a: "Yes. Free users can open Integrations and connect supported tools such as Gmail, Shopify, Calendly, and GoHighLevel. Conversation, user, and channel limits still apply. Campaign automation and AI Brain remain separate paid capabilities.",
      },
      {
        q: "Are WhatsApp templates included on Free?",
        a: "Yes. Free includes basic WhatsApp template messaging: view, sync, and send an approved template to a contact when Meta requires it outside the 24-hour window. Bulk campaigns, mass enrollment, and advanced retargeting stay on Starter and Pro.",
      },
      {
        q: "Can I try Pro and AI Brain before upgrading?",
        a: "Every new account receives a full-featured 14-day Pro + AI Brain trial. No feature restrictions during the trial.",
      },
      {
        q: "What is Prospect AI?",
        a: "Prospect AI helps you find local businesses, qualify opportunities with AI, and launch personalized outreach campaigns without leaving WhachatCRM. Monthly discovery quotas apply by plan.",
      },
      {
        q: "Is Chatbot included?",
        a: "AI Chatbot & Website Widget is included on Starter and Pro. Free does not include the visual chatbot builder. Chatbot captures, qualifies, and responds to website visitors; AI Brain is an optional add-on that makes conversations smarter.",
      },
      {
        q: "What is AI Brain?",
        a: "AI Brain is an optional $29/month add-on for Starter or Pro—not a base plan. It learns your business, uses company knowledge and Offers & Payment Links, improves Prospect AI personalization, and powers a smarter AI Copilot.",
      },
      {
        q: "What counts as an active conversation?",
        a: "A conversation counts once when a customer actively messages you during the billing period. Multiple messages within that conversation do not create additional conversations.",
      },
      {
        q: "What are Meta conversation fees?",
        a: "Meta determines WhatsApp conversation pricing. WhachatCRM adds 0% markup. Customers only pay Meta’s published rates.",
      },
      {
        q: "Can I upgrade anytime?",
        a: "Yes. Upgrade as your business grows. You can change plans according to your billing provider (Stripe or Shopify).",
      },
    ],
  },
  bottomCta: {
    title: "Start finding customers before you pay",
    subtitle: "Get 50 Prospect AI discoveries every month on Free.",
    startFree: "Start Free",
    bookDemo: "Book Demo",
  },
  compareLabels: {
    activeConversations: "Active conversations",
    users: "Users",
    whatsappNumbers: "WhatsApp Business accounts",
    unifiedInbox: "Multi-channel Inbox",
    supportedChannels: "Supported messaging channels",
    prospectDiscoveries: "Monthly Prospect AI Discoveries",
    prospectReview: "AI Review / qualification",
    prospectCampaigns: "Campaign builder",
    messageCreation: "Message Creation modes",
    prospectArchive: "Archive / Restore",
    chatbotWidget: "AI Chatbot & Website Widget",
    workflowAutomation: "Workflow Automation",
    followUps: "Follow-ups",
    aiBrainAddon: "AI Brain add-on",
    assignment: "Assignment / collaboration",
    integrations: "Integrations",
    templateMessaging: "WhatsApp template messaging",
    growthEngines: "Growth Engines",
  },
  compareHints: {
    growthEngines: "Required platform plan to activate compatible Growth Engines.",
    templateMessaging:
      "Free includes basic 1:1 approved-template sends. Bulk campaigns and automation sequences stay on Starter and Pro.",
    integrations: "Connect supported business tools. Conversation and usage limits still apply.",
  },
  compareGroups: {
    MESSAGING: "Messaging",
    "PROSPECT AI": "Prospect AI",
    CHATBOT: "Chatbot",
    AUTOMATION: "Automation",
    AI: "AI",
    TEAM: "Team",
    SUPPORT: "Support",
    "GROWTH ENGINES": "Growth Engines",
  },
  compareCells: {
    connectedChannels: "Connected channels",
    notIncluded: "Not included",
    addOn: "Add-on",
    growthEngineReady: "Growth Engine Ready",
    unlimited: "Unlimited",
    basic: "Basic",
    upTo: "Up to {{n}}",
    perMonth: "/month",
    user: "user",
    users: "users",
  },
  highlights: {
    prospectDiscoveries: "{{n}} Prospect AI discoveries/month",
    activeConversations: "{{n}} active conversations",
    usersOne: "1 user",
    usersMany: "Up to {{n}} users",
    usersUnlimited: "Unlimited users",
    whatsappOne: "1 WhatsApp Business account",
    whatsappMany: "Up to {{n}} WhatsApp Business accounts",
    multiChannelInbox: "Multi-channel Inbox",
    connectIntegrations: "Connect integrations",
    basicWhatsappTemplates: "Basic WhatsApp templates",
    chatbotWidget: "AI Chatbot & Website Widget",
    workflowAutomation: "Workflow Automation",
    growthEnginesRequired: "Required plan for Industry Growth Engines",
  },
  ssr: {
    h1: "WhachatCRM Pricing",
    lead: "Transparent plans for Prospect AI, Unified Inbox, AI Chatbot, Workflow Automation, and AI Copilot. Start free with 50 Prospect AI discoveries every month.",
    bullets: [
      "Free, Starter, and Pro plans with clear conversation and user limits",
      "Prospect AI included on every plan",
      "Integrations and basic WhatsApp templates on Free",
      "Optional AI Brain add-on for Starter and Pro",
      "0% WhachatCRM markup on Meta conversation fees",
      "14-day Pro + AI Brain trial on new accounts",
    ],
  },
};

/** English trial banner — kept for tests that assert string presence. */
export const FULL_PRO_AI_TRIAL_COPY = PRICING_PAGE_CONTENT_EN.trialBanner;

import type { SeoLandingPageConfig } from "./types";
import { cluster } from "./sharedLinks";
import { SEO_BREADCRUMBS } from "@/components/marketing/MarketingBreadcrumbs";
import { S } from "@shared/marketingScreenshots";

const heroUnifiedInbox = {
  ...S.unifiedInbox,
  size: "hero" as const,
  title: "Conversation + AI property matching",
  caption:
    "A buyer messages on WhatsApp, AI qualifies the lead, and matching MLS listings appear instantly in the inbox sidebar.",
};

export const crmWithMlsIntegrationConfig: SeoLandingPageConfig = {
  slug: "crm-with-mls-integration",
  title: "CRM with MLS Integration | AI Property Matching | WhachatCRM",
  metaDescription:
    "Connect Bridge Interactive MLS data to WhachatCRM. Sync inventory, qualify buyers with AI, match listings automatically, and route leads from WhatsApp and your agent page.",
  keywords: "CRM with MLS integration, MLS CRM, AI MLS CRM, Bridge Interactive CRM, real estate inventory sync",
  heroBadge: "Real estate + MLS",
  h1: "CRM with MLS Integration for Modern Real Estate Teams",
  heroIntro:
    "WhachatCRM connects Bridge Interactive MLS feeds to your unified inbox, AI Copilot, and Growth Engine automations — so every buyer conversation turns into qualified showings with the right listings attached.",
  heroFlow: ["Customer messages you", "AI qualifies buyer", "Matching listings appear"],
  breadcrumbs: SEO_BREADCRUMBS.page("CRM with MLS Integration", "crm-with-mls-integration"),
  heroImage: heroUnifiedInbox,
  sections: [
    {
      id: "why-mls-crm",
      title: "Why real estate teams need a CRM with MLS integration",
      paragraphs: [
        "Most CRMs treat property inventory as an afterthought. Agents paste listing links manually, lose track of what a buyer has already seen, and struggle to follow up when MLS status changes. A CRM with MLS integration keeps inventory, conversations, and pipeline stages in one workspace.",
      ],
      featureCards: [
        {
          title: "One workspace",
          description: "Chats, contacts, pipeline, and MLS inventory in a single view — no tab switching.",
        },
        {
          title: "AI buyer preferences",
          description: "Budget, beds, baths, and neighborhoods extracted from natural conversation.",
        },
        {
          title: "Instant listing match",
          description: "Relevant properties surface while the conversation is still warm.",
        },
        {
          title: "Shared automations",
          description: "Buyer and seller workflows run on the same Growth Engine presets.",
        },
      ],
    },
    {
      id: "ai-qualification",
      title: "AI qualification and lead scoring",
      paragraphs: [
        "AI Copilot reads every inbound message to infer budget, property type, bedrooms, bathrooms, neighborhoods, and purchase timeline. Lead score updates automatically as the conversation progresses.",
        "Hot buyers rise to the top of your queue. Managers see who needs a human callback without reading every thread.",
      ],
      image: {
        ...S.leadScore,
        title: "AI lead scoring",
        figure: 1,
        caption: "Figure 1. " + S.leadScore.caption!,
      },
    },
    {
      id: "ai-recommendation",
      title: "AI property recommendations",
      paragraphs: [
        "When inventory matches buyer criteria, WhachatCRM opens a listing detail view with photos, pricing, and an AI Recommendation block that explains why the property fits — preferred location, budget, bedrooms, and lifestyle signals like waterfront access.",
        "Agents review and send listings from the inbox. AI assists; humans approve every outbound message.",
      ],
      image: {
        ...S.propertyMatchDetails,
        title: "Why this listing matches",
        figure: 2,
        caption: "Figure 2. " + S.propertyMatchDetails.caption!,
      },
    },
    {
      id: "automation",
      title: "Automation that follows qualification",
      paragraphs: [
        "Growth Engine workflows launch when a lead is qualified — buyer follow-up, appointment reminders, and no-reply sequences. W2 scores every inbound message; W4–W6 follow up when conversations go quiet.",
      ],
      image: {
        ...S.automationWorkflows,
        title: "Active automation workflows",
        figure: 3,
        caption: "Figure 3. " + S.automationWorkflows.caption!,
      },
    },
    {
      id: "agent-page",
      title: "Public Agent Pages for SEO and lead capture",
      paragraphs: [
        "Every agent gets an SEO-friendly public profile with biography, market areas, lead forms, and home valuation CTAs. Listings from connected inventory sources appear on the page and embed on your brokerage website via iframe widgets.",
      ],
      image: {
        ...S.agentPagePublic,
        title: "Public Agent Page",
        figure: 4,
        caption: "Figure 4. " + S.agentPagePublic.caption!,
      },
    },
    {
      id: "mls-inventory",
      title: "MLS inventory sync (Bridge Interactive & MLS Grid)",
      paragraphs: [
        "Connect Bridge Interactive or MLS Grid from Settings → Inventory Sources. Scope sync to your cities and ZIP codes, then run scheduled syncs so price, status, and media stay current.",
        "Synced inventory powers AI property matching, Agent Page listings, price reduction alerts, and automated buyer recommendations.",
      ],
      image: {
        ...S.inventorySource,
        title: "MLS Grid inventory connection",
        figure: 5,
        caption: "Figure 5. " + S.inventorySource.caption!,
      },
    },
    {
      id: "get-started",
      title: "Getting started with MLS CRM in WhachatCRM",
      paragraphs: [
        "Start on the Free plan to connect WhatsApp via Meta embedded signup, then upgrade to Pro for unlimited users, Growth Engine templates, and full AI Copilot. Connect your MLS source, verify sync, and enable AI Brain for deeper qualification.",
        "Our Help Center walks through channel setup, MLS configuration, and preset real estate automations step by step.",
      ],
      image: {
        ...S.inventoryHealth,
        title: "Inventory and qualification status",
        figure: 6,
        caption: "Figure 6. " + S.inventoryHealth.caption!,
      },
    },
  ],
  faqs: [
    {
      question: "Which MLS feeds are supported?",
      answer:
        "WhachatCRM connects to MLS data through Bridge Interactive. Available feeds depend on your Bridge account and participating MLS boards. Configure credentials in Integrations after signup.",
    },
    {
      question: "Does inventory update automatically?",
      answer:
        "Yes. Listing sync runs on a schedule so price, status, and media changes propagate into WhachatCRM without manual CSV uploads.",
    },
    {
      question: "Can AI recommend listings inside WhatsApp?",
      answer:
        "AI Copilot uses buyer preferences extracted from conversations to suggest matching inventory. Agents review and send listings from the inbox — AI assists, humans approve.",
    },
    {
      question: "Is this only for real estate?",
      answer:
        "MLS integration targets real estate workflows. Ecommerce teams typically use Shopify integration instead; both share the same unified inbox and automation engine.",
    },
    {
      question: "Do I need Pro for MLS features?",
      answer:
        "Bridge connection and inventory sync are available on eligible plans. Advanced automations, unlimited users, and full Growth Engine presets require Pro — see Pricing for current limits.",
    },
  ],
  relatedLinks: cluster(
    "realEstateCrm",
    "whatsappCrm",
    "aiLeadScoring",
    "automationTemplates",
    "realtorGrowth",
    "userGuide"
  ),
};

export const realEstateCrmConfig: SeoLandingPageConfig = {
  slug: "real-estate-crm",
  title: "Real Estate CRM for Agents & Teams | WhachatCRM",
  metaDescription:
    "Real estate CRM with WhatsApp, unified inbox, AI lead qualification, MLS integration, agent pages, and follow-up automation. Built for agents who close on messaging apps.",
  keywords: "real estate CRM, CRM for realtors, CRM for real estate agents, realtor CRM WhatsApp",
  heroBadge: "Built for agents",
  h1: "Real Estate CRM That Meets Buyers Where They Message",
  heroIntro:
    "Capture leads from WhatsApp, Instagram, Messenger, and your public agent page. Qualify with AI, sync MLS inventory, automate follow-ups, and collaborate in one shared inbox.",
  breadcrumbs: SEO_BREADCRUMBS.page("Real Estate CRM", "real-estate-crm"),
  heroImage: {
    ...S.unifiedInbox,
    size: "hero",
    title: "Unified inbox with AI property matching",
    caption:
      "AI Copilot, inventory matches, and the customer conversation — all in one workspace built for real estate agents.",
  },
  sections: [
    {
      id: "challenge",
      title: "The real estate lead follow-up problem",
      paragraphs: [
        "Real estate leads arrive at all hours — portal inquiries, open house sign-ins, referral texts, and DMs on Instagram. Without a purpose-built real estate CRM, speed-to-lead suffers and hot buyers talk to the next agent who replies first.",
        "Spreadsheets and generic CRMs fail because they were not designed for conversational selling. WhachatCRM treats every message thread as the system of record: notes, tags, pipeline stage, showing history, and MLS context live beside the chat.",
      ],
    },
    {
      id: "lead-capture",
      title: "Lead capture across channels",
      paragraphs: [
        "Connect WhatsApp through Meta embedded signup, link Facebook Pages for Messenger, and attach Instagram Professional accounts for DM management. Each channel feeds the same contact record.",
        "Public Agent Pages give you an SEO-friendly profile with biography, market areas, branding, and lead forms — including home valuation CTAs. Submissions create CRM contacts instantly and can trigger welcome automations.",
      ],
      featureCards: [
        {
          title: "Omnichannel inbox",
          description: "WhatsApp, Messenger, and Instagram in one queue with channel badges on every thread.",
        },
        {
          title: "Agent Pages",
          description: "SEO-friendly profiles with MLS-backed inventory and embeddable listing widgets.",
        },
        {
          title: "Lead timeline",
          description: "Every touchpoint chronologically — messages, stage changes, and automation events.",
        },
        {
          title: "Buyer/seller pipeline",
          description: "Tags and stages tailored to how agents actually close deals.",
        },
      ],
      image: {
        ...S.agentPagePublic,
        title: "Public Agent Page for lead capture",
        figure: 1,
        caption: "Figure 1. " + S.agentPagePublic.caption!,
      },
    },
    {
      id: "ai-qualification",
      title: "AI qualification and lead scoring",
      paragraphs: [
        "AI Copilot summarizes long threads, suggests replies, and scores leads based on budget signals, urgency, and engagement. Scores help managers prioritize callbacks and automate nurture for colder leads.",
        "Suggested follow-ups appear when a buyer stops responding or asks for listings in a new area. Conversation insights highlight objections and next best actions without re-reading dozens of messages.",
      ],
      image: {
        ...S.aiCopilot,
        title: "AI Copilot lead scoring",
        figure: 2,
        caption: "Figure 2. " + S.aiCopilot.caption!,
      },
    },
    {
      id: "mls-automation",
      title: "MLS integration and property matching",
      paragraphs: [
        "Bridge Interactive sync keeps listings current inside WhachatCRM. AI matches buyer preferences to inventory and lets agents share properties inside the conversation with full context preserved.",
        "See our dedicated CRM with MLS Integration page for technical setup details and Bridge credential configuration.",
      ],
      image: {
        ...S.propertyMatchDetails,
        title: "AI listing recommendation",
        figure: 3,
        caption: "Figure 3. " + S.propertyMatchDetails.caption!,
      },
    },
    {
      id: "growth-engine",
      title: "Follow-up automation with Growth Engine",
      paragraphs: [
        "The Realtor Growth Engine (RGE) ships preset workflows for buyer follow-up, seller nurture, appointment reminders, and no-reply sequences. Install templates, customize copy, and enroll contacts from the inbox sidebar.",
      ],
      image: {
        ...S.automationWorkflows,
        title: "Preset real estate workflows",
        figure: 4,
        caption: "Figure 4. " + S.automationWorkflows.caption!,
      },
    },
    {
      id: "team",
      title: "Team collaboration and scheduling",
      paragraphs: [
        "Pro plans support unlimited users with conversation assignment, internal notes, and shared visibility. Integrate Calendly or use appointment reminders in automations to reduce no-shows.",
        "Managers see which agent owns each lead, how quickly teams respond, and which automations are driving showings — without exporting reports to a separate BI tool for basic operational visibility.",
      ],
      image: {
        ...S.inventoryHealth,
        title: "Pipeline and team visibility",
        figure: 5,
        caption: "Figure 5. " + S.inventoryHealth.caption!,
      },
    },
  ],
  faqs: [
    {
      question: "Is WhachatCRM a replacement for my brokerage CRM?",
      answer:
        "WhachatCRM excels at messaging-first lead management, AI qualification, and automations. Many teams use it alongside brokerage systems or sync contacts to HubSpot where needed.",
    },
    {
      question: "Can I use my existing WhatsApp Business number?",
      answer:
        "Yes. Meta embedded signup supports migrating an existing number or registering a new Cloud API number. Coexistence with the WhatsApp Business app may be available depending on Meta eligibility.",
    },
    {
      question: "Does it work for solo agents?",
      answer:
        "Absolutely. The Free plan lets solo agents test WhatsApp CRM basics; Starter and Pro scale with automations, AI, and team features as your business grows.",
    },
    {
      question: "How do agent pages help SEO?",
      answer:
        "Agent Pages publish crawlable profiles with your bio, service areas, and listings — driving organic discovery while capturing leads into the same CRM inbox.",
    },
  ],
  relatedLinks: cluster(
    "mlsIntegration",
    "whatsappCrm",
    "unifiedInbox",
    "aiLeadScoring",
    "automationTemplates",
    "realtorGrowth"
  ),
};

export const unifiedInboxConfig: SeoLandingPageConfig = {
  slug: "unified-inbox",
  title: "Unified Inbox for WhatsApp, Messenger & Instagram | WhachatCRM",
  metaDescription:
    "Omnichannel shared inbox for WhatsApp, Facebook Messenger, and Instagram. AI Copilot, team assignments, internal notes, lead scoring, and full conversation history in one place.",
  keywords: "unified inbox, shared inbox, omnichannel inbox, WhatsApp team inbox",
  heroBadge: "Omnichannel messaging",
  h1: "Unified Inbox for Every Customer Conversation",
  heroIntro:
    "Stop switching between apps. WhachatCRM combines WhatsApp, Messenger, Instagram, and more into one searchable inbox with AI assistance, CRM context, and team collaboration built in.",
  breadcrumbs: SEO_BREADCRUMBS.page("Unified Inbox", "unified-inbox"),
  heroImage: {
    ...S.unifiedInbox,
    size: "hero",
    title: "Full unified inbox",
    caption:
      "WhatsApp, Messenger, AI Copilot, property recommendations, and lead qualification — the complete messaging workspace.",
  },
  sections: [
    {
      id: "what-is",
      title: "What is a unified inbox?",
      paragraphs: [
        "A unified inbox aggregates customer messages from multiple channels into a single queue. Instead of three phones and five browser tabs, your team sees one list sorted by priority, assignment, and last activity.",
        "WhachatCRM goes beyond message aggregation: each thread includes contact details, tags, pipeline stage, internal notes, automation enrollments, and AI-generated summaries. That is what turns a shared inbox into a revenue workspace.",
      ],
    },
    {
      id: "channels",
      title: "WhatsApp, Messenger, and Instagram together",
      paragraphs: [
        "WhatsApp connects through the official Meta Cloud API via embedded signup — no manual token hunting. Facebook Messenger links through your Facebook Page permissions. Instagram Professional accounts connect for DM management alongside Meta's other messaging products.",
      ],
      featureCards: [
        {
          title: "Official WhatsApp API",
          description: "Meta embedded signup connects your number in minutes — no developer required.",
        },
        {
          title: "Page-linked Messenger",
          description: "Permission-based setup tied to your Facebook Page.",
        },
        {
          title: "Instagram Professional DMs",
          description: "Manage Instagram messages beside WhatsApp threads.",
        },
        {
          title: "Unified history",
          description: "Conversation context preserved when customers switch channels.",
        },
      ],
      image: {
        ...S.channels,
        title: "Channel settings",
        figure: 1,
        caption: "Figure 1. " + S.channels.caption!,
      },
    },
    {
      id: "ai-copilot",
      title: "AI Copilot inside the inbox",
      paragraphs: [
        "AI Copilot drafts replies, summarizes long threads, scores leads, and recommends follow-ups. Modes range from Manual (human-only) to Suggest (AI drafts, human sends) so you control automation risk.",
        "Lead scoring highlights buyers and sellers ready for the next step — especially valuable when volume spikes and managers need to allocate attention without reading every message.",
      ],
      image: {
        ...S.aiCopilot,
        title: "AI Copilot in the inbox",
        figure: 2,
        caption: "Figure 2. " + S.aiCopilot.caption!,
      },
    },
    {
      id: "collaboration",
      title: "Team assignments, notes, and ownership",
      paragraphs: [
        "On Pro plans, assign conversations to specific teammates while keeping managers in the loop. Internal notes capture context customers never see — showing feedback, commission discussions, or support escalations.",
        "The contact sidebar holds tags, pipeline stages, follow-up reminders, and campaign enrollment. The lead timeline chronologically records messages, stage changes, and automation events for auditability.",
      ],
      image: {
        ...S.propertyMatching,
        title: "Inventory matches in the sidebar",
        figure: 3,
        caption: "Figure 3. " + S.propertyMatching.caption!,
      },
    },
    {
      id: "vs-shared",
      title: "Unified inbox vs. basic shared inbox tools",
      paragraphs: [
        "Basic shared inbox products route messages but omit CRM depth. WhachatCRM includes Growth Engine automations, Shopify and MLS integrations, templates, and AI — so the inbox is the hub, not a dead-end queue.",
      ],
      featureCards: [
        {
          title: "CRM depth",
          description: "Tags, pipeline stages, and lead timeline on every thread.",
        },
        {
          title: "Growth Engine",
          description: "Automations, templates, and AI actions built into the inbox.",
        },
        {
          title: "Vertical integrations",
          description: "Shopify orders and MLS inventory beside the conversation.",
        },
        {
          title: "Team collaboration",
          description: "Assignments, internal notes, and manager visibility on Pro.",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "How many channels can I connect?",
      answer:
        "WhatsApp, Messenger, and Instagram are core Meta channels. SMS via Twilio, web chat widgets, and ecommerce integrations extend the same inbox on eligible plans.",
    },
    {
      question: "Can multiple agents reply at once?",
      answer:
        "Yes on Pro. Assign owners to avoid duplicate replies and use internal notes to coordinate handoffs.",
    },
    {
      question: "Does AI send messages automatically?",
      answer:
        "Only when you enable Auto mode and configure automations to do so. Default workflows keep humans in control of outbound sends.",
    },
    {
      question: "Is conversation history imported?",
      answer:
        "New messages after connection are stored in WhachatCRM. Historical messages before connection depend on Meta API availability for each channel.",
    },
  ],
  relatedLinks: cluster(
    "sharedInbox",
    "whatsappCrm",
    "whatsappApi",
    "aiLeadScoring",
    "shopifyCrm",
    "userGuide"
  ),
};

export const shopifyCrmConfig: SeoLandingPageConfig = {
  slug: "shopify-crm",
  title: "Shopify CRM with WhatsApp & AI Automation | WhachatCRM",
  metaDescription:
    "Shopify CRM connecting orders, abandoned carts, and customer support to WhatsApp, Messenger, and Instagram. Preset ecommerce automations, AI Copilot, and unified inbox.",
  keywords: "Shopify CRM, Shopify WhatsApp CRM, Shopify customer support WhatsApp",
  heroBadge: "Shopify + messaging",
  h1: "Shopify CRM Built for WhatsApp-First Customer Conversations",
  heroIntro:
    "Install from the Shopify App Store, connect messaging channels in minutes, and recover revenue with abandoned cart automations, order notifications, and AI-assisted support — all in one inbox.",
  breadcrumbs: SEO_BREADCRUMBS.page("Shopify CRM", "shopify-crm"),
  // TODO: Replace hero with an authentic Shopify workflow screenshot (cart recovery / order context) when available.
  heroImage: {
    ...S.unifiedInbox,
    size: "hero",
    title: "WhatsApp-first customer conversations",
    caption:
      "Until a dedicated Shopify screenshot is available, the unified inbox shows how order support and cart recovery conversations look in WhachatCRM.",
  },
  ctaHeadline: "Ready to recover more Shopify carts on WhatsApp?",
  sections: [
    {
      id: "why",
      title: "Why Shopify stores need a messaging CRM",
      paragraphs: [
        "Email open rates keep falling while customers expect answers on WhatsApp and Instagram. A Shopify CRM that only sends email misses high-intent moments — cart abandonment, shipping questions, and product comparisons happen in real time.",
        "WhachatCRM embeds onboarding for Shopify merchants: install the app, connect Meta channels, and enable preset automations without hiring an integrator. Order context appears beside the chat so agents never ask for an order number twice.",
      ],
    },
    {
      id: "install",
      title: "Installing from Shopify and embedded onboarding",
      paragraphs: [
        "Find WhachatCRM in the Shopify App Store and approve permissions. Embedded onboarding walks you through plan selection, WhatsApp embedded signup, and optional Messenger or Instagram connections without leaving Shopify admin.",
      ],
      featureCards: [
        {
          title: "One-click install",
          description: "Install from the Shopify App Store and approve permissions in minutes.",
        },
        {
          title: "Guided WhatsApp setup",
          description: "Meta embedded signup runs inside onboarding — no token copy-paste.",
        },
        {
          title: "Omnichannel optional",
          description: "Add Messenger and Instagram when customers reach out on other apps.",
        },
        {
          title: "Preset templates",
          description: "Ecommerce automations ready to customize before you go live.",
        },
      ],
      image: {
        ...S.unifiedInbox,
        title: "Unified inbox for Shopify support",
        figure: 1,
        caption: "Figure 1. Order context and customer messages in one thread.",
      },
    },
    {
      id: "abandoned-cart",
      title: "Abandoned cart recovery on WhatsApp",
      paragraphs: [
        "Preset abandoned cart workflows message shoppers who leave checkout — using approved WhatsApp templates where required. Combine delays, conditions, and AI-drafted personalization for product names and cart value.",
        "Recovery performs best when support and marketing share one inbox: if a buyer replies with a question, your team continues the thread human-to-human without losing automation context.",
      ],
      image: {
        ...S.automationWorkflows,
        title: "Abandoned cart automation",
        figure: 2,
        caption: "Figure 2. " + S.automationWorkflows.caption!,
      },
    },
    {
      id: "notifications",
      title: "Order notifications and follow-up",
      paragraphs: [
        "Send order confirmations, shipping updates, and delivery follow-ups on WhatsApp when customers opt in. Template-based messages comply with Meta policies outside the 24-hour session window.",
        "Post-purchase sequences request reviews, suggest complementary products, or check satisfaction — all configurable in Growth Engine with triggers tied to Shopify events.",
      ],
    },
    {
      id: "support-ai",
      title: "Customer support and AI Copilot",
      paragraphs: [
        "AI Copilot suggests answers to product inquiries, return policies, and sizing questions using your conversation history. Agents approve sends, maintaining brand voice while cutting handle time.",
        "Tags and pipeline stages separate pre-sales questions from support tickets. Assign high-value carts to senior agents on Pro plans.",
      ],
      image: {
        ...S.aiCopilot,
        title: "AI-assisted Shopify support",
        figure: 3,
        caption: "Figure 3. " + S.aiCopilot.caption!,
      },
    },
    {
      id: "templates",
      title: "Preset ecommerce automation templates",
      paragraphs: [
        "WhachatCRM includes templates for abandoned cart recovery, order follow-up, customer support handoffs, and re-engagement campaigns. Customize copy, delays, and conditions — then enroll segments or trigger from Shopify events.",
        "See Automation Templates for the full showcase of built-in sequences for Shopify and other industries.",
      ],
      featureCards: [
        {
          title: "Abandoned cart recovery",
          description: "Re-engage shoppers who leave checkout with compliant WhatsApp templates.",
        },
        {
          title: "Order follow-up",
          description: "Confirm delivery, request reviews, and suggest complementary products.",
        },
        {
          title: "Support routing",
          description: "Route keywords to the right owner or auto-acknowledge after hours.",
        },
        {
          title: "Re-engagement",
          description: "Target tagged segments who have not purchased recently.",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Does WhachatCRM work with Shopify Plus?",
      answer: "Yes. WhachatCRM supports standard Shopify and Plus stores through the public app integration.",
    },
    {
      question: "Are WhatsApp messages included in my plan?",
      answer:
        "WhachatCRM subscription covers platform features. Meta bills WhatsApp conversation fees separately — WhachatCRM adds no message markup.",
    },
    {
      question: "Can I use Messenger and Instagram for Shopify support?",
      answer:
        "Yes. Connect Meta channels alongside WhatsApp so customers reach you on their preferred app.",
    },
    {
      question: "Is abandoned cart recovery compliant?",
      answer:
        "Automations use opt-in and template rules required by Meta. Configure consent at checkout and use approved templates for messages outside the session window.",
    },
  ],
  relatedLinks: cluster(
    "automationTemplates",
    "whatsappCrm",
    "unifiedInbox",
    "whatsappApi",
    "aiLeadScoring",
    "userGuide"
  ),
};

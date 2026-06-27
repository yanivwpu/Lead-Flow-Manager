import type { SeoLandingPageConfig } from "./types";
import { cluster } from "./sharedLinks";
import { SEO_BREADCRUMBS } from "@/components/marketing/MarketingBreadcrumbs";

const img = {
  inbox: { src: "/email/activation/inbox.png", alt: "WhachatCRM unified inbox" },
  channels: { src: "/email/activation/channels.png", alt: "WhachatCRM channel settings" },
  embeddedSignup: { src: "/email/activation/embedded-signup.png", alt: "Meta embedded WhatsApp signup" },
  aiCopilot: { src: "/email/activation/ai-copilot.png", alt: "AI Copilot in WhachatCRM" },
  leadQual: { src: "/email/activation/lead-qualification.png", alt: "AI lead qualification" },
  listing: { src: "/email/activation/listing-recommendation.png", alt: "MLS listing recommendations" },
  rge: { src: "/rge-layout-preview.png", alt: "Realtor Growth Engine automation" },
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
  breadcrumbs: SEO_BREADCRUMBS.solutions("CRM with MLS Integration"),
  sections: [
    {
      id: "why-mls-crm",
      title: "Why real estate teams need a CRM with MLS integration",
      paragraphs: [
        "Most CRMs treat property inventory as an afterthought. Agents paste listing links manually, lose track of what a buyer has already seen, and struggle to follow up when MLS status changes. A CRM with MLS integration keeps inventory, conversations, and pipeline stages in one workspace.",
        "WhachatCRM was built for teams that live in WhatsApp and Meta messaging but still need accurate MLS data. When a buyer asks about neighborhoods, price ranges, or bed counts, your team should not be switching tabs to search the MLS — the CRM should surface matches while the conversation is still warm.",
        "With Bridge Interactive, listings sync into WhachatCRM on a schedule. Price changes, new photos, and status updates flow through automatically so AI recommendations and agent replies stay current.",
      ],
      bullets: [
        "Single workspace for chats, contacts, pipeline, and MLS inventory",
        "AI extracts buyer preferences from natural conversation",
        "Automatic listing recommendations tied to each lead",
        "Seller and buyer workflows share the same Growth Engine automations",
      ],
    },
    {
      id: "bridge-interactive",
      title: "Bridge Interactive integration",
      paragraphs: [
        "WhachatCRM integrates with Bridge Interactive to pull listing data from participating MLS feeds. After you connect your Bridge credentials in Settings, inventory appears in the Inventory module and powers AI property matching across the platform.",
        "Synchronization runs on a recurring schedule so your team is not manually exporting spreadsheets. When a listing goes pending or receives a price reduction, that context is available inside the contact sidebar and in automated follow-up sequences.",
        "Bridge Interactive is widely used by brokerages and IDX providers; WhachatCRM focuses on the CRM layer — qualification, messaging, automation, and lead routing — while Bridge supplies authoritative listing data.",
      ],
      image: { ...img.listing, caption: "AI-powered listing recommendations inside a buyer conversation" },
    },
    {
      id: "ai-matching",
      title: "AI property matching and buyer qualification",
      paragraphs: [
        "AI Copilot reads conversation history to infer budget, locations, property type, and timeline. Those signals feed lead scoring and inventory search so your next reply can include relevant listings instead of generic questions.",
        "Buyer qualification is not a one-time form. As the conversation evolves, WhachatCRM updates scores and suggested follow-ups. Hot buyers can be routed to the right agent, enrolled in showing reminders, or tagged for immediate human takeover.",
        "For seller leads, the same CRM captures motivation, timeline, and property details — then triggers seller nurture sequences from the Realtor Growth Engine preset library.",
      ],
      bullets: [
        "AI lead scoring prioritizes ready buyers and sellers",
        "Preference extraction from WhatsApp, Messenger, and Instagram threads",
        "One-click listing shares with conversation context preserved",
        "Pipeline stages reflect qualification progress, not guesswork",
      ],
      image: { ...img.leadQual, caption: "AI lead qualification scores inside the inbox" },
    },
    {
      id: "workflows",
      title: "Automated recommendations and lead routing",
      paragraphs: [
        "Growth Engine workflows can send listing digests, appointment reminders, and no-reply follow-ups when a buyer goes quiet. Triggers include new messages, tag changes, pipeline stage updates, and time-based conditions.",
        "Team assignment on Pro plans ensures the right agent owns each conversation while managers retain visibility in the shared inbox. Internal notes capture showing feedback without exposing private commentary to the client.",
        "Agent Pages — public SEO-friendly profiles with lead capture and home valuation CTAs — feed directly into the same MLS-aware CRM record. A web form submission and a WhatsApp message share one timeline.",
      ],
    },
    {
      id: "get-started",
      title: "Getting started with MLS CRM in WhachatCRM",
      paragraphs: [
        "Start on the Free plan to connect WhatsApp via Meta embedded signup, then upgrade to Pro when you need unlimited users, advanced automations, and Growth Engine templates. Connect Bridge Interactive from Integrations, verify sync, and enable AI Copilot for your workspace.",
        "Our Help Center walks through channel setup, MLS configuration, and preset real estate automations step by step.",
      ],
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
  breadcrumbs: SEO_BREADCRUMBS.solutions("Real Estate CRM"),
  sections: [
    {
      id: "challenge",
      title: "The real estate lead follow-up problem",
      paragraphs: [
        "Real estate leads arrive at all hours — portal inquiries, open house sign-ins, referral texts, and DMs on Instagram. Without a purpose-built real estate CRM, speed-to-lead suffers and hot buyers talk to the next agent who replies first.",
        "Spreadsheets and generic CRMs fail because they were not designed for conversational selling. WhachatCRM treats every message thread as the system of record: notes, tags, pipeline stage, showing history, and MLS context live beside the chat.",
      ],
      image: { ...img.inbox, caption: "Unified inbox for WhatsApp, Messenger, and Instagram" },
    },
    {
      id: "lead-capture",
      title: "Lead capture across channels",
      paragraphs: [
        "Connect WhatsApp through Meta embedded signup, link Facebook Pages for Messenger, and attach Instagram Professional accounts for DM management. Each channel feeds the same contact record.",
        "Public Agent Pages give you an SEO-friendly profile with biography, market areas, branding, and lead forms — including home valuation CTAs. Submissions create CRM contacts instantly and can trigger welcome automations.",
        "QR codes and widget chat extend capture to open houses and listing landing pages without forcing buyers into a phone call first.",
      ],
      bullets: [
        "WhatsApp, Messenger, and Instagram in one inbox",
        "Agent Pages with MLS-backed inventory display",
        "Lead timeline shows every touchpoint chronologically",
        "Tags and pipeline stages tailored to buyer/seller journeys",
      ],
    },
    {
      id: "ai-qualification",
      title: "AI qualification and lead scoring",
      paragraphs: [
        "AI Copilot summarizes long threads, suggests replies, and scores leads based on budget signals, urgency, and engagement. Scores help managers prioritize callbacks and automate nurture for colder leads.",
        "Suggested follow-ups appear when a buyer stops responding or asks for listings in a new area. Conversation insights highlight objections and next best actions without re-reading dozens of messages.",
      ],
      image: { ...img.aiCopilot, caption: "AI Copilot summaries and suggested replies" },
    },
    {
      id: "mls-automation",
      title: "MLS integration and property matching",
      paragraphs: [
        "Bridge Interactive sync keeps listings current inside WhachatCRM. AI matches buyer preferences to inventory and lets agents share properties inside the conversation with full context preserved.",
        "See our dedicated CRM with MLS Integration page for technical setup details and Bridge credential configuration.",
      ],
    },
    {
      id: "growth-engine",
      title: "Follow-up automation with Growth Engine",
      paragraphs: [
        "The Realtor Growth Engine (RGE) ships preset workflows for buyer follow-up, seller nurture, appointment reminders, and no-reply sequences. Install templates, customize copy, and enroll contacts from the inbox sidebar.",
        "Triggers include pipeline stage changes, tags, keywords, and time delays. AI actions can draft messages or update scores mid-workflow when enabled for your plan.",
      ],
      image: { ...img.rge, caption: "Growth Engine automation builder" },
    },
    {
      id: "team",
      title: "Team collaboration and scheduling",
      paragraphs: [
        "Pro plans support unlimited users with conversation assignment, internal notes, and shared visibility. Integrate Calendly or use appointment reminders in automations to reduce no-shows.",
        "Managers see which agent owns each lead, how quickly teams respond, and which automations are driving showings — without exporting reports to a separate BI tool for basic operational visibility.",
      ],
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
  breadcrumbs: SEO_BREADCRUMBS.product("Unified Inbox"),
  sections: [
    {
      id: "what-is",
      title: "What is a unified inbox?",
      paragraphs: [
        "A unified inbox aggregates customer messages from multiple channels into a single queue. Instead of three phones and five browser tabs, your team sees one list sorted by priority, assignment, and last activity.",
        "WhachatCRM goes beyond message aggregation: each thread includes contact details, tags, pipeline stage, internal notes, automation enrollments, and AI-generated summaries. That is what turns a shared inbox into a revenue workspace.",
      ],
      image: { ...img.inbox, caption: "Multi-channel conversations in one inbox" },
    },
    {
      id: "channels",
      title: "WhatsApp, Messenger, and Instagram together",
      paragraphs: [
        "WhatsApp connects through the official Meta Cloud API via embedded signup — no manual token hunting. Facebook Messenger links through your Facebook Page permissions. Instagram Professional accounts connect for DM management alongside Meta's other messaging products.",
        "Channel badges on each conversation show where the customer reached out. Reply from the same thread while respecting each platform's messaging rules, including WhatsApp's 24-hour session window and template requirements for re-engagement.",
      ],
      bullets: [
        "Official Meta API for WhatsApp — embedded signup in minutes",
        "Page-linked Messenger with permission-based setup",
        "Instagram Professional DMs beside WhatsApp threads",
        "Conversation history preserved when channels multiply",
      ],
      image: { ...img.channels, caption: "Connect WhatsApp, Messenger, and Instagram from Settings" },
    },
    {
      id: "ai-copilot",
      title: "AI Copilot inside the inbox",
      paragraphs: [
        "AI Copilot drafts replies, summarizes long threads, scores leads, and recommends follow-ups. Modes range from Manual (human-only) to Suggest (AI drafts, human sends) so you control automation risk.",
        "Lead scoring highlights buyers and sellers ready for the next step — especially valuable when volume spikes and managers need to allocate attention without reading every message.",
      ],
      image: { ...img.aiCopilot, caption: "AI suggestions while you reply" },
    },
    {
      id: "collaboration",
      title: "Team assignments, notes, and ownership",
      paragraphs: [
        "On Pro plans, assign conversations to specific teammates while keeping managers in the loop. Internal notes capture context customers never see — showing feedback, commission discussions, or support escalations.",
        "The contact sidebar holds tags, pipeline stages, follow-up reminders, and campaign enrollment. The lead timeline chronologically records messages, stage changes, and automation events for auditability.",
      ],
    },
    {
      id: "vs-shared",
      title: "Unified inbox vs. basic shared inbox tools",
      paragraphs: [
        "Basic shared inbox products route messages but omit CRM depth. WhachatCRM includes Growth Engine automations, Shopify and MLS integrations, templates, and AI — so the inbox is the hub, not a dead-end queue.",
        "Explore our Shared Team Inbox page for a deeper look at collaboration workflows.",
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
  breadcrumbs: SEO_BREADCRUMBS.solutions("Shopify CRM"),
  sections: [
    {
      id: "why",
      title: "Why Shopify stores need a messaging CRM",
      paragraphs: [
        "Email open rates keep falling while customers expect answers on WhatsApp and Instagram. A Shopify CRM that only sends email misses high-intent moments — cart abandonment, shipping questions, and product comparisons happen in real time.",
        "WhachatCRM embeds onboarding for Shopify merchants: install the app, connect Meta channels, and enable preset automations without hiring an integrator. Order context appears beside the chat so agents never ask for an order number twice.",
      ],
      image: { ...img.inbox, caption: "Customer support with order context in the inbox" },
    },
    {
      id: "install",
      title: "Installing from Shopify and embedded onboarding",
      paragraphs: [
        "Find WhachatCRM in the Shopify App Store and approve permissions. Embedded onboarding walks you through plan selection, WhatsApp embedded signup, and optional Messenger or Instagram connections without leaving Shopify admin.",
        "Billing can flow through Shopify for eligible merchants, keeping subscription management where you already work. Once connected, customer records sync so automations reference live cart and order data.",
      ],
      bullets: [
        "One-click install from Shopify App Store",
        "Guided WhatsApp setup with Meta embedded signup",
        "Optional Messenger and Instagram for omnichannel support",
        "Preset ecommerce templates ready to customize",
      ],
    },
    {
      id: "abandoned-cart",
      title: "Abandoned cart recovery on WhatsApp",
      paragraphs: [
        "Preset abandoned cart workflows message shoppers who leave checkout — using approved WhatsApp templates where required. Combine delays, conditions, and AI-drafted personalization for product names and cart value.",
        "Recovery performs best when support and marketing share one inbox: if a buyer replies with a question, your team continues the thread human-to-human without losing automation context.",
      ],
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
      image: { ...img.aiCopilot, caption: "AI-assisted replies for product inquiries" },
    },
    {
      id: "templates",
      title: "Preset ecommerce automation templates",
      paragraphs: [
        "WhachatCRM includes templates for abandoned cart recovery, order follow-up, customer support handoffs, and re-engagement campaigns. Customize copy, delays, and conditions — then enroll segments or trigger from Shopify events.",
        "See Automation Templates for the full showcase of built-in sequences for Shopify and other industries.",
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

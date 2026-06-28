import type { SeoLandingPageConfig } from "./types";
import { cluster } from "./sharedLinks";
import { SEO_BREADCRUMBS } from "@/components/marketing/MarketingBreadcrumbs";
import { S } from "@shared/marketingScreenshots";

export const whatsappBusinessApiConfig: SeoLandingPageConfig = {
  slug: "whatsapp-business-api",
  title: "WhatsApp Business API Setup & CRM | WhachatCRM",
  metaDescription:
    "Connect the official Meta WhatsApp Business API with embedded signup. Verification, shared inbox, chatbot automations, AI Copilot, analytics, and team collaboration — no BSP markup.",
  keywords: "WhatsApp Business API, official Meta API, WhatsApp Cloud API CRM, embedded signup WhatsApp",
  heroBadge: "Official Meta API",
  h1: "WhatsApp Business API for Teams That Outgrew the App",
  heroIntro:
    "WhachatCRM connects you to Meta's Cloud API through embedded signup — then adds shared inbox, automations, AI Copilot, and CRM context so API access translates into revenue, not complexity.",
  breadcrumbs: SEO_BREADCRUMBS.page("WhatsApp Business API", "whatsapp-business-api"),
  heroImage: {
    ...S.embeddedSignup,
    title: "Meta embedded WhatsApp signup",
    caption: "Connect the official Cloud API inside WhachatCRM — no manual webhook setup for standard workflows.",
  },
  sections: [
    {
      id: "api-vs-app",
      title: "WhatsApp Business App vs. WhatsApp Business API",
      paragraphs: [
        "The free WhatsApp Business app suits solo operators on one phone. The WhatsApp Business API (Cloud API) is Meta's programmatic interface for teams, integrations, templates at scale, and multi-agent access.",
        "Businesses outgrow the app when they need shared visibility, automation, CRM records, or compliance-friendly template messaging after the 24-hour window. The API unlocks those capabilities — but raw API access alone is not a CRM.",
        "WhachatCRM wraps the API with embedded signup, inbox UX, Growth Engine automations, and AI so you never manage webhooks manually for standard sales and support workflows.",
      ],
      image: {
        ...S.connectWhatsapp,
        title: "Connect WhatsApp channel",
        figure: 1,
        caption: "Figure 1. " + S.connectWhatsapp.caption!,
      },
    },
    {
      id: "embedded-signup",
      title: "Embedded signup and verification",
      paragraphs: [
        "Meta embedded signup runs inside WhachatCRM: sign in with Facebook, select your business portfolio, WABA, and phone number. Migrate an existing number or register new — Meta guides verification steps inline.",
      ],
      featureCards: [
        {
          title: "No token copy-paste",
          description: "Standard setup completes inside WhachatCRM without developer credentials.",
        },
        {
          title: "Coexistence options",
          description: "Use Business app + API when Meta eligibility allows.",
        },
        {
          title: "Template sync",
          description: "Approved templates from Meta Business Manager appear in your library.",
        },
        {
          title: "Test before go-live",
          description: "Send test messages before customers see your number.",
        },
      ],
      image: {
        ...S.embeddedSignup,
        title: "Embedded signup flow",
        figure: 2,
        caption: "Figure 2. " + S.embeddedSignup.caption!,
      },
    },
    {
      id: "inbox-automation",
      title: "Shared inbox, chatbot, and automation",
      paragraphs: [
        "Every API message lands in the unified inbox with contact history, tags, and assignments. Growth Engine workflows respond to keywords, pipeline changes, and schedules — functioning as a visual chatbot builder without code.",
        "Approved templates reopen conversations after session expiry. Quick send and library send flows help agents stay compliant while moving fast.",
      ],
      image: {
        ...S.unifiedInbox,
        title: "API messages in the unified inbox",
        figure: 3,
        caption: "Figure 3. " + S.unifiedInbox.caption!,
      },
    },
    {
      id: "ai-analytics",
      title: "AI Copilot, analytics, and team collaboration",
      paragraphs: [
        "AI Copilot summarizes threads, drafts replies, and scores leads. Analytics across conversations and automations show response times, enrollment performance, and channel volume — operational visibility API-only tools often omit.",
        "Pro plans add unlimited teammates with assignment and internal notes. Compare with our Shared Team Inbox and AI Lead Scoring pages for workflow depth.",
      ],
      image: {
        ...S.aiCopilot,
        title: "AI Copilot and analytics",
        figure: 4,
        caption: "Figure 4. " + S.aiCopilot.caption!,
      },
    },
    {
      id: "integrations",
      title: "Shopify, real estate, and support workflows",
      paragraphs: [
        "The same API connection powers Shopify abandoned cart recovery, real estate buyer qualification with MLS data, and customer support at scale. One WhatsApp number, many automations — segmented by tags and triggers.",
      ],
      featureCards: [
        {
          title: "Shopify",
          description: "Cart recovery, order updates, and AI support on one number.",
        },
        {
          title: "Real estate",
          description: "MLS sync, buyer qualification, and listing recommendations.",
        },
        {
          title: "Support at scale",
          description: "Tags, assignments, and templates for high-volume teams.",
        },
        {
          title: "One number, many workflows",
          description: "Segment automations by tags, stages, and triggers.",
        },
      ],
    },
  ],
  faqs: [
    {
      question: "Is WhachatCRM a Meta Business Solution Provider?",
      answer:
        "WhachatCRM provides CRM and inbox software atop Meta's Cloud API. Conversation charges bill through Meta per their pricing; WhachatCRM does not add per-message markup.",
    },
    {
      question: "How long does verification take?",
      answer:
        "Embedded signup completes in minutes when Meta has your business on file. Display name and business verification may take additional review time depending on Meta status.",
    },
    {
      question: "Can I keep using the WhatsApp Business app?",
      answer:
        "Meta offers coexistence in eligible regions and account types. Follow the options presented during embedded signup for your portfolio.",
    },
    {
      question: "Do I need developers?",
      answer:
        "No for standard CRM, inbox, and automation use. Developers can extend via webhooks and integrations where offered.",
    },
  ],
  relatedLinks: cluster(
    "whatsappCrm",
    "unifiedInbox",
    "shopifyCrm",
    "automationTemplates",
    "sharedInbox",
    "bestCrm2026"
  ),
};

export const aiLeadScoringConfig: SeoLandingPageConfig = {
  slug: "ai-lead-scoring",
  title: "AI Lead Scoring & Qualification | WhachatCRM",
  metaDescription:
    "AI lead scoring for WhatsApp and omnichannel sales. Qualify buyers and sellers, prioritize hot leads, automate follow-ups, and route conversations with WhachatCRM AI Copilot.",
  keywords: "AI lead scoring, AI lead qualification, buyer qualification CRM, WhatsApp lead scoring",
  heroBadge: "AI Copilot",
  h1: "AI Lead Scoring That Reads the Conversation — Not Just the Form",
  heroIntro:
    "WhachatCRM AI Copilot extracts intent from messages, assigns lead scores, recommends follow-ups, and triggers automations so your team focuses on buyers and sellers ready to move.",
  breadcrumbs: SEO_BREADCRUMBS.page("AI Lead Scoring", "ai-lead-scoring"),
  heroImage: {
    ...S.leadScore,
    title: "AI lead score panel",
    caption:
      "Lead score, customer insights, and next-best-action recommendations — updated automatically as conversations progress.",
  },
  sections: [
    {
      id: "beyond-forms",
      title: "Beyond static lead forms",
      paragraphs: [
        "Traditional scoring relies on form fields that buyers skip or get wrong. Messaging-first sales happen in natural language — budget mentioned casually, timeline implied, objections buried mid-thread.",
        "AI Copilot analyzes conversation content, engagement patterns, and CRM signals (tags, stages, channel) to produce scores and qualification summaries visible in the inbox sidebar.",
      ],
      image: {
        ...S.leadScore,
        title: "Conversation-based scoring",
        figure: 1,
        caption: "Figure 1. " + S.leadScore.caption!,
      },
    },
    {
      id: "buyer-seller",
      title: "Buyer and seller qualification",
      paragraphs: [
        "Real estate teams benefit when AI distinguishes browsing from buying, rental from purchase, and seller motivation levels. Ecommerce teams prioritize high cart value and repeat purchasers.",
      ],
      featureCards: [
        {
          title: "Buyer signals",
          description: "Budget, area, property type, and timeline extracted from messages.",
        },
        {
          title: "Seller signals",
          description: "Timeline and motivation language scored separately from buyers.",
        },
        {
          title: "Dynamic prioritization",
          description: "Scores climb as engagement increases — lukewarm leads don't stay hidden.",
        },
        {
          title: "Automation triggers",
          description: "Pair scores with Growth Engine enrollments and assignments.",
        },
      ],
      image: {
        ...S.propertyMatchDetails,
        title: "AI explains listing matches",
        figure: 2,
        caption: "Figure 2. " + S.propertyMatchDetails.caption!,
      },
    },
    {
      id: "automation",
      title: "Prioritization and automation",
      paragraphs: [
        "Pair scores with automations: hot leads notify Slack, enroll in fast-follow sequences, or assign senior agents. Cold leads enter nurture workflows without burning human time.",
        "AI actions inside Growth Engine can draft personalized follow-ups or update tags when scores cross thresholds — always reviewable before send unless you enable full auto mode.",
      ],
      image: {
        ...S.automationWorkflows,
        title: "Score-driven automations",
        figure: 3,
        caption: "Figure 3. " + S.automationWorkflows.caption!,
      },
    },
    {
      id: "channels",
      title: "Works across WhatsApp, Messenger, and Instagram",
      paragraphs: [
        "Scoring is channel-agnostic. A buyer who starts on Instagram and moves to WhatsApp retains one timeline and one score — critical for omnichannel campaigns.",
        "Combine with Unified Inbox and Real Estate CRM workflows for end-to-end coverage.",
      ],
      image: {
        ...S.unifiedInbox,
        title: "Omnichannel scoring",
        figure: 4,
        caption: "Figure 4. " + S.unifiedInbox.caption!,
      },
    },
  ],
  faqs: [
    {
      question: "How accurate is AI lead scoring?",
      answer:
        "Scores are assistive signals, not guarantees. Teams should review AI output before major commitments. Accuracy improves when conversations contain clear buyer or seller intent.",
    },
    {
      question: "Which plan includes AI scoring?",
      answer: "AI Assist features begin on Starter; deeper AI Brain capabilities are available as an add-on on Starter and Pro.",
    },
    {
      question: "Can I disable AI for certain inboxes?",
      answer: "Yes. Copilot modes include Manual, Suggest, and Auto — choose per workspace policy.",
    },
    {
      question: "Does scoring work with Shopify?",
      answer: "Yes. Order and cart context enrich ecommerce qualification alongside message content.",
    },
  ],
  relatedLinks: cluster(
    "realEstateCrm",
    "unifiedInbox",
    "automationTemplates",
    "whatsappCrm",
    "shopifyCrm",
    "userGuide"
  ),
};

export const sharedTeamInboxConfig: SeoLandingPageConfig = {
  slug: "shared-team-inbox",
  title: "Shared Team Inbox for WhatsApp & Social | WhachatCRM",
  metaDescription:
    "Shared team inbox with assignments, internal notes, conversation ownership, AI assistance, and full visibility for WhatsApp, Messenger, and Instagram teams.",
  keywords: "shared team inbox, team WhatsApp inbox, collaborative inbox CRM",
  heroBadge: "Team collaboration",
  h1: "Shared Team Inbox With Clear Ownership and AI Assist",
  heroIntro:
    "Give every teammate visibility without chaos. Assign conversations, leave internal notes, track ownership, and let AI Copilot speed replies — across WhatsApp and Meta messaging channels.",
  breadcrumbs: SEO_BREADCRUMBS.page("Shared Team Inbox", "shared-team-inbox"),
  heroImage: {
    ...S.unifiedInbox,
    title: "Shared team inbox",
    caption:
      "Every teammate sees the same thread — assignments, AI Copilot, and CRM context prevent duplicate replies.",
  },
  sections: [
    {
      id: "visibility",
      title: "Team visibility without duplicate replies",
      paragraphs: [
        "Shared inboxes fail when two agents answer the same customer or nobody owns a thread. WhachatCRM assignment on Pro plans marks an owner while keeping the thread searchable for managers.",
        "Activity timestamps and read state reduce collisions. Internal notes document handoffs — 'Buyer pre-approved, send listing packet' — without exposing private commentary to the customer.",
      ],
      image: {
        ...S.unifiedInbox,
        title: "Team visibility in one inbox",
        figure: 1,
        caption: "Figure 1. " + S.unifiedInbox.caption!,
      },
    },
    {
      id: "notes",
      title: "Internal notes and conversation ownership",
      paragraphs: [
        "Notes attach to contacts and conversations, persisting across channel switches. Ownership can transfer when shifts change or specialists take over technical questions.",
      ],
      featureCards: [
        {
          title: "Assign to teammate",
          description: "Mark an owner on Pro plans while keeping threads searchable for managers.",
        },
        {
          title: "Internal notes",
          description: "Handoff context customers never see — invisible to the buyer.",
        },
        {
          title: "Lead timeline",
          description: "Audit trail of messages, stage changes, and automation events.",
        },
        {
          title: "Manager overview",
          description: "Operational visibility without micromanaging every send.",
        },
      ],
    },
    {
      id: "ai",
      title: "AI assistance for high-volume teams",
      paragraphs: [
        "When queues spike, AI Copilot summarizes backlog threads and suggests replies so new agents ramp faster. Lead scoring helps triage which assigned conversations need immediate attention.",
        "Suggested replies maintain tone guidelines when AI Brain is enabled — agents edit and send, preserving quality at scale.",
      ],
      image: {
        ...S.aiCopilot,
        title: "AI Copilot for team triage",
        figure: 2,
        caption: "Figure 2. " + S.aiCopilot.caption!,
      },
    },
    {
      id: "scale",
      title: "From two agents to unlimited users",
      paragraphs: [
        "Starter supports small teams; Pro removes user caps for growing support and sales departments. Same shared inbox powers Shopify support squads and real estate brokerages with dozens of agents.",
        "Pair with Unified Inbox for channel coverage and Automation Templates for consistent follow-ups when owners go offline.",
      ],
    },
  ],
  faqs: [
    {
      question: "How many users can access the inbox?",
      answer: "Free includes one user. Starter supports up to three. Pro includes unlimited users.",
    },
    {
      question: "Can I restrict agents to assigned threads only?",
      answer: "Workspace roles and assignment workflows help limit noise; configure team policy in Settings.",
    },
    {
      question: "Do customers see who replied?",
      answer: "Customers see messages from your business number or page — internal assignment is invisible to them.",
    },
    {
      question: "Is there a mobile app?",
      answer: "Use WhachatCRM in the mobile browser or desktop — optimized inbox works responsively on phones.",
    },
  ],
  relatedLinks: cluster(
    "unifiedInbox",
    "whatsappCrm",
    "aiLeadScoring",
    "whatsappApi",
    "shopifyCrm",
    "pricing"
  ),
};

export const automationTemplatesConfig: SeoLandingPageConfig = {
  slug: "automation-templates",
  title: "Automation Templates for WhatsApp & CRM | WhachatCRM",
  metaDescription:
    "Built-in automation templates for abandoned cart recovery, appointment reminders, buyer and seller follow-up, Shopify, customer support, real estate, and re-engagement campaigns.",
  keywords: "WhatsApp automation templates, CRM workflow templates, abandoned cart WhatsApp automation",
  heroBadge: "Growth Engine presets",
  h1: "Automation Templates Ready to Customize and Deploy",
  heroIntro:
    "WhachatCRM ships preset Growth Engine workflows for ecommerce, real estate, and support — so you launch proven sequences in minutes instead of building from scratch.",
  breadcrumbs: SEO_BREADCRUMBS.page("Automation Templates", "automation-templates"),
  heroImage: {
    ...S.automationWorkflows,
    title: "Active automation workflows",
    caption:
      "Preset Growth Engine sequences for ecommerce, real estate, and support — install, customize, and deploy in minutes.",
  },
  sections: [
    {
      id: "growth-engine",
      title: "What are Growth Engine automation templates?",
      paragraphs: [
        "Templates are pre-built workflows with triggers, conditions, delays, messages, and AI actions. Install a template, customize copy to your brand, and enroll contacts manually or via automation rules.",
        "Unlike one-off broadcasts, templates respect pipeline stages, tags, and no-reply logic — reducing spam risk and keeping follow-ups relevant.",
      ],
      image: {
        ...S.automationWorkflows,
        title: "Growth Engine preset library",
        figure: 1,
        caption: "Figure 1. " + S.automationWorkflows.caption!,
      },
    },
    {
      id: "ecommerce",
      title: "Shopify and ecommerce templates",
      paragraphs: [
        "Abandoned cart recovery messages shoppers who leave checkout. Order follow-up confirms delivery and requests feedback. Product inquiry nurtures browsers who asked questions but did not buy.",
      ],
      featureCards: [
        {
          title: "Abandoned Cart Recovery",
          description: "Re-engage checkout drop-offs with compliant WhatsApp templates.",
        },
        {
          title: "Order follow-up",
          description: "Confirm delivery and request feedback after purchase.",
        },
        {
          title: "Product inquiry nurture",
          description: "Follow up with browsers who asked but didn't buy.",
        },
        {
          title: "Support escalation",
          description: "Route complex issues to the right owner automatically.",
        },
      ],
    },
    {
      id: "real-estate",
      title: "Real estate buyer and seller templates",
      paragraphs: [
        "Buyer follow-up sequences re-engage portal leads and WhatsApp inquiries. Seller nurture tracks listing appointments and market updates. Appointment reminders reduce no-shows for showings.",
        "No-reply workflows follow up when conversations go quiet — with stage conditions that exclude closed or unqualified leads.",
      ],
      image: {
        ...S.inventoryHealth,
        title: "Real estate pipeline stages",
        figure: 2,
        caption: "Figure 2. " + S.inventoryHealth.caption!,
      },
    },
    {
      id: "support-nurture",
      title: "Customer support, lead nurturing, and re-engagement",
      paragraphs: [
        "Support templates route keywords to the right owner or auto-acknowledge after hours. Lead nurturing drips value content over days. Re-engagement campaigns target tagged segments who have not purchased recently.",
        "Each template exposes triggers (new message, tag added, stage changed), conditions (channel, score, time), and AI actions where enabled.",
      ],
    },
    {
      id: "deploy",
      title: "How to install and enroll",
      paragraphs: [
        "Open Automations in the app, browse preset library, and install to your workspace. Edit steps, test with an internal contact, then enroll from the inbox sidebar or via automatic triggers.",
        "Pair templates with AI Lead Scoring so high-intent enrollments get faster sequences while cold leads receive longer nurture.",
      ],
    },
  ],
  faqs: [
    {
      question: "Are templates included on Free?",
      answer: "Basic automations exist on Free; full preset library and advanced workflows require Starter or Pro.",
    },
    {
      question: "Can I duplicate and edit templates?",
      answer: "Yes. Installed templates become your workspace assets — customize freely.",
    },
    {
      question: "Do templates send without approval?",
      answer: "Automations run per your configuration. Human review is recommended before enabling aggressive auto-send.",
    },
    {
      question: "Which templates need WhatsApp templates from Meta?",
      answer: "Messages outside the 24-hour session window require Meta-approved templates — WhachatCRM syncs your template library.",
    },
  ],
  relatedLinks: cluster(
    "shopifyCrm",
    "realEstateCrm",
    "whatsappApi",
    "aiLeadScoring",
    "realtorGrowth",
    "userGuide"
  ),
};

export const whatsappCrmCornerstoneConfig: SeoLandingPageConfig = {
  slug: "whatsapp-crm",
  title: "WhatsApp CRM Software — Shared Inbox, AI & Automation | WhachatCRM",
  metaDescription:
    "Complete WhatsApp CRM guide: Business App vs API, embedded signup, shared inbox, AI Copilot, team collaboration, automations, Shopify and real estate workflows. Free plan available.",
  keywords: "WhatsApp CRM, what is WhatsApp CRM, WhatsApp business CRM, WhatsApp customer management",
  heroBadge: "Cornerstone guide",
  h1: "WhatsApp CRM: The Complete Guide for Growing Businesses",
  heroIntro:
    "WhatsApp CRM software turns messaging into a managed sales and support channel — with shared inbox, AI qualification, Meta embedded signup, automations, and integrations for ecommerce and real estate.",
  breadcrumbs: SEO_BREADCRUMBS.page("WhatsApp CRM", "whatsapp-crm"),
  heroImage: {
    ...S.unifiedInbox,
    title: "AI-powered WhatsApp conversations",
    caption:
      "Your WhatsApp conversations become AI-powered customer conversations — shared inbox, lead scoring, and automations in one CRM.",
  },
  sections: [
    {
      id: "definition",
      title: "What is WhatsApp CRM?",
      paragraphs: [
        "WhatsApp CRM is customer relationship management software built around WhatsApp conversations. It adds organization, context, automation, and team access to chats that would otherwise live on individual phones.",
        "A proper WhatsApp CRM stores conversation history, contact profiles, tags, pipeline stages, internal notes, and follow-up tasks — then connects to the official WhatsApp Business API for compliant scaling.",
      ],
    },
    {
      id: "app-vs-api",
      title: "WhatsApp Business App vs. WhatsApp Business API",
      paragraphs: [
        "The free WhatsApp Business app works for one device and one operator. Teams, templates at scale, CRM integrations, and multi-agent replies require the Cloud API.",
        "Businesses outgrow the app when leads slip through cracks, managers lack visibility, or compliance requires template-based re-engagement after 24 hours. The API solves infrastructure; WhachatCRM solves workflow.",
      ],
      featureCards: [
        {
          title: "Business App",
          description: "Free, single device, manual workflows — fine for solo operators.",
        },
        {
          title: "Cloud API",
          description: "Multi-agent, automation, and template messaging at scale.",
        },
        {
          title: "WhachatCRM",
          description: "Embedded signup + inbox + AI + Growth Engine in one product.",
        },
      ],
      image: {
        ...S.embeddedSignup,
        title: "Embedded signup",
        figure: 1,
        caption: "Figure 1. " + S.embeddedSignup.caption!,
      },
    },
    {
      id: "shared-inbox",
      title: "Shared inbox and team collaboration",
      paragraphs: [
        "A WhatsApp CRM centralizes messages so every teammate sees the same thread history. Assign owners, add internal notes, and prevent duplicate replies — essential when response time determines conversion.",
      ],
      image: {
        ...S.unifiedInbox,
        title: "Shared WhatsApp inbox",
        figure: 2,
        caption: "Figure 2. " + S.unifiedInbox.caption!,
      },
    },
    {
      id: "ai-copilot",
      title: "AI Copilot for scoring, replies, and insights",
      paragraphs: [
        "AI Copilot summarizes long threads, scores leads, drafts replies, and recommends follow-ups. It reduces scroll time and helps managers prioritize hot opportunities without reading every message.",
      ],
      image: {
        ...S.aiCopilot,
        title: "AI Copilot sidebar",
        figure: 3,
        caption: "Figure 3. " + S.aiCopilot.caption!,
      },
    },
    {
      id: "automation-analytics",
      title: "Automation and analytics",
      paragraphs: [
        "Growth Engine workflows automate follow-ups, keyword responses, appointment reminders, and re-engagement. Preset templates cover Shopify abandoned carts, real estate buyer nurture, and support routing.",
      ],
      image: {
        ...S.automationWorkflows,
        title: "Automation workflows",
        figure: 4,
        caption: "Figure 4. " + S.automationWorkflows.caption!,
      },
    },
    {
      id: "shopify-realestate",
      title: "Shopify integration and real estate workflows",
      paragraphs: [
        "Shopify merchants install WhachatCRM from the App Store for cart recovery, order updates, and AI support on WhatsApp. Real estate teams add Bridge MLS sync, agent pages, and buyer qualification automations.",
      ],
      featureCards: [
        {
          title: "Shopify",
          description: "Cart recovery, order notifications, and AI support from the App Store.",
        },
        {
          title: "Real estate",
          description: "MLS sync, agent pages, and buyer qualification automations.",
        },
        {
          title: "Same foundation",
          description: "One WhatsApp CRM — integrations and templates differ by vertical.",
        },
        {
          title: "Growth Engine",
          description: "Preset workflows for both ecommerce and real estate teams.",
        },
      ],
    },
    {
      id: "support",
      title: "Customer support workflows",
      paragraphs: [
        "Support teams tag issues, assign specialists, and use templates for shipping updates or return policies. AI Copilot pulls repeat answers from context while agents handle edge cases.",
        "Omnichannel support adds Messenger and Instagram DMs to the same queue — customers choose the app; your team sees one inbox.",
      ],
      image: {
        ...S.channels,
        title: "Omnichannel support channels",
        figure: 5,
        caption: "Figure 5. " + S.channels.caption!,
      },
    },
  ],
  faqs: [
    {
      question: "Is WhachatCRM a free WhatsApp CRM?",
      answer: "Yes. A Free plan is available with core inbox features. Paid plans add users, AI, and advanced automations.",
    },
    {
      question: "Do I need a developer to set up WhatsApp CRM?",
      answer: "No. Meta embedded signup connects inside WhachatCRM without coding for standard use.",
    },
    {
      question: "Can WhachatCRM replace my existing CRM?",
      answer: "Many SMBs run sales entirely in WhachatCRM. HubSpot sync is available when you need bi-directional CRM sync.",
    },
    {
      question: "How does WhachatCRM compare to WATI or Interakt?",
      answer: "WhachatCRM is CRM-first with transparent pricing and no message markup. See Best WhatsApp CRM 2026 for comparisons.",
    },
    {
      question: "Is WhatsApp CRM legal for marketing?",
      answer: "Yes with opt-in and Meta template rules. WhachatCRM tools enforce session windows and template sends — compliance remains your responsibility.",
    },
    {
      question: "Does it work outside WhatsApp?",
      answer: "Yes. Unified inbox includes Messenger, Instagram, SMS, and web chat on eligible plans.",
    },
  ],
  relatedLinks: cluster(
    "whatsappApi",
    "shopifyCrm",
    "unifiedInbox",
    "realEstateCrm",
    "automationTemplates",
    "bestCrm2026",
    "userGuide"
  ),
};

/**
 * Marketing copy for /realtor-growth-engine.
 * Pricing and capability claims must stay aligned with live product packaging.
 */
import { S } from "@shared/marketingScreenshots";

export const RGE_LANDING_SEO = {
  title: "Realtor Growth Engine | AI CRM for Real Estate Agents | WhachatCRM",
  description:
    "From new lead to booked showing — automatically. AI buyer qualification, live inventory matching where supported, personalized property presentations, channel-aware follow-up, Agent Page, and Unified Inbox + Copilot.",
  keywords:
    "AI CRM for real estate agents, real estate AI CRM, AI for real estate agents, real estate lead follow up automation, real estate lead qualification, real estate CRM with MLS integration, AI property matching, real estate agent CRM, automated real estate follow up, real estate lead management software",
  ogTitle: "Realtor Growth Engine — From New Lead to Booked Showing",
  ogDescription:
    "Qualify buyers, match connected live inventory, present properties, follow up automatically, and move conversations toward a showing — in one AI-powered real estate workspace.",
} as const;

export const RGE_LANDING = {
  hero: {
    eyebrow: "Realtor Growth Engine",
    h1: "From New Lead to Booked Showing — Automatically.",
    support:
      "Qualify buyers, understand exactly what they want, match them with live inventory, create personalized property presentations, follow up automatically, and move conversations toward a showing — from one AI-powered real estate workspace.",
    capabilities: [
      "AI Buyer Qualification",
      "Live Inventory Matching",
      "Personalized Property Flyers",
      "Automated Follow-Up",
      "Agent Page",
      "Unified Inbox + Copilot",
    ],
    cta: "Install Realtor Growth Engine",
    secondaryCta: "See how it works",
  },

  journey: {
    title: "The lead-to-showing journey",
    subtitle: "Understand the product in seconds — from first message to appointment.",
    steps: [
      { label: "New Lead", detail: "Inquiry arrives on a connected channel" },
      { label: "AI Qualifies", detail: "Intent, budget, and readiness from conversation" },
      { label: "Buyer Preferences", detail: "Criteria captured as structured context" },
      { label: "Live Inventory Matching", detail: "Connected inventory evaluated where supported" },
      { label: "Property Flyer", detail: "Polished presentation ready to share" },
      { label: "Smart Follow-Up", detail: "Re-engage while the thread stays actionable" },
      { label: "Showing", detail: "Conversation moves toward a booking" },
    ],
  },

  timeProblem: {
    title: "Spend Less Time Managing Leads. More Time Selling Real Estate.",
    intro:
      "Most agents still do the repetitive middle work by hand — even when the lead is already messaging them.",
    manual: [
      "Respond to every inquiry",
      "Ask the same qualification questions",
      "Remember buyer criteria",
      "Open the MLS and rebuild searches",
      "Copy property links and details",
      "Assemble property presentations",
      "Remember who needs follow-up",
      "Jump between messaging tools",
      "Chase appointments and showings",
    ],
    withRge: [
      "AI helps qualify from natural conversation",
      "Preferences are captured as structured context",
      "Connected inventory can be matched",
      "Property presentations can be generated",
      "Follow-up runs automatically",
      "Conversations stay organized in one inbox",
      "You focus on the relationship and the transaction",
    ],
    closer: "Let AI handle the repetitive work so you can focus on clients, negotiations, and closings.",
  },

  qualification: {
    title: "AI That Understands What Your Buyer Actually Wants",
    exampleQuote:
      "I need a 3-bedroom east of Federal under $700K. A pool would be great, and I don't want a high HOA.",
    exampleNote: "Normal conversation — not a rigid chatbot form.",
    criteriaIntro: "RGE turns that conversation into structured buyer preferences such as:",
    criteria: [
      "Buy / Rent",
      "Areas",
      "Property type",
      "Bedrooms",
      "Bathrooms",
      "Budget",
      "Pool",
      "Waterfront",
      "Square footage",
      "HOA",
      "Year built",
      "Other supported criteria",
    ],
    powers: [
      "Qualification",
      "Lead scoring",
      "Inventory matching",
      "Follow-up",
      "Copilot recommendations",
    ],
    powersIntro: "That buyer intelligence then powers:",
  },

  inventory: {
    title: "Your Live Inventory Meets AI",
    subtitle: "Turn buyer preferences into relevant property matches",
    body: [
      "Once WhachatCRM understands what a buyer wants, the Realtor Growth Engine can compare those preferences against your connected live inventory and surface relevant properties.",
      "Spend less time searching and more time selling. Turn buyer conversations into relevant property options without rebuilding the same search manually.",
    ],
    criteriaIntro: "Supported matching criteria include:",
    criteria: [
      "Buy / rent",
      "Location",
      "Property type",
      "Bedrooms & bathrooms",
      "Budget",
      "Pool",
      "Waterfront",
      "Square footage",
      "HOA",
      "Year built",
      "Active inventory",
      "Coming Soon where supported",
    ],
    beforeTitle: "Old manual process",
    before: [
      "Buyer explains criteria",
      "Agent records it",
      "Opens MLS",
      "Applies filters",
      "Searches listings",
      "Sends options",
      "Repeats when criteria change",
    ],
    afterTitle: "With RGE",
    after: [
      "Buyer explains criteria",
      "AI captures preferences",
      "Connected inventory is evaluated",
      "Relevant properties surface",
      "Agent reviews and shares",
      "Conversation moves forward",
    ],
    accuracyNote:
      "Inventory matching uses your connected live inventory / MLS feed where supported — WhachatCRM is not an MLS, and coverage depends on your connected providers and market.",
  },

  flyer: {
    title: "From Property Match to Professional Presentation",
    subtitle: "Match it. Present it. Keep the conversation moving.",
    body: [
      "Finding the right listing is only part of the work. WhachatCRM can turn relevant inventory into a polished, shareable property flyer experience you can use with the buyer.",
      "Give every buyer a polished property experience without rebuilding it by hand.",
    ],
    canInclude: [
      "Property image",
      "Price",
      "Beds & baths",
      "Square footage",
      "HOA",
      "Year built",
      "Property information",
      "QR / share experience",
    ],
    beforeTitle: "Without RGE",
    before: [
      "Find listing",
      "Copy information",
      "Copy links",
      "Assemble a message or presentation",
      "Send manually",
    ],
    afterTitle: "With RGE",
    after: [
      "Match property",
      "Generate a polished property presentation",
      "Share with the buyer",
      "Continue toward a showing",
    ],
  },

  nurture: {
    title: "Follow Up While the Conversation Is Still Actionable",
    body: [
      "No lead should disappear simply because your day got busy.",
      "WhachatCRM can automatically re-engage quiet leads while respecting the messaging rules of the channel being used — so follow-up stays useful, not reckless.",
    ],
    includes: [
      "Next-day re-engagement",
      "Quiet-lead nurture",
      "Week nurture",
      "Opt-out handling",
      "AI scoring",
      "Channel-aware messaging eligibility",
    ],
    channelNote:
      "On WhatsApp and other Meta channels, free-form automation only sends when messaging eligibility allows. Later nurture steps do not force ineligible free-form sends outside the customer-service window.",
  },

  inbox: {
    title: "Every Buyer Conversation. One Workspace.",
    body: [
      "RGE is not another isolated lead system. Connected conversations live in the WhachatCRM Unified Inbox across supported channels.",
      "The agent shouldn't have to remember everything a buyer said three days ago.",
    ],
    copilotHelps: [
      "Lead score",
      "Buyer intent",
      "Buyer preferences",
      "Qualification status",
      "Relevant inventory actions",
      "Follow-up recommendations",
      "Booking / showing actions",
      "Contact context",
    ],
  },

  scoring: {
    title: "Know Who Needs Your Attention First",
    body: "RGE helps you prioritize attention instead of treating every inquiry the same. Leads can surface conceptually as Hot, Warm, New, Low, or Unqualified — so serious conversations get to you faster.",
    buckets: ["Hot", "Warm", "New", "Low", "Unqualified"],
  },

  agentPage: {
    title: "Your Real Estate Presence, Built Into Your Growth Engine",
    body: [
      "Agents often depend on brokerage profiles, portal pages, social media, and generic link tools. The WhachatCRM Agent Page gives you another branded destination connected directly to your growth system.",
      "Give prospects somewhere useful to learn about you, explore your real estate presence, view available inventory where enabled, and become a lead.",
    ],
    capabilities: [
      "Public Agent Page",
      "Custom URL / slug",
      "Business / agent profile",
      "Custom bio",
      "Market / service areas",
      "Connected inventory visibility where enabled",
      "Lead capture",
      "Home-value lead capture where enabled",
      "Inventory sources",
      "Branded public presence",
    ],
  },

  agentPageSeo: {
    title: "Build a More Searchable Real Estate Presence",
    body: [
      "A properly configured public Agent Page creates another crawlable, agent-specific destination with useful business, real-estate, and market context.",
      "It can strengthen your branded search presence and give you another SEO-friendly URL to share from social media, Google Business Profile, email, and outreach — with less dependence on third-party profile pages alone.",
    ],
    benefits: [
      "Additional indexable real-estate content",
      "Stronger branded search presence",
      "Local / market relevance",
      "Another URL for social and outreach",
      "Another destination from Google Business Profile",
      "Less dependence on third-party profiles",
    ],
    disclaimer:
      "SEO-friendly and indexable does not mean guaranteed rankings or guaranteed SEO leads. Results vary by market, content quality, and search competition.",
  },

  showing: {
    title: "Don't Stop at Qualification. Move Toward the Showing.",
    subtitle: "AI responses are not the end goal — conversion is.",
    flow: [
      "Conversation",
      "Qualification",
      "Buyer Preferences",
      "Property Matches",
      "Property Presentation",
      "Follow-Up",
      "Showing / Appointment",
    ],
  },

  comparison: {
    title: "Before RGE vs with RGE",
    beforeTitle: "Before RGE",
    before: [
      "Manually answer repetitive questions",
      "Manually track buyer criteria",
      "Manually search MLS",
      "Copy listing links and details",
      "Assemble property presentations",
      "Remember follow-ups",
      "Jump between messaging tools",
      "Manually prioritize leads",
      "Chase appointments",
    ],
    afterTitle: "With RGE",
    after: [
      "AI-assisted qualification",
      "Automatic buyer preference capture",
      "Live inventory matching where supported",
      "Personalized property flyers",
      "Channel-aware nurture",
      "Unified Inbox",
      "AI lead prioritization",
      "Copilot recommendations",
      "Showing / appointment workflow",
    ],
  },

  stack: {
    title: "Stop Stitching Together Your Real Estate Tech Stack",
    body: [
      "Agents often combine a CRM, chatbot, follow-up tool, MLS/property search, property sharing, calendar, website/profile, and multiple messaging apps — then reconnect the same lead context by hand.",
      "The Realtor Growth Engine connects these functions around the same lead and conversation. It does not replace your MLS.",
    ],
    tools: [
      "CRM",
      "Chatbot",
      "Follow-up tool",
      "MLS / property search",
      "Property sharing",
      "Calendar",
      "Website / profile",
      "Messaging apps",
    ],
  },

  included: {
    title: "What's included",
    subtitle: "A specialized real-estate conversion system — not a generic chatbot pack.",
    items: [
      "Real-estate AI qualification",
      "Buyer preference capture",
      "AI lead scoring",
      "Connected live inventory matching where supported",
      "Personalized property flyer / share workflow",
      "Channel-aware automated nurture",
      "Showing / appointment conversion workflow",
      "Agent Page",
      "Lead-capture tools",
      "Unified Inbox",
      "AI Copilot",
      "Real-estate pipeline",
      "Prebuilt fields",
      "Prebuilt tags",
      "Real-estate workflows",
      "White-glove launch / setup",
    ],
  },

  whoFor: {
    title: "Who it's for",
    subtitle: "Built for agents and teams who want a repeatable lead-to-showing process. Inventory availability still depends on your connected feeds and market.",
    audiences: [
      {
        title: "Individual agents",
        desc: "Save time and create a repeatable lead-to-showing process.",
      },
      {
        title: "Buyer agents",
        desc: "Turn buyer conversations into structured criteria and relevant inventory matches.",
      },
      {
        title: "Listing-focused agents",
        desc: "Capture and nurture seller / home-value opportunities where enabled.",
      },
      {
        title: "Teams",
        desc: "Standardize lead handling and follow-up across agents.",
      },
      {
        title: "Brokerages",
        desc: "Give agents a repeatable AI-powered real-estate conversion framework.",
      },
    ],
  },

  pricing: {
    title: "What powers the Realtor Growth Engine",
    subtitle:
      "Three layers with clear jobs — not three charges for the same thing.",
    layers: [
      {
        label: "Core platform",
        name: "WhachatCRM Pro",
        price: "$49/mo",
        desc: "Core CRM, messaging, and platform.",
      },
      {
        label: "Intelligence layer",
        name: "AI Brain",
        price: "Included with Pro",
        desc: "The intelligence layer for deeper qualification and real-estate AI context — included with Pro.",
      },
      {
        label: "Real-estate system",
        name: "Realtor Growth Engine",
        price: "$199",
        priceNote: "one-time",
        desc: "Specialized real-estate workflows, qualification, fields, pipeline, inventory-driven buyer journey, Agent Page setup, and configuration.",
      },
    ],
    explain:
      "Pro gives you the platform, including AI Brain. The Realtor Growth Engine adds the specialized real-estate system built on top.",
    metaNote: "WhatsApp messaging fees are billed directly by Meta with no markup.",
    cta: "Install Realtor Growth Engine",
    viewPlans: "View all plans",
  },

  whiteGlove: {
    title: "White-glove setup — not DIY guesswork",
    subtitle:
      "RGE is not “buy a template and figure it out.” Guided launch helps you go live with confidence.",
    items: [
      "Live session with a setup specialist",
      "WhatsApp Business API / Meta verification assistance",
      "Automation workflows configured and tested",
      "CRM pipeline and real-estate fields ready",
      "Calendar / booking connection support",
      "End-to-end check before you go live",
    ],
  },

  faq: [
    {
      q: "Does WhachatCRM replace my MLS?",
      a: "No. RGE works with connected live inventory / MLS feeds where supported. WhachatCRM is not an MLS and does not claim universal MLS coverage.",
    },
    {
      q: "What do I need to run the Realtor Growth Engine?",
      a: "WhachatCRM Pro (AI Brain included) and the $199 one-time Realtor Growth Engine license. WhatsApp Business connection is part of activation for messaging workflows.",
    },
    {
      q: "How does follow-up work on WhatsApp?",
      a: "RGE includes next-day re-engagement and multi-step nurture with channel-aware eligibility. Free-form automation only sends when the messaging window allows — it does not force ineligible free-form sends outside Meta’s customer-service window.",
    },
    {
      q: "What is the Agent Page?",
      a: "A public, branded agent destination with profile, market areas, lead capture, and inventory visibility where enabled — connected to the same growth system that handles your conversations.",
    },
    {
      q: "Will the Agent Page guarantee Google rankings?",
      a: "No. A configured Agent Page is SEO-friendly and indexable, which can strengthen your online presence — but rankings and SEO leads are never guaranteed.",
    },
    {
      q: "Is setup included?",
      a: "Yes. White-glove / guided launch helps with configuration, workflow testing, and going live — so you’re not left assembling the system alone.",
    },
  ],

  finalCta: {
    title: "Turn more conversations into matches and showings",
    subtitle:
      "From first message to property match to showing, the Realtor Growth Engine helps handle the repetitive work between each step.",
    cta: "Install Realtor Growth Engine",
    viewPlans: "View all plans",
    note: "Requires an active Pro plan. $199 one-time RGE license. No unsupported conversion guarantees.",
  },

  screenshots: {
    inventory: {
      ...S.propertyMatching,
      alt: "WhachatCRM inventory matches ranked in the inbox sidebar from buyer preferences",
      caption: "Connected live inventory matches surface beside the buyer conversation.",
      size: "content" as const,
    },
    inventoryDetail: {
      ...S.propertyMatchDetails,
      alt: "WhachatCRM AI property recommendation with listing details",
      caption: "See why a listing matches location, budget, beds, and lifestyle criteria.",
      size: "content" as const,
    },
    inbox: {
      ...S.unifiedInbox,
      alt: "WhachatCRM Unified Inbox with multi-channel real estate conversation",
      caption: "Every buyer conversation in one workspace — across supported channels.",
      size: "content" as const,
    },
    copilot: {
      ...S.aiCopilot,
      alt: "WhachatCRM AI Copilot with lead score and recommendations",
      caption: "Copilot surfaces score, preferences, and next actions from the conversation.",
      size: "compact" as const,
    },
    leadScore: {
      ...S.leadScore,
      alt: "WhachatCRM lead score and buyer insights panel",
      caption: "Buyer criteria extracted from natural conversation — not a rigid form.",
      size: "compact" as const,
    },
    agentPage: {
      src: "/images/screenshots/agent-page-public-live.png",
      alt: "WhachatCRM public Agent Page showing agent profile, market areas, CTAs, and property inventory",
      caption: "Public Agent Page for brand presence, lead capture, and inventory where enabled.",
      width: 829,
      height: 595,
      size: "hero" as const,
    },
    agentSettings: {
      ...S.agentPageSettings,
      alt: "WhachatCRM Agent Page settings with market areas",
      caption: "Configure bio, market areas, and public profile settings.",
      size: "compact" as const,
    },
    workflows: {
      ...S.automationWorkflows,
      alt: "Realtor Growth Engine automation workflows in WhachatCRM",
      caption: "Real-estate workflows for qualification, nurture, and booking intent.",
      size: "content" as const,
    },
    inventorySource: {
      ...S.inventorySource,
      alt: "WhachatCRM inventory source connection settings",
      caption: "Connect live inventory feeds where supported for AI property matching.",
      size: "content" as const,
    },
  },
} as const;

/**
 * Industry solution page content — unique copy per industry.
 * Capabilities listed here must match verified platform behavior.
 */

export type SolutionLink = {
  label: string;
  href: string;
  description?: string;
};

export type SolutionChallenge = {
  title: string;
  description: string;
};

export type SolutionHelpPoint = {
  title: string;
  description: string;
};

export type SolutionWorkflowStep = {
  label: string;
  description: string;
};

export type SolutionProduct = {
  label: string;
  description: string;
  href?: string;
};

export type SolutionUseCase = {
  situation: string;
  action: string;
  outcome: string;
};

export type SolutionHowStep = {
  title: string;
  description: string;
};

export type SolutionPageContent = {
  path: string;
  /** Short industry label for nav / eyebrow */
  industryLabel: string;
  /** Breadcrumb current page label */
  breadcrumbLabel: string;
  title: string;
  metaDescription: string;
  ogTitle?: string;
  h1: string;
  heroIntro: string;
  /** Lightweight hero mock conversation — unique per industry */
  heroVisual: {
    inquiryLabel: string;
    inquiryMessage: string;
    suggestionLabel: string;
    suggestionMessage: string;
    stageLabel: string;
    nextStep: string;
  };
  /** H2 under Industry challenges */
  challengesHeading: string;
  secondaryCta: SolutionLink;
  challenges: SolutionChallenge[];
  helpsIntro: string;
  helpsPoints: SolutionHelpPoint[];
  workflowTitle: string;
  workflowSteps: SolutionWorkflowStep[];
  products: SolutionProduct[];
  useCases: SolutionUseCase[];
  channels: string[];
  integrations: SolutionLink[];
  howItWorks: SolutionHowStep[];
  relatedLinks: SolutionLink[];
  finalCtaHeadline: string;
  finalCtaSubtitle: string;
  /** Short SSR bullets for crawlable body */
  ssrBullets: string[];
};

export const realEstateSolution: SolutionPageContent = {
  path: "/real-estate-crm",
  industryLabel: "Real Estate",
  breadcrumbLabel: "Real Estate",
  title: "Real Estate CRM for Agents & Teams | WhachatCRM",
  metaDescription:
    "Real estate CRM with WhatsApp, Unified Inbox, AI qualification, MLS matching, and follow-up automation. Capture buyer and seller leads and move conversations toward booked showings.",
  ogTitle: "Real Estate CRM — Capture, Qualify & Convert | WhachatCRM",
  h1: "Capture, Qualify, and Convert Real Estate Leads Across Every Channel",
  heroIntro:
    "WhachatCRM brings messaging, AI qualification, inventory context, and follow-up automation together so agents and teams can move from a new inquiry to a booked showing without losing the thread.",
  heroVisual: {
    inquiryLabel: "Buyer inquiry",
    inquiryMessage: "Looking in Miami under $750k — 3 beds, move-in within 2 months.",
    suggestionLabel: "AI Copilot suggestion",
    suggestionMessage: "Confirm budget and timeline, score the lead, then share matching listings.",
    stageLabel: "Qualified buyer",
    nextStep: "Next: share matched properties",
  },
  challengesHeading: "What real estate teams struggle with",
  secondaryCta: {
    label: "Explore Realtor Growth Engine",
    href: "/realtor-growth-engine",
  },
  challenges: [
    {
      title: "Leads arrive everywhere",
      description:
        "Portal inquiries, open-house sign-ups, Instagram DMs, and WhatsApp texts scatter across phones and apps.",
    },
    {
      title: "Qualification happens too late",
      description:
        "Budget, timeline, and location preferences get lost in long threads, so agents chase the wrong conversations.",
    },
    {
      title: "Follow-up falls through",
      description:
        "When a buyer goes quiet, manual reminders slip — and the next agent who replies first wins the showing.",
    },
    {
      title: "Inventory lives outside the chat",
      description:
        "Matching listings to buyer preferences often means switching tools and losing conversation context.",
    },
  ],
  helpsIntro:
    "WhachatCRM treats every message as part of a real estate workflow — not a standalone chat.",
  helpsPoints: [
    {
      title: "One inbox for every channel",
      description:
        "WhatsApp, Messenger, Instagram, Email, and more land in Unified Inbox with shared ownership and notes.",
    },
    {
      title: "AI that understands buyer and seller intent",
      description:
        "AI Brain and AI Copilot help capture preferences, score leads, and suggest the next reply or follow-up.",
    },
    {
      title: "Inventory beside the conversation",
      description:
        "Where MLS is connected, match listings to preferences and share next steps without leaving the thread.",
    },
    {
      title: "Growth Engine automation for real estate",
      description:
        "Realtor Growth Engine packages follow-up workflows, templates, and industry intelligence for agents and teams.",
    },
  ],
  workflowTitle: "From new inquiry to booked showing",
  workflowSteps: [
    {
      label: "New buyer or seller inquiry",
      description: "A lead messages on WhatsApp, Instagram, Messenger, or your agent page.",
    },
    {
      label: "Capture preferences and intent",
      description: "Location, budget, timeline, and property needs are recorded beside the chat.",
    },
    {
      label: "AI qualification and scoring",
      description: "AI Brain and Copilot help prioritize hot opportunities and recommend next actions.",
    },
    {
      label: "Match relevant inventory",
      description: "Where connected, suggest listings that fit and keep context in the conversation.",
    },
    {
      label: "Share next steps",
      description: "Send property details, flyers, or a booking link while the thread stays organized.",
    },
    {
      label: "Automate follow-up",
      description: "Reminders and Growth Engine workflows keep quiet leads moving toward a showing.",
    },
  ],
  products: [
    {
      label: "Unified Inbox",
      description: "Shared conversations across messaging channels with CRM context.",
      href: "/unified-inbox",
    },
    {
      label: "AI Copilot",
      description: "In-thread assistance for replies, summaries, and lead context.",
      href: "/#ai-copilot",
    },
    {
      label: "AI Brain",
      description: "Deeper qualification, personalization, and AI features across the platform.",
      href: "/#ai-brain",
    },
    {
      label: "Automations",
      description: "Follow-up workflows and templates for buyer and seller nurture.",
      href: "/automation-templates",
    },
    {
      label: "MLS / inventory matching",
      description: "Connect inventory and match buyers where MLS integration is enabled.",
      href: "/crm-with-mls-integration",
    },
    {
      label: "Realtor Growth Engine",
      description: "The live Growth Engine for real estate workflows and setup.",
      href: "/realtor-growth-engine",
    },
    {
      label: "Prospect AI",
      description: "Find and qualify local businesses when your growth motion includes outbound prospecting.",
      href: "/prospect-ai",
    },
  ],
  useCases: [
    {
      situation: "A buyer messages about homes in a specific neighborhood and budget range.",
      action:
        "Capture preferences in the conversation, score the lead, and surface matching inventory where connected.",
      outcome: "The agent responds with relevant next steps instead of restarting the discovery call.",
    },
    {
      situation: "A seller asks about listing their home after weeks of quiet browsing.",
      action:
        "Recognize seller intent with AI assistance, assign an owner, and recommend the correct follow-up path.",
      outcome: "The team books a consultation instead of losing the inquiry in a personal inbox.",
    },
    {
      situation: "A hot lead goes silent after receiving listings.",
      action: "Trigger no-reply follow-up automation while preserving pipeline stage and notes.",
      outcome: "The conversation restarts before the buyer moves on to another agent.",
    },
    {
      situation: "An agent wants to share a curated set of properties from the live chat.",
      action: "Use inventory context and shareable property presentations from the workspace.",
      outcome: "Buyers get clear options without the agent rebuilding materials in another tool.",
    },
  ],
  channels: ["WhatsApp", "Instagram", "Facebook Messenger", "Email", "SMS", "Web chat"],
  integrations: [
    { label: "MLS / Bridge Interactive", href: "/crm-with-mls-integration" },
    { label: "Calendly", href: "/#integrations" },
    { label: "Meta Embedded Signup", href: "/whatsapp-business-api" },
  ],
  howItWorks: [
    {
      title: "Connect your channels",
      description: "Use guided Meta onboarding for WhatsApp and supported social channels.",
    },
    {
      title: "Invite your team",
      description: "Assign conversations, leave notes, and keep every lead visible in one inbox.",
    },
    {
      title: "Add AI and automation",
      description: "Enable Copilot assistance and install real estate follow-up workflows where entitled.",
    },
    {
      title: "Layer Growth Engine when ready",
      description: "Use Realtor Growth Engine for packaged real estate workflows and setup support.",
    },
  ],
  relatedLinks: [
    {
      label: "Realtor Growth Engine",
      href: "/realtor-growth-engine",
      description: "Product page for the live real estate Growth Engine.",
    },
    {
      label: "CRM with MLS Integration",
      href: "/crm-with-mls-integration",
      description: "Inventory sync and AI property matching details.",
    },
    {
      label: "AI Lead Scoring",
      href: "/ai-lead-scoring",
      description: "How Copilot prioritizes hot buyers and sellers.",
    },
    {
      label: "Automation Templates",
      href: "/automation-templates",
      description: "Ready-to-customize follow-up workflows.",
    },
  ],
  finalCtaHeadline: "Turn more real estate conversations into booked showings",
  finalCtaSubtitle:
    "Start free, connect your channels, and bring AI qualification and follow-up into the same workspace your team already messages from.",
  ssrBullets: [
    "Unified Inbox for WhatsApp and supported messaging channels",
    "AI qualification, lead scoring, and Copilot assistance",
    "MLS inventory matching where connected",
    "Automated buyer and seller follow-up workflows",
    "Realtor Growth Engine for packaged real estate growth",
  ],
};

export const ecommerceSolution: SolutionPageContent = {
  path: "/solutions/ecommerce",
  industryLabel: "E-commerce",
  breadcrumbLabel: "E-commerce",
  title: "E-commerce CRM & Customer Messaging | WhachatCRM",
  metaDescription:
    "E-commerce CRM and customer messaging for WhatsApp, Instagram, Facebook, SMS, and Email. Unify shopper conversations, automate follow-up, and connect Shopify where supported.",
  ogTitle: "E-commerce Messaging & CRM Solution | WhachatCRM",
  h1: "Turn Every Shopper Conversation Into More Revenue",
  heroIntro:
    "WhachatCRM helps e-commerce teams capture product questions, manage support conversations, personalize follow-up with AI, and keep Shopify context connected to the broader messaging workspace.",
  heroVisual: {
    inquiryLabel: "Shopper DM",
    inquiryMessage: "Does the navy hoodie ship today? Looking for size M.",
    suggestionLabel: "AI Copilot suggestion",
    suggestionMessage: "Confirm size availability, share shipping timing, and tag for post-purchase follow-up.",
    stageLabel: "Product intent",
    nextStep: "Next: assign support reply",
  },
  challengesHeading: "What e-commerce teams struggle with",
  secondaryCta: { label: "See Shopify CRM", href: "/shopify-crm" },
  challenges: [
    {
      title: "Shopper questions arrive after hours",
      description: "Product DMs and WhatsApp inquiries pile up while the store team is offline.",
    },
    {
      title: "Support is scattered across apps",
      description: "Instagram, WhatsApp, Email, and store chat each hold a different slice of the customer story.",
    },
    {
      title: "Repetitive answers burn agent time",
      description: "Shipping, sizing, and availability questions repeat — without a shared playbook.",
    },
    {
      title: "Follow-up stops after the first reply",
      description: "Warm shoppers who did not buy need structured nurture, not one-off messages.",
    },
  ],
  helpsIntro:
    "Combine Unified Inbox, AI assistance, automations, and Shopify connection so messaging becomes part of the revenue workflow.",
  helpsPoints: [
    {
      title: "One place for shopper conversations",
      description: "Bring WhatsApp, Instagram, Facebook, SMS, Email, and web chat into Unified Inbox.",
    },
    {
      title: "AI that helps agents move faster",
      description: "AI Copilot drafts replies and surfaces context; AI Brain supports personalization where enabled.",
    },
    {
      title: "Automation for repeatable journeys",
      description: "Use workflows, chatbots, and campaigns to handle common questions and re-engagement.",
    },
    {
      title: "Shopify beside the conversation",
      description: "Connect Shopify so store and messaging context can work together where currently supported.",
    },
  ],
  workflowTitle: "From shopper inquiry to ongoing relationship",
  workflowSteps: [
    {
      label: "Shopper inquiry",
      description: "A customer asks about a product on WhatsApp, Instagram, or your website chat.",
    },
    {
      label: "Capture or answer intent",
      description: "A chatbot or teammate handles the first response and records what the shopper needs.",
    },
    {
      label: "Conversation enters Unified Inbox",
      description: "The thread joins one shared queue with ownership, notes, and channel context.",
    },
    {
      label: "AI Copilot assists the reply",
      description: "Agents get help summarizing history and drafting clear, on-brand responses.",
    },
    {
      label: "Recommend the next action",
      description: "AI Brain helps prioritize follow-up and personalize the path where enabled.",
    },
    {
      label: "Automate nurture",
      description: "Workflows and campaigns continue the relationship after the first conversation.",
    },
  ],
  products: [
    {
      label: "Unified Inbox",
      description: "Omnichannel shopper and support conversations in one workspace.",
      href: "/unified-inbox",
    },
    {
      label: "Chatbots",
      description: "Automated first responses for common product and support questions.",
      href: "/whatsapp-business-api#inbox-automation",
    },
    {
      label: "Automations & Campaigns",
      description: "Follow-up workflows and re-engagement sequences for contacts you already have.",
      href: "/automation-templates",
    },
    {
      label: "AI Copilot",
      description: "In-thread assistance for faster, higher-quality replies.",
      href: "/#ai-copilot",
    },
    {
      label: "AI Brain",
      description: "Personalization and AI features across eligible plans.",
      href: "/#ai-brain",
    },
    {
      label: "Team Collaboration",
      description: "Assignments, notes, and shared ownership for support and sales.",
      href: "/shared-team-inbox",
    },
    {
      label: "Shopify integration",
      description: "Connect Shopify and explore store-aware messaging workflows.",
      href: "/shopify-crm",
    },
  ],
  useCases: [
    {
      situation: "A shopper asks about sizing or stock on Instagram or WhatsApp.",
      action: "Route the message into Unified Inbox and reply with full conversation history visible.",
      outcome: "The team answers quickly without hunting across social inboxes.",
    },
    {
      situation: "Product questions arrive outside business hours.",
      action: "Use a website or messaging chatbot to capture intent and set expectations.",
      outcome: "Leads are waiting in the inbox when the team starts the next shift.",
    },
    {
      situation: "Support volume spikes during a launch.",
      action: "Assign conversations, use Copilot for draft replies, and keep notes on the contact.",
      outcome: "Customers get consistent answers without duplicate agent replies.",
    },
    {
      situation: "Past buyers have gone quiet.",
      action: "Run a campaign or automation to re-engage tagged contacts with relevant follow-up.",
      outcome: "Messaging becomes an ongoing relationship channel, not only reactive support.",
    },
    {
      situation: "Your store already runs on Shopify.",
      action: "Connect Shopify and use WhachatCRM for conversation management around the store.",
      outcome: "Messaging and store workflows share one operator workspace where supported.",
    },
  ],
  channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
  integrations: [
    { label: "Shopify", href: "/shopify-crm" },
    { label: "Stripe", href: "/#integrations" },
    { label: "Meta messaging", href: "/whatsapp-business-api" },
  ],
  howItWorks: [
    {
      title: "Connect messaging channels",
      description: "Set up WhatsApp via Meta Embedded Signup and add the social channels you already use.",
    },
    {
      title: "Connect Shopify when ready",
      description: "Install the Shopify connection so store context can sit beside conversations.",
    },
    {
      title: "Build first-response flows",
      description: "Use chatbots and automation templates for common shopper questions.",
    },
    {
      title: "Enable AI for your team",
      description: "Turn on Copilot assistance so agents reply faster with better context.",
    },
  ],
  relatedLinks: [
    {
      label: "Shopify CRM",
      href: "/shopify-crm",
      description: "Shopify integration and ecommerce messaging details.",
    },
    {
      label: "Unified Inbox",
      href: "/unified-inbox",
      description: "Omnichannel inbox for shopper and support conversations.",
    },
    {
      label: "Automation Templates",
      href: "/automation-templates",
      description: "Preset workflows for follow-up and nurture.",
    },
    {
      label: "WhatsApp Business API",
      href: "/whatsapp-business-api",
      description: "Official API onboarding for messaging at scale.",
    },
  ],
  finalCtaHeadline: "Make every shopper conversation easier to convert",
  finalCtaSubtitle:
    "Start free, unify your channels, and connect Shopify when you are ready to bring store and messaging workflows together.",
  ssrBullets: [
    "Unified Inbox for WhatsApp, Instagram, Facebook, SMS, Email, and web chat",
    "Chatbots and automations for common shopper questions",
    "AI Copilot assistance for support and sales replies",
    "Campaigns and follow-up for existing contacts",
    "Shopify connection for store-aware messaging workflows",
  ],
};

export const localServiceSolution: SolutionPageContent = {
  path: "/solutions/local-service-businesses",
  industryLabel: "Local & Service Businesses",
  breadcrumbLabel: "Local & Service Businesses",
  title: "CRM for Local Service Businesses | WhachatCRM",
  metaDescription:
    "CRM and messaging for local service businesses. Find and qualify leads with Prospect AI, capture service requests, assign work, share booking links, and automate follow-up.",
  ogTitle: "Local Service Business CRM & Messaging | WhachatCRM",
  h1: "From Finding Local Customers to Booking the Next Job",
  heroIntro:
    "Built for contractors, home-service providers, professional services, and appointment-based local businesses that win work through conversations — not just forms.",
  heroVisual: {
    inquiryLabel: "Service request",
    inquiryMessage: "Need AC repair in ZIP 33139 — can someone come this week?",
    suggestionLabel: "AI Copilot suggestion",
    suggestionMessage: "Confirm service area and urgency, then share a booking link with the right technician.",
    stageLabel: "Job-ready lead",
    nextStep: "Next: send booking link",
  },
  challengesHeading: "What local service teams struggle with",
  secondaryCta: { label: "Explore Prospect AI", href: "/prospect-ai" },
  challenges: [
    {
      title: "New work is hard to find consistently",
      description: "Referrals help, but teams still need a repeatable way to discover and qualify local opportunities.",
    },
    {
      title: "Service requests arrive incomplete",
      description: "Callers and chat leads often skip location, timing, or job details that matter for quoting.",
    },
    {
      title: "The wrong person owns the lead",
      description: "Without assignment and visibility, hot jobs sit unanswered while another team member is free.",
    },
    {
      title: "Quiet leads disappear",
      description: "Prospects who asked for a quote last week need follow-up, not a forgotten text thread.",
    },
  ],
  helpsIntro:
    "Use Prospect AI to find opportunities, then rely on Unified Inbox, AI qualification, booking links, and automation to turn conversations into scheduled work.",
  helpsPoints: [
    {
      title: "Find and qualify local prospects",
      description: "Prospect AI helps discover businesses by type and location, then qualify fit before outreach.",
    },
    {
      title: "Capture service requests cleanly",
      description: "Website chatbot and inbox workflows collect what the customer needs and when.",
    },
    {
      title: "Route work to the right owner",
      description: "Assignments, tags, stages, and scoring keep the team aligned on who should respond next.",
    },
    {
      title: "Follow up until the job is booked",
      description: "Share Calendly or booking links, then automate reminders when a prospect goes quiet.",
    },
  ],
  workflowTitle: "From lead to booked job",
  workflowSteps: [
    {
      label: "Find or receive a lead",
      description: "Inbound chat, website widget, or Prospect AI outreach starts the conversation.",
    },
    {
      label: "Capture the requested service",
      description: "Record the job type, location, and timing inside the contact timeline.",
    },
    {
      label: "Qualify need and fit",
      description: "Use AI Brain, scoring, and qualification questions to prioritize real opportunities.",
    },
    {
      label: "Assign the lead",
      description: "Route the conversation to the right teammate with notes and ownership.",
    },
    {
      label: "Share a booking link",
      description: "Send a Calendly or consultation link without leaving the thread.",
    },
    {
      label: "Automate follow-up",
      description: "Reminders, campaigns, and workflows nurture future jobs from past contacts.",
    },
  ],
  products: [
    {
      label: "Prospect AI",
      description: "Find and qualify local businesses, then manage replies in CRM.",
      href: "/prospect-ai",
    },
    {
      label: "Unified Inbox",
      description: "Keep every service conversation visible to the team.",
      href: "/unified-inbox",
    },
    {
      label: "AI Brain & Copilot",
      description: "Qualify opportunities and assist replies inside live conversations.",
      href: "/#ai-platform",
    },
    {
      label: "Lead scoring & stages",
      description: "Prioritize hot jobs with tags, stages, and scoring signals.",
      href: "/ai-lead-scoring",
    },
    {
      label: "Automations & Campaigns",
      description: "No-reply follow-up and re-engagement for past contacts.",
      href: "/automation-templates",
    },
    {
      label: "Team Collaboration",
      description: "Assignments and shared notes so jobs do not get stuck.",
      href: "/shared-team-inbox",
    },
  ],
  useCases: [
    {
      situation: "You need a steady pipeline of local businesses to sell to.",
      action: "Use Prospect AI to discover, qualify, and start personalized outreach.",
      outcome: "Outbound prospecting becomes a managed workflow inside WhachatCRM.",
    },
    {
      situation: "A homeowner requests a quote through your website after hours.",
      action: "Capture service details with the website chatbot and park the lead in Unified Inbox.",
      outcome: "Your team starts the next day with a complete request instead of a missed call.",
    },
    {
      situation: "Two technicians could take the same job.",
      action: "Assign the conversation, leave internal notes, and keep one owner accountable.",
      outcome: "Customers get one clear response path.",
    },
    {
      situation: "A prospect asked for pricing and then went quiet.",
      action: "Trigger automated follow-up while preserving lead stage and history.",
      outcome: "More quotes turn into booked consultations.",
    },
    {
      situation: "Past customers may need seasonal or repeat work.",
      action: "Re-engage tagged contacts with campaigns when the timing is right.",
      outcome: "Your list becomes a recurring opportunity channel.",
    },
  ],
  channels: ["WhatsApp", "SMS", "Email", "Instagram", "Facebook Messenger", "Web chat"],
  integrations: [
    { label: "Calendly", href: "/#integrations" },
    { label: "Meta messaging", href: "/whatsapp-business-api" },
    { label: "Gmail / Google Workspace", href: "/#integrations" },
  ],
  howItWorks: [
    {
      title: "Connect channels and your website chat",
      description: "Bring inbound messaging and the website widget into one inbox.",
    },
    {
      title: "Add Prospect AI for outbound growth",
      description: "Discover local opportunities and keep replies beside your other conversations.",
    },
    {
      title: "Define qualification and routing",
      description: "Use tags, stages, scoring, and assignments that match how your team books work.",
    },
    {
      title: "Automate the quiet moments",
      description: "Follow up automatically when prospects stall between quote and booking.",
    },
  ],
  relatedLinks: [
    {
      label: "Prospect AI",
      href: "/prospect-ai",
      description: "AI sales team for finding and qualifying local businesses.",
    },
    {
      label: "Unified Inbox",
      href: "/unified-inbox",
      description: "Shared messaging for service conversations.",
    },
    {
      label: "AI Lead Scoring",
      href: "/ai-lead-scoring",
      description: "Prioritize the jobs that need attention now.",
    },
    {
      label: "Automation Templates",
      href: "/automation-templates",
      description: "Follow-up workflows for nurture and re-engagement.",
    },
  ],
  finalCtaHeadline: "Book more local jobs from the conversations you already have",
  finalCtaSubtitle:
    "Start free, connect your channels, and add Prospect AI when you are ready to grow outbound pipeline.",
  ssrBullets: [
    "Prospect AI for finding and qualifying local opportunities",
    "Website chatbot and Unified Inbox for service requests",
    "Assignment, tags, stages, and lead scoring",
    "Booking and Calendly links inside conversations",
    "Automated follow-up and re-engagement campaigns",
  ],
};

export const marketingAgenciesSolution: SolutionPageContent = {
  path: "/solutions/marketing-agencies",
  industryLabel: "Marketing Agencies",
  breadcrumbLabel: "Marketing Agencies",
  title: "WhatsApp & Messaging Platform for Marketing Agencies | WhachatCRM",
  metaDescription:
    "Agency messaging platform for WhatsApp, multi-channel inbox, chatbots, automation, AI Copilot, and client engagement. Optional CRM Integration and Partner Program.",
  ogTitle: "Messaging & AI Automation for Agencies | WhachatCRM",
  h1: "Deliver Smarter Messaging and AI Automation for Your Clients",
  heroIntro:
    "Whether you run campaigns for clients, manage community replies, or extend an existing CRM stack, WhachatCRM gives agencies a practical messaging, automation, and AI workspace — with or without CRM Integration.",
  heroVisual: {
    inquiryLabel: "Client campaign reply",
    inquiryMessage: "Saw your ad — can you send details on the offer?",
    suggestionLabel: "AI Copilot suggestion",
    suggestionMessage: "Qualify campaign intent, hand off to the client team, and trigger the nurture workflow.",
    stageLabel: "Campaign lead",
    nextStep: "Next: route to client inbox",
  },
  challengesHeading: "What agency teams struggle with",
  secondaryCta: { label: "View Partner Program", href: "/partner-program" },
  challenges: [
    {
      title: "Clients expect WhatsApp, not just ads",
      description: "Campaign traffic dies when there is no official messaging path ready for replies.",
    },
    {
      title: "Tools are fragmented per client",
      description: "Inboxes, chatbots, and follow-up live in different places, so delivery quality varies.",
    },
    {
      title: "Client teams need help responding",
      description: "Even great automations fail if humans cannot handle live conversations quickly.",
    },
    {
      title: "Agency growth needs a repeatable offer",
      description: "Agencies want a clear messaging and AI package they can deliver again and again.",
    },
  ],
  helpsIntro:
    "Use WhachatCRM as the messaging and AI layer for client engagement — then connect CRM Integration or join the Partner Program when those paths fit your business.",
  helpsPoints: [
    {
      title: "Official WhatsApp and multi-channel messaging",
      description: "Connect Meta channels and manage replies in Unified Inbox with team collaboration.",
    },
    {
      title: "Chatbots and automation clients can feel",
      description: "Build qualification flows, follow-up workflows, and campaigns without starting from zero.",
    },
    {
      title: "AI that helps client-facing teams",
      description: "AI Copilot assists replies; AI Brain supports personalization and strategy where enabled.",
    },
    {
      title: "Optional CRM and partner growth paths",
      description: "Use the CRM Marketplace connection when needed, and earn through the Partner Program.",
    },
  ],
  workflowTitle: "From client channel setup to ongoing engagement",
  workflowSteps: [
    {
      label: "Connect client channels",
      description: "Set up official WhatsApp and supported social messaging for the brand.",
    },
    {
      label: "Build chatbot and workflows",
      description: "Create first-response and qualification flows for campaigns or support.",
    },
    {
      label: "Centralize conversations",
      description: "Bring replies into Unified Inbox with ownership and notes.",
    },
    {
      label: "Assist teams with AI Copilot",
      description: "Help client-facing staff reply faster with context and drafts.",
    },
    {
      label: "Automate follow-up",
      description: "Use workflows and campaigns to keep leads moving after the first touch.",
    },
    {
      label: "Improve engagement over time",
      description: "Iterate messaging, routing, and AI assistance based on real conversation volume.",
    },
  ],
  products: [
    {
      label: "WhatsApp Business API",
      description: "Official Meta Embedded Signup path for client WhatsApp access.",
      href: "/whatsapp-business-api",
    },
    {
      label: "Unified Inbox",
      description: "Shared multi-channel conversations for client teams.",
      href: "/unified-inbox",
    },
    {
      label: "Chatbots & Automations",
      description: "Qualification flows and follow-up workflows for campaigns.",
      href: "/automation-templates",
    },
    {
      label: "AI Copilot & AI Brain",
      description: "Assist replies and personalize next steps where enabled.",
      href: "/#ai-platform",
    },
    {
      label: "Team Collaboration",
      description: "Assignments and notes for agency or client operators.",
      href: "/shared-team-inbox",
    },
    {
      label: "CRM Integration for agencies",
      description: "Marketplace-oriented integration details for agencies using a CRM.",
      href: "/go-high-level-agencies",
    },
    {
      label: "Partner Program",
      description: "Grow with WhachatCRM and earn recurring partner commissions where eligible.",
      href: "/partner-program",
    },
  ],
  useCases: [
    {
      situation: "A client needs an official WhatsApp presence for campaign replies.",
      action: "Connect WhatsApp Business API and route conversations into Unified Inbox.",
      outcome: "Ad traffic has a compliant place to land and get answered.",
    },
    {
      situation: "A launch needs chatbot qualification before human handoff.",
      action: "Build chatbot and automation workflows that capture intent and stage leads.",
      outcome: "The client team only spends time on qualified conversations.",
    },
    {
      situation: "Client staff struggle to keep up with DMs.",
      action: "Enable AI Copilot, assignments, and shared notes in one inbox.",
      outcome: "Response quality stays consistent even as volume rises.",
    },
    {
      situation: "Your agency already operates inside a CRM platform.",
      action: "Use WhachatCRM as the messaging and AI layer alongside CRM Integration where connected.",
      outcome: "Clients get stronger conversation handling without replacing your whole stack.",
    },
    {
      situation: "You want to monetize WhachatCRM recommendations.",
      action: "Join the Partner Program and refer businesses that need messaging and AI CRM.",
      outcome: "Agency growth includes recurring partner upside where the program supports it.",
    },
  ],
  channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
  integrations: [
    { label: "CRM Marketplace", href: "/go-high-level-agencies" },
    { label: "Meta Embedded Signup", href: "/whatsapp-business-api" },
    { label: "Partner Program", href: "/partner-program" },
  ],
  howItWorks: [
    {
      title: "Pick the client delivery model",
      description: "Use WhachatCRM standalone, with CRM Integration, or as part of a partner-led offer.",
    },
    {
      title: "Connect channels and build flows",
      description: "Stand up WhatsApp, inbox routing, chatbots, and automations for the brand.",
    },
    {
      title: "Enable AI for operators",
      description: "Give client teams Copilot assistance so live replies stay fast and consistent.",
    },
    {
      title: "Package and repeat",
      description: "Turn the same messaging and AI playbook into a repeatable agency service.",
    },
  ],
  relatedLinks: [
    {
      label: "Agency CRM path",
      href: "/go-high-level-agencies",
      description: "How WhachatCRM extends CRM Integration with messaging and AI.",
    },
    {
      label: "Partner Program",
      href: "/partner-program",
      description: "Partner with WhachatCRM and grow recurring revenue.",
    },
    {
      label: "WhatsApp Business API",
      href: "/whatsapp-business-api",
      description: "Official API onboarding for client WhatsApp access.",
    },
    {
      label: "Unified Inbox",
      href: "/unified-inbox",
      description: "Shared omnichannel inbox for client conversations.",
    },
  ],
  finalCtaHeadline: "Give your clients a stronger messaging and AI layer",
  finalCtaSubtitle:
    "Start free, package WhachatCRM for client delivery, and explore CRM Integration or Partner Program paths when they fit.",
  ssrBullets: [
    "Official WhatsApp API and multi-channel messaging",
    "Unified Inbox with team collaboration for client operators",
    "Chatbots, automations, and campaigns for engagement",
    "AI Copilot and AI Brain assistance where enabled",
    "Optional CRM Integration and Partner Program",
  ],
};

export const medSpasSolution: SolutionPageContent = {
  path: "/solutions/med-spas",
  industryLabel: "Med Spas & Wellness",
  breadcrumbLabel: "Med Spas & Wellness",
  title: "CRM for Med Spas & Wellness Businesses | WhachatCRM",
  metaDescription:
    "CRM and messaging for med spas and wellness businesses. Capture treatment inquiries from WhatsApp and Instagram, qualify consultations, assign your team, and automate follow-up.",
  ogTitle: "Med Spa Lead Follow-up & Messaging CRM | WhachatCRM",
  h1: "Turn More Med Spa Inquiries Into Booked Consultations",
  heroIntro:
    "WhachatCRM helps med spas and wellness businesses respond to treatment questions, qualify consultation interest, assign the right teammate, and follow up until the visit is booked — without turning messaging into a clinical system.",
  heroVisual: {
    inquiryLabel: "Treatment inquiry",
    inquiryMessage: "Interested in a consult for laser hair removal — evenings preferred.",
    suggestionLabel: "AI Copilot suggestion",
    suggestionMessage: "Confirm treatment interest, capture timing, and share the consultation booking link.",
    stageLabel: "Consult-ready",
    nextStep: "Next: book consultation",
  },
  challengesHeading: "What med spa and wellness teams struggle with",
  secondaryCta: { label: "See Unified Inbox", href: "/unified-inbox" },
  challenges: [
    {
      title: "Treatment questions arrive on social",
      description: "Instagram and WhatsApp inquiries about procedures need fast, careful replies.",
    },
    {
      title: "After-hours interest goes cold",
      description: "Prospects browsing treatments at night often never reach a booking form.",
    },
    {
      title: "Not every inquiry is ready to book",
      description: "Teams need to qualify service interest before spending consult time.",
    },
    {
      title: "Follow-up is inconsistent",
      description: "Leads who asked about a consult last week need structured nurture, not a forgotten DM.",
    },
  ],
  helpsIntro:
    "Use messaging, qualification, AI assistance, and automation to move aesthetic and wellness inquiries toward booked consultations.",
  helpsPoints: [
    {
      title: "Meet prospects on the channels they use",
      description: "WhatsApp, Instagram, Facebook, and website chat feed one Unified Inbox.",
    },
    {
      title: "Qualify the consultation they want",
      description: "Capture treatment interest, timing, and next-step readiness with structured questions.",
    },
    {
      title: "Help your team reply with confidence",
      description: "AI Copilot assists in-thread; AI Brain supports personalization where enabled.",
    },
    {
      title: "Book and nurture without clinical overreach",
      description: "Share booking or Calendly links, assign owners, and automate follow-up — not medical records.",
    },
  ],
  workflowTitle: "From treatment inquiry to booked consult",
  workflowSteps: [
    {
      label: "New treatment inquiry",
      description: "A prospect asks about a service on Instagram, WhatsApp, or your website.",
    },
    {
      label: "Identify service interest",
      description: "Capture which treatment or consultation they are asking about.",
    },
    {
      label: "Answer initial questions",
      description: "Chatbot or team replies with clear next-step information — not medical advice.",
    },
    {
      label: "Qualify the opportunity",
      description: "Use scoring, tags, and AI assistance to prioritize ready consults.",
    },
    {
      label: "Assign and share booking",
      description: "Route to the right teammate and send a consultation booking link.",
    },
    {
      label: "Automate follow-up",
      description: "Remind quiet leads and nurture future services with campaigns where appropriate.",
    },
  ],
  products: [
    {
      label: "Unified Inbox",
      description: "Centralize treatment and consult conversations for the front-desk team.",
      href: "/unified-inbox",
    },
    {
      label: "Chatbots",
      description: "Capture after-hours interest and service intent before human handoff.",
      href: "/whatsapp-business-api#inbox-automation",
    },
    {
      label: "AI Copilot",
      description: "Help staff reply faster with conversation context and drafts.",
      href: "/#ai-copilot",
    },
    {
      label: "AI Brain",
      description: "Support qualification and personalized follow-up where enabled.",
      href: "/#ai-brain",
    },
    {
      label: "Lead scoring & stages",
      description: "Prioritize consult-ready inquiries with tags and scoring.",
      href: "/ai-lead-scoring",
    },
    {
      label: "Automations & Campaigns",
      description:
        "Follow up with inquiries who haven’t booked or stopped responding — and re-engage past contacts carefully.",
      href: "/automation-templates",
    },
    {
      label: "Team Collaboration",
      description: "Assign conversations so consult requests have a clear owner.",
      href: "/shared-team-inbox",
    },
  ],
  useCases: [
    {
      situation: "Someone DMs Instagram asking about a popular treatment.",
      action: "Bring the conversation into Unified Inbox and capture which service they want.",
      outcome: "The front desk responds with a clear consult path instead of losing the DM.",
    },
    {
      situation: "Website visitors browse treatments after closing time.",
      action: "Use the website chatbot to capture interest and contact details.",
      outcome: "Morning staff start with qualified inquiries ready to book.",
    },
    {
      situation: "A prospect is interested but not ready to schedule.",
      action: "Tag the lead, score readiness, and enroll gentle follow-up automation.",
      outcome: "Your business stays top of mind without manual chasing.",
    },
    {
      situation: "Multiple coordinators handle consult requests.",
      action: "Assign ownership and keep notes on every conversation.",
      outcome: "No duplicate replies and fewer dropped booking opportunities.",
    },
    {
      situation: "Past consults may be ready for a related service.",
      action: "Re-engage appropriate contacts with campaigns when the offer is relevant.",
      outcome: "Messaging supports ongoing wellness relationships — carefully and intentionally.",
    },
  ],
  channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
  integrations: [
    { label: "Calendly", href: "/#integrations" },
    { label: "Meta messaging", href: "/whatsapp-business-api" },
    { label: "Gmail / Google Workspace", href: "/#integrations" },
  ],
  howItWorks: [
    {
      title: "Connect social and WhatsApp channels",
      description: "Bring Instagram, Facebook, and WhatsApp inquiries into one inbox.",
    },
    {
      title: "Add website chat for after-hours interest",
      description: "Capture treatment questions when the front desk is offline.",
    },
    {
      title: "Define consult qualification",
      description: "Use tags, stages, and questions that match how your business books visits.",
    },
    {
      title: "Automate the follow-up gap",
      description:
        "Follow up with inquiries who haven’t booked or stopped responding — without clinical messaging claims.",
    },
  ],
  relatedLinks: [
    {
      label: "Unified Inbox",
      href: "/unified-inbox",
      description: "Shared inbox for treatment and consult conversations.",
    },
    {
      label: "AI Lead Scoring",
      href: "/ai-lead-scoring",
      description: "Prioritize consult-ready inquiries.",
    },
    {
      label: "Automation Templates",
      href: "/automation-templates",
      description: "Follow-up workflows for nurture and re-engagement.",
    },
    {
      label: "WhatsApp Business API",
      href: "/whatsapp-business-api",
      description: "Official WhatsApp onboarding for business messaging.",
    },
  ],
  finalCtaHeadline: "Book more consultations from the inquiries you already receive",
  finalCtaSubtitle:
    "Start free, unify your channels, and put AI-assisted follow-up behind every treatment conversation.",
  ssrBullets: [
    "Unified Inbox for WhatsApp, Instagram, and Facebook inquiries",
    "Website chatbot capture for after-hours interest",
    "Qualification, tagging, scoring, and team assignment",
    "Booking and Calendly links for consultations",
    "Automated follow-up and careful re-engagement campaigns",
  ],
};

export const ALL_SOLUTION_PAGES: SolutionPageContent[] = [
  realEstateSolution,
  ecommerceSolution,
  localServiceSolution,
  marketingAgenciesSolution,
  medSpasSolution,
];

export function getSolutionByPath(path: string): SolutionPageContent | undefined {
  return ALL_SOLUTION_PAGES.find((p) => p.path === path);
}

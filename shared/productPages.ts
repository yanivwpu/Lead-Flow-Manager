/**
 * Dedicated Product page content — unique copy per product.
 * Capabilities listed here must match verified platform behavior.
 */

export type ProductLink = {
  label: string;
  href: string;
  description?: string;
};

export type ProductProblem = {
  title: string;
  description: string;
};

export type ProductPoint = {
  title: string;
  description: string;
};

export type ProductFeature = {
  label: string;
  description: string;
  href?: string;
};

export type ProductWorkflowStep = {
  label: string;
  description: string;
};

export type ProductUseCase = {
  situation: string;
  action: string;
  outcome: string;
};

export type ProductHowStep = {
  title: string;
  description: string;
};

export type ProductHeroVisual = {
  inquiryLabel: string;
  inquiryMessage: string;
  suggestionLabel: string;
  suggestionMessage: string;
  stageLabel: string;
  nextStep: string;
};

export type ProductComparison = {
  leftTitle: string;
  leftItems: string[];
  rightTitle: string;
  rightItems: string[];
};

export type ProductIntegrationItem = {
  name: string;
  description: string;
  href?: string;
};

export type ProductIntegrationCategory = {
  title: string;
  items: ProductIntegrationItem[];
};

export type ProductVisualSection = {
  title: string;
  description: string;
  /** Screenshot key from marketingScreenshots */
  screenshotKey?: import("./marketingScreenshots").MarketingScreenshotKey;
  screenshotAlt?: string;
  reverse?: boolean;
};

export type ProductFlowNode = {
  kind: "trigger" | "message" | "question" | "action" | "outcome" | "delay";
  label: string;
  detail?: string;
};

export type ProductFlowScenario = {
  title: string;
  summary: string;
  nodes: ProductFlowNode[];
};

export type ProductPageContent = {
  path: string;
  productLabel: string;
  breadcrumbLabel: string;
  title: string;
  metaDescription: string;
  ogTitle?: string;
  h1: string;
  heroIntro: string;
  secondaryCta: ProductLink;
  /** Visual identity — distinct accent while keeping WhachatCRM brand */
  themeId: import("./productThemes").ProductThemeId;
  heroVariant?: "screenshot" | "split-visual" | "diagram";
  workflowVariant?: "steps" | "scenarios" | "both";
  heroVisual: ProductHeroVisual;
  /** Optional marketing screenshot key from shared/marketingScreenshots */
  screenshotKey?: import("./marketingScreenshots").MarketingScreenshotKey;
  screenshotAlt?: string;
  /** Additional screenshot-led sections (AI Brain priority) */
  visualSections?: ProductVisualSection[];
  /** Practical if-this-then-that scenarios (Chatbot / Automations) */
  flowScenarios?: ProductFlowScenario[];
  problemTitle: string;
  problems: ProductProblem[];
  howIntro: string;
  howPoints: ProductPoint[];
  comparison?: ProductComparison;
  featuresTitle: string;
  features: ProductFeature[];
  workflowTitle: string;
  workflowSteps: ProductWorkflowStep[];
  useCases: ProductUseCase[];
  relatedProducts: ProductLink[];
  industryLinks?: ProductLink[];
  showPlatformStory?: boolean;
  integrationCategories?: ProductIntegrationCategory[];
  howItWorks: ProductHowStep[];
  finalCtaHeadline: string;
  finalCtaSubtitle: string;
  ssrBullets: string[];
  /** Optional hero CTA — defaults to Start Free Trial → /auth or inbox. */
  primaryCtaHref?: string;
  primaryCtaLabel?: string;
};

export const aiBrainProduct: ProductPageContent = {
  path: "/ai-brain",
  productLabel: "AI Brain",
  breadcrumbLabel: "AI Brain",
  title: "AI Brain for Business Knowledge & CRM Intelligence | WhachatCRM",
  metaDescription:
    "WhachatCRM AI Brain is the business-knowledge intelligence layer for your CRM. Teach your profile, analyze knowledge sources, review conflicts, publish approved intelligence, and power Copilot, Prospect AI, and campaigns.",
  ogTitle: "AI Brain — Business Knowledge Intelligence | WhachatCRM",
  h1: "AI That Understands How Your Business Works",
  heroIntro:
    "Generic AI can write a reply. AI Brain understands your business, your goals, what to ask, and what should happen next — then supplies that approved intelligence across WhachatCRM. AI Brain is included with Pro.",
  secondaryCta: { label: "See AI Copilot", href: "/ai-copilot" },
  primaryCtaHref: "/pricing",
  primaryCtaLabel: "Start Your 14-Day Free Trial",
  themeId: "violet",
  heroVariant: "screenshot",
  workflowVariant: "both",
  heroVisual: {
    inquiryLabel: "Business knowledge",
    inquiryMessage: "Services, policies, and ideal customers connected for review.",
    suggestionLabel: "AI Brain finding",
    suggestionMessage: "Conflict detected between two knowledge pages — review before publishing.",
    stageLabel: "Ready to publish",
    nextStep: "Next: approve intelligence",
  },
  screenshotKey: "aiWorkspace",
  screenshotAlt:
    "WhachatCRM AI workspace explaining AI Assist and the premium AI Brain intelligence layer",
  visualSections: [
    {
      title: "Analyze knowledge page by page",
      description:
        "AI reads each connected page separately and drafts what it found. Nothing reaches your replies until you review and publish approved intelligence.",
      screenshotKey: "aiBrainAnalyze",
      screenshotAlt:
        "AI Brain Analyze knowledge panel showing scanned pages with new and changed fact counts",
    },
    {
      title: "Define what AI should ask",
      description:
        "Generate, edit, and manage qualification questions from your business context so Copilot and conversations ask for the right details.",
      screenshotKey: "aiBrainQuestions",
      screenshotAlt:
        "AI Brain customer questions panel with required and optional qualification fields",
      reverse: true,
    },
  ],
  problemTitle: "Why generic AI falls short for sales teams",
  problems: [
    {
      title: "Replies without business context",
      description: "Prompt-only AI invents tone and offers that do not match how your company actually sells.",
    },
    {
      title: "Knowledge lives in scattered pages",
      description: "Websites, docs, and notes conflict — and nobody reviews what the AI is allowed to use.",
    },
    {
      title: "Qualification is inconsistent",
      description: "Each teammate asks different questions, so pipeline quality depends on who answered first.",
    },
    {
      title: "Campaigns sound generic",
      description: "Outreach that ignores your services and ideal customers wastes conversations.",
    },
  ],
  howIntro:
    "AI Brain analyzes your business knowledge, identifies changes or conflicts, and lets you control what becomes approved intelligence.",
  howPoints: [
    {
      title: "Teach AI about the business",
      description: "Capture your business profile, industry, services, and instructions the AI should follow.",
    },
    {
      title: "Connect and analyze knowledge",
      description: "Add knowledge pages or sources, then analyze for changes, duplicates, and possible conflicts.",
    },
    {
      title: "Review and publish",
      description: "You decide what becomes approved intelligence before it powers other AI features.",
    },
    {
      title: "Use it across the platform",
      description: "Approved context helps Prospect AI, AI Copilot, qualification, and campaign personalization where enabled.",
    },
  ],
  comparison: {
    leftTitle: "Generic AI",
    leftItems: [
      "Works primarily from the current prompt",
      "Often produces generic responses",
      "Has limited knowledge of the company",
      "Primarily generates content",
      "May use incomplete or conflicting information",
      "Does not define the company’s qualification strategy",
    ],
    rightTitle: "WhachatCRM AI Brain",
    rightItems: [
      "Uses the company’s business profile and industry context",
      "Understands approved products, services, and business knowledge",
      "Analyzes connected knowledge pages",
      "Identifies duplicates, changes, and possible conflicts",
      "Lets users review and publish approved knowledge",
      "Supports qualification questions and ideal-customer context",
      "Personalizes campaigns and strategy where enabled",
      "Supplies intelligence to Prospect AI and AI Copilot",
    ],
  },
  featuresTitle: "What AI Brain covers",
  features: [
    {
      label: "Business profile",
      description: "Company name, industry, services, products, booking details, and custom instructions.",
    },
    {
      label: "Knowledge analysis",
      description: "Analyze connected pages, surface changes, and hold contested facts until resolved.",
    },
    {
      label: "Review & publish",
      description: "Controlled publishing so AI only uses intelligence you approve.",
    },
    {
      label: "Qualification questions",
      description: "Define what the team and AI should ask to qualify opportunities.",
    },
    {
      label: "Modes: Off / Suggest / Auto",
      description: "Choose how strongly AI assists across eligible features, based on your plan and settings.",
    },
    {
      label: "Platform intelligence",
      description: "Included with Pro. Deepens Copilot and Prospect AI with business context.",
    },
  ],
  workflowTitle: "From teaching to approved intelligence",
  workflowSteps: [
    {
      label: "Teach AI",
      description: "Add your business profile, services, and operating context.",
    },
    {
      label: "Analyze knowledge",
      description: "Connect sources and run analysis for updates and conflicts.",
    },
    {
      label: "Review findings",
      description: "Inspect duplicates, changes, and contested facts.",
    },
    {
      label: "Publish approved intelligence",
      description: "Release only what your team accepts as trusted context.",
    },
    {
      label: "Power qualification",
      description: "Guide questions and scoring with approved business rules.",
    },
    {
      label: "Power Copilot & campaigns",
      description: "Help replies and personalization stay aligned with your business.",
    },
  ],
  useCases: [
    {
      situation: "You need AI to reflect your real services and policies.",
      action: "Teach the business profile and publish approved knowledge.",
      outcome: "Suggestions stay grounded in how you actually operate.",
    },
    {
      situation: "Website copy changed and could confuse AI answers.",
      action: "Re-analyze knowledge, review conflicts, and publish carefully.",
      outcome: "Outdated claims do not quietly become AI guidance.",
    },
    {
      situation: "A Prospect AI campaign needs sharper personalization.",
      action: "Use approved Brain context when personalizing outreach.",
      outcome: "Messages sound closer to your offer and ideal customers.",
    },
    {
      situation: "Agents need better next-step recommendations in chat.",
      action: "Enable Brain-powered Copilot context where entitled.",
      outcome: "Conversation assistance reflects your qualification strategy.",
    },
    {
      situation: "Teams ask different qualifying questions by habit.",
      action: "Define qualification questions once in AI Brain.",
      outcome: "Qualification becomes consistent across channels and people.",
    },
  ],
  relatedProducts: [
    {
      label: "AI Copilot",
      href: "/ai-copilot",
      description: "Uses Brain intelligence inside live conversations.",
    },
    {
      label: "Prospect AI",
      href: "/prospect-ai",
      description: "Finds and qualifies prospects; Brain deepens personalization.",
    },
    {
      label: "Campaigns",
      href: "/campaigns",
      description: "Personalized outreach guided by approved business context.",
    },
    {
      label: "Unified Inbox",
      href: "/unified-inbox",
      description: "Where Brain-informed Copilot assists replies.",
    },
  ],
  industryLinks: [
    { label: "Real Estate", href: "/real-estate-crm" },
    { label: "Local & Service Businesses", href: "/solutions/local-service-businesses" },
    { label: "Med Spas & Wellness", href: "/solutions/med-spas" },
  ],
  showPlatformStory: true,
  howItWorks: [
    {
      title: "Open AI Brain in your workspace",
      description: "Start from the business profile and knowledge steps.",
    },
    {
      title: "Add sources and analyze",
      description: "Connect pages, run analysis, and inspect findings.",
    },
    {
      title: "Publish what you trust",
      description: "Approve intelligence before it influences other AI features.",
    },
    {
      title: "Enable related AI products",
      description: "Use Copilot, Prospect AI, and campaigns with deeper context where entitled.",
    },
  ],
  finalCtaHeadline: "Give your AI a business brain you control",
  finalCtaSubtitle:
    "AI Brain is included with Pro. Start a 14-day Pro trial, teach WhachatCRM how you work, and publish approved intelligence for Copilot, Prospect AI, and campaigns.",
  ssrBullets: [
    "Business profile, industry, services, and instructions",
    "Knowledge analysis with change, duplicate, and conflict review",
    "User-controlled publish of approved intelligence",
    "Qualification questions and platform AI context",
    "Powers Copilot, Prospect AI, and campaign personalization where enabled",
  ],
};

export const aiCopilotProduct: ProductPageContent = {
  path: "/ai-copilot",
  productLabel: "AI Copilot",
  breadcrumbLabel: "AI Copilot",
  title: "AI Copilot for CRM Conversations | WhachatCRM",
  metaDescription:
    "WhachatCRM AI Copilot helps teams know what to say and what to do next inside customer conversations — with lead scoring, suggested replies, and next-action recommendations powered by conversation and business context.",
  ogTitle: "AI Copilot — Know What to Say Next | WhachatCRM",
  h1: "Know What to Say and What to Do Next",
  heroIntro:
    "AI Copilot is the conversation assistant that works inside Unified Inbox. It uses conversation context — and AI Brain when enabled — to help your team understand the opportunity and move it forward.",
  secondaryCta: { label: "Explore AI Brain", href: "/ai-brain" },
  themeId: "indigo",
  heroVariant: "screenshot",
  workflowVariant: "both",
  heroVisual: {
    inquiryLabel: "Live conversation",
    inquiryMessage: "Interested in a consult this week — what’s the next step?",
    suggestionLabel: "Copilot recommendation",
    suggestionMessage: "Lead score 82 — qualify timeline, then share the booking link.",
    stageLabel: "High intent",
    nextStep: "Next: suggested reply ready",
  },
  screenshotKey: "aiCopilot",
  screenshotAlt: "AI Copilot panel showing conversation assistance and lead insights in WhachatCRM",
  visualSections: [
    {
      title: "Lead scoring beside the thread",
      description:
        "Scores and explanations help teams understand why a conversation looks ready — without leaving Unified Inbox.",
      screenshotKey: "leadScore",
      screenshotAlt: "AI Copilot lead score card with qualification factors",
      reverse: true,
    },
  ],
  problemTitle: "What slows teams down in the inbox",
  problems: [
    {
      title: "Context is buried in the thread",
      description: "Agents re-read long chats before they can decide what matters.",
    },
    {
      title: "Lead quality is unclear",
      description: "Without scoring and explanations, hot opportunities look like every other message.",
    },
    {
      title: "Next steps vary by person",
      description: "Some teammates book, others stall, and follow-up quality becomes inconsistent.",
    },
    {
      title: "Replies take too long to draft",
      description: "Even simple answers compete with the rest of the day’s queue.",
    },
  ],
  howIntro:
    "AI Brain is the platform’s intelligence layer. AI Copilot is the assistant that uses that intelligence — plus the live conversation — inside customer chats.",
  howPoints: [
    {
      title: "Analyze conversation context",
      description: "Copilot reads the thread and contact signals to summarize what is happening.",
    },
    {
      title: "Score and explain the lead",
      description: "Lead scoring and explanations help teams prioritize the right conversations.",
    },
    {
      title: "Recommend the next action",
      description: "Suggestions can include paths such as assign, book, qualify, nurture, or follow up — based on capability and context.",
    },
    {
      title: "Draft with human control",
      description: "Suggested replies help agents move faster. Auto mode is available only when enabled and entitled — it does not replace judgment by default.",
    },
  ],
  featuresTitle: "Verified Copilot capabilities",
  features: [
    {
      label: "Conversation analysis",
      description: "Context-aware assistance inside Unified Inbox threads.",
      href: "/unified-inbox",
    },
    {
      label: "Lead scoring",
      description: "Scores with explanations so teams understand why a lead looks ready.",
      href: "/ai-lead-scoring",
    },
    {
      label: "Suggested replies",
      description: "Draft assistance for faster, more consistent responses.",
    },
    {
      label: "Next-action recommendations",
      description: "Guidance such as qualify, book, assign, nurture, or follow up when supported by context.",
    },
    {
      label: "AI Brain context",
      description: "Deeper business-aware recommendations when Brain intelligence is enabled.",
      href: "/ai-brain",
    },
    {
      label: "Suggest and Auto modes",
      description: "Choose assistive drafting or Auto where your plan and settings allow it.",
    },
  ],
  workflowTitle: "From message to recommended next step",
  workflowSteps: [
    {
      label: "Conversation arrives",
      description: "A customer message lands in Unified Inbox.",
    },
    {
      label: "Context analysis",
      description: "Copilot reviews the thread and contact signals.",
    },
    {
      label: "Lead score",
      description: "Scoring highlights urgency and fit with explanations.",
    },
    {
      label: "Recommendation",
      description: "Suggested next actions help the teammate decide.",
    },
    {
      label: "Suggested reply",
      description: "Draft language is ready for review or editing.",
    },
    {
      label: "Team action",
      description: "A human assigns, books, qualifies, or continues the conversation.",
    },
  ],
  useCases: [
    {
      situation: "A new inquiry arrives after hours.",
      action: "Review Copilot’s summary, score, and suggested reply in the morning.",
      outcome: "The first human response starts from context instead of a cold read.",
    },
    {
      situation: "A lead looks ready but the agent is unsure.",
      action: "Use score explanations and next-action guidance to choose book vs nurture.",
      outcome: "High-intent chats move toward a booking or clear follow-up.",
    },
    {
      situation: "A service team needs consistent answers.",
      action: "Rely on Brain-informed suggestions while keeping humans in control.",
      outcome: "Replies stay on-brand without forcing identical scripts.",
    },
    {
      situation: "An agent needs to schedule a showing or consult.",
      action: "Follow Copilot’s booking-oriented recommendation when the thread supports it.",
      outcome: "The conversation advances to a concrete next step.",
    },
    {
      situation: "Industry-specific advice would be irrelevant.",
      action: "Copilot stays scoped to conversation and eligible business context.",
      outcome: "Teams avoid mismatched recommendations that do not fit the opportunity.",
    },
  ],
  relatedProducts: [
    { label: "AI Brain", href: "/ai-brain", description: "Supplies approved business intelligence." },
    { label: "Unified Inbox", href: "/unified-inbox", description: "Where Copilot assists live replies." },
    { label: "AI Lead Scoring", href: "/ai-lead-scoring", description: "Deeper scoring overview." },
    { label: "Team Collaboration", href: "/shared-team-inbox", description: "Assign and share ownership." },
  ],
  industryLinks: [
    { label: "Real Estate", href: "/real-estate-crm" },
    { label: "E-commerce", href: "/solutions/ecommerce" },
    { label: "Med Spas & Wellness", href: "/solutions/med-spas" },
  ],
  showPlatformStory: true,
  howItWorks: [
    {
      title: "Connect channels and open Unified Inbox",
      description: "Copilot assists where conversations already live.",
    },
    {
      title: "Enable AI assistance for your plan",
      description: "Use Suggest or Auto according to entitlement and settings.",
    },
    {
      title: "Add AI Brain for deeper context",
      description: "Publish approved business knowledge when you want richer recommendations.",
    },
    {
      title: "Keep humans in control",
      description: "Review scores, recommendations, and drafts before acting.",
    },
  ],
  finalCtaHeadline: "Help every teammate answer with confidence",
  finalCtaSubtitle:
    "Start free, open Unified Inbox, and let AI Copilot guide what to say and what to do next.",
  ssrBullets: [
    "Conversation-context assistance inside Unified Inbox",
    "Lead scoring with explanations",
    "Suggested replies and next-action recommendations",
    "Optional AI Brain business context",
    "Suggest and Auto modes when enabled and entitled",
  ],
};

export const chatbotBuilderProduct: ProductPageContent = {
  path: "/chatbot-builder",
  productLabel: "Chatbot Builder",
  breadcrumbLabel: "Chatbot Builder",
  title: "Visual Chatbot Builder for Customer Journeys | WhachatCRM",
  metaDescription:
    "Build no-code chatbot journeys in WhachatCRM. Create message and question flows, capture inputs, tag contacts, assign teammates, and hand work into Unified Inbox across supported channels.",
  ogTitle: "Chatbot Builder — Visual Customer Journeys | WhachatCRM",
  h1: "Build Customer Journeys Without Writing Code",
  heroIntro:
    "Chatbot Builder helps you design conversational flows that welcome customers, capture what they need, qualify interest, and route work to the right teammate — then continue in Unified Inbox.",
  secondaryCta: { label: "See Unified Inbox", href: "/unified-inbox" },
  themeId: "teal",
  heroVariant: "screenshot",
  workflowVariant: "scenarios",
  heroVisual: {
    inquiryLabel: "Flow step",
    inquiryMessage: "What service are you looking for today?",
    suggestionLabel: "Action",
    suggestionMessage: "Add Tag → continue the conversation in Unified Inbox.",
    stageLabel: "Qualified",
    nextStep: "Next: team follow-up",
  },
  screenshotKey: "chatbotFlowCanvas",
  screenshotAlt:
    "Chatbot Builder canvas with Send Message and Add Tag steps plus WhatsApp template settings",
  visualSections: [
    {
      title: "Configure when the flow starts",
      description:
        "Start on a new conversation, add keyword triggers, and limit the flow to supported channels such as WhatsApp, Instagram, Facebook Messenger, SMS, web chat, and Telegram.",
      screenshotKey: "chatbotTrigger",
      screenshotAlt:
        "Chatbot Builder trigger panel with new-conversation toggle, keyword input, and channel filters",
    },
  ],
  flowScenarios: [
    {
      title: "Welcome and qualify",
      summary: "Greet a new conversation, capture what the customer needs, apply a tag, then continue with the team.",
      nodes: [
        { kind: "trigger", label: "New conversation", detail: "Start on new conversation" },
        { kind: "message", label: "Send welcome message", detail: "Hello! How can I help you today?" },
        { kind: "question", label: "Ask what they need", detail: "Capture the customer’s request" },
        { kind: "action", label: "Add Tag", detail: "Supported contact action" },
        { kind: "outcome", label: "Continue in Unified Inbox", detail: "Team takes over with context" },
      ],
    },
    {
      title: "Keyword flow",
      summary: "When a configured keyword arrives, send the relevant message, ask a follow-up, and tag interest.",
      nodes: [
        { kind: "trigger", label: "Keyword detected", detail: "Configured keyword on a supported channel" },
        { kind: "message", label: "Send relevant reply", detail: "Message or template where supported" },
        { kind: "question", label: "Ask a follow-up", detail: "Capture interest details" },
        { kind: "action", label: "Add Tag", detail: "Mark interest for the team" },
        { kind: "outcome", label: "Continue the conversation", detail: "Human follow-up in the inbox" },
      ],
    },
    {
      title: "Capture a lead",
      summary: "Respond immediately, capture name and need, then assign for team follow-up.",
      nodes: [
        { kind: "trigger", label: "New conversation", detail: "Immediate after-hours capture" },
        { kind: "message", label: "Send welcome message", detail: "Set expectations quickly" },
        { kind: "question", label: "Capture name and need", detail: "Supported input capture" },
        { kind: "action", label: "Assign to team", detail: "Supported assignment action" },
        { kind: "outcome", label: "Team follow-up", detail: "Owner continues in Unified Inbox" },
      ],
    },
  ],
  problemTitle: "Why teams need a visual builder",
  problems: [
    {
      title: "After-hours messages go unanswered",
      description: "Prospects ask questions when nobody is online, then disappear.",
    },
    {
      title: "FAQ answers repeat all day",
      description: "Agents spend time on the same first replies instead of closing work.",
    },
    {
      title: "Routing is manual",
      description: "Without structured capture, every inquiry looks the same in the inbox.",
    },
    {
      title: "Handoffs lose context",
      description: "When a human takes over, the journey details are missing.",
    },
  ],
  howIntro:
    "Design flows with message, question, delay, and action steps. Trigger them on supported channels, then continue conversations with your team.",
  howPoints: [
    {
      title: "Visual flow building",
      description: "Compose journeys with message, question, delay, and action nodes.",
    },
    {
      title: "Capture what they need",
      description: "Ask questions and collect the details your team needs before follow-up.",
    },
    {
      title: "Update CRM context",
      description: "Apply tags, status, pipeline, or assignment actions as the flow progresses.",
    },
    {
      title: "Continue in Unified Inbox",
      description: "When a person should take over, the conversation stays in your shared workspace.",
    },
  ],
  featuresTitle: "Builder capabilities",
  features: [
    {
      label: "Message nodes",
      description: "Send text, media, buttons, or template messages where supported.",
    },
    {
      label: "Questions & input capture",
      description: "Ask for the details your team needs before routing.",
    },
    {
      label: "Delay steps",
      description: "Pace the journey so messages feel natural.",
    },
    {
      label: "Action steps",
      description: "Set tags, status, pipeline stage, or assign a teammate.",
    },
    {
      label: "Triggers",
      description: "Start on new chat, keywords, and selected channels.",
    },
    {
      label: "Supported channels",
      description: "WhatsApp, Instagram, Facebook, SMS, web chat, Telegram, and GoHighLevel where connected.",
    },
  ],
  workflowTitle: "A typical qualification journey",
  workflowSteps: [
    {
      label: "New message",
      description: "A customer starts a conversation on a connected channel.",
    },
    {
      label: "Welcome message",
      description: "The flow greets them and sets expectations.",
    },
    {
      label: "Ask what they need",
      description: "A question node captures intent.",
    },
    {
      label: "Continue the flow",
      description: "Send the next message or ask another supported question.",
    },
    {
      label: "Capture contact details",
      description: "Collect the information your team needs to follow up.",
    },
    {
      label: "Qualify and assign",
      description: "Tag, update stage, assign an owner, then continue in Unified Inbox.",
    },
  ],
  useCases: [
    {
      situation: "You need after-hours lead capture.",
      action: "Trigger a welcome + qualification flow when a new chat starts.",
      outcome: "Morning staff open the inbox with structured inquiries.",
    },
    {
      situation: "Customers ask the same FAQs.",
      action: "Build a message path that answers common questions before offering a human.",
      outcome: "Agents spend time on higher-value conversations.",
    },
    {
      situation: "Different services need different owners.",
      action: "Use keyword triggers or assignment actions to route the right teammate.",
      outcome: "Routing happens before the first human reply.",
    },
    {
      situation: "Sales wants only ready leads.",
      action: "Capture qualifying answers, tag readiness, then hand off.",
      outcome: "Unified Inbox starts with clearer opportunity context.",
    },
  ],
  relatedProducts: [
    { label: "Unified Inbox", href: "/unified-inbox", description: "Where chatbot handoffs continue." },
    { label: "Workflows & Automations", href: "/automations", description: "Repeatable follow-up after the flow." },
    { label: "AI Copilot", href: "/ai-copilot", description: "Assists humans after the bot qualifies." },
    { label: "AI Brain", href: "/ai-brain", description: "Business context for smarter assistance." },
    { label: "Team Collaboration", href: "/shared-team-inbox", description: "Assignments and shared ownership." },
  ],
  industryLinks: [
    { label: "E-commerce", href: "/solutions/ecommerce" },
    { label: "Local & Service Businesses", href: "/solutions/local-service-businesses" },
    { label: "Marketing Agencies", href: "/solutions/marketing-agencies" },
  ],
  howItWorks: [
    {
      title: "Open Chatbot Builder",
      description: "Available on plans that include chatbot journeys.",
    },
    {
      title: "Design the first path",
      description: "Add welcome, questions, actions, and assignment steps.",
    },
    {
      title: "Choose triggers and channels",
      description: "Decide when the flow starts and where it can run.",
    },
    {
      title: "Hand off to the inbox",
      description: "Let your team continue with Copilot and automations.",
    },
  ],
  finalCtaHeadline: "Launch journeys your customers can follow",
  finalCtaSubtitle:
    "Start free, build your first chatbot path, and keep every qualified conversation in Unified Inbox.",
  ssrBullets: [
    "Visual chatbot builder with message, question, delay, and action steps",
    "Keyword and new-chat triggers across supported channels",
    "Tags, status, pipeline, and assignment actions",
    "Handoff into Unified Inbox for human follow-up",
    "Works with Copilot, AI Brain, and automations",
  ],
};

export const automationsProduct: ProductPageContent = {
  path: "/automations",
  productLabel: "Workflows & Automations",
  breadcrumbLabel: "Workflows & Automations",
  title: "CRM Workflows & Automations | WhachatCRM",
  metaDescription:
    "Automate follow-up in WhachatCRM with workflows and ready-to-use templates. Trigger on new chats, keywords, tags, stages, or no reply — then assign, update contacts, and continue conversations.",
  ogTitle: "Workflows & Automations | WhachatCRM",
  h1: "Automate the Follow-Up Work That Moves Leads Forward",
  heroIntro:
    "Workflows & Automations help your team respond to repeatable moments — new chats, keywords, stage changes, tags, and quiet leads — without rebuilding the process every time. Use custom workflows or start from ready-made templates.",
  secondaryCta: { label: "Browse automation templates", href: "/automation-templates" },
  themeId: "amber",
  heroVariant: "screenshot",
  workflowVariant: "scenarios",
  heroVisual: {
    inquiryLabel: "Trigger",
    inquiryMessage: "No reply for 24 hours on a qualified lead.",
    suggestionLabel: "Automation action",
    suggestionMessage: "Assign owner → add follow-up tag → set the next follow-up reminder.",
    stageLabel: "In nurture",
    nextStep: "Next: continue workflow",
  },
  screenshotKey: "automationWorkflows",
  screenshotAlt: "WhachatCRM Workflow Builder showing automation triggers and follow-up actions",
  flowScenarios: [
    {
      title: "No-response follow-up",
      summary: "When a contact goes quiet, start a follow-up path and keep pipeline context accurate.",
      nodes: [
        { kind: "trigger", label: "No reply", detail: "Contact has not replied after the selected delay" },
        { kind: "action", label: "Add or update tag", detail: "Mark the follow-up state" },
        { kind: "action", label: "Set pipeline stage", detail: "Keep opportunity status current" },
        { kind: "action", label: "Assign team member", detail: "Route ownership for the next touch" },
        { kind: "outcome", label: "Continue nurture", detail: "Human or campaign follow-up continues" },
      ],
    },
    {
      title: "Keyword routing",
      summary: "Route high-intent keywords to the right owner with a clear next step.",
      nodes: [
        { kind: "trigger", label: "Keyword detected", detail: "Message contains a configured keyword" },
        { kind: "action", label: "Add tag", detail: "Flag intent for the team" },
        { kind: "action", label: "Assign team member", detail: "Round robin or specific owner" },
        { kind: "action", label: "Set follow-up", detail: "Schedule the next reminder" },
        { kind: "outcome", label: "Owner responds", detail: "Conversation continues in Unified Inbox" },
      ],
    },
    {
      title: "Stage progression",
      summary: "When a contact reaches a configured pipeline stage, start the next workflow steps.",
      nodes: [
        { kind: "trigger", label: "Pipeline stage change", detail: "Contact moves to a configured stage" },
        { kind: "action", label: "Assign or update contact", detail: "Keep ownership and status aligned" },
        { kind: "action", label: "Set follow-up", detail: "Begin the relevant follow-up timing" },
        { kind: "outcome", label: "Workflow continues", detail: "Team and automations stay in sync" },
      ],
    },
  ],
  problemTitle: "Manual follow-up does not scale",
  problems: [
    {
      title: "Quiet leads go cold",
      description: "Without a no-reply path, promising conversations stall in the inbox.",
    },
    {
      title: "Handoffs are inconsistent",
      description: "Tags, stages, and owners get updated differently by every teammate.",
    },
    {
      title: "Welcome work is repetitive",
      description: "Every new chat needs the same first actions before a human digs in.",
    },
    {
      title: "Templates are hard to find",
      description: "Teams want proven starting points without reinventing every workflow.",
    },
  ],
  howIntro:
    "Build platform-wide automations for everyday CRM work. Growth Engine workspaces remain separate packaged campaigns for industry-specific intelligence.",
  howPoints: [
    {
      title: "Start from a trigger",
      description: "React to new chats, messages, keywords, tags, stage changes, no reply, and more.",
    },
    {
      title: "Apply CRM actions",
      description: "Assign teammates, update tags, status, pipeline, notes, or follow-up timing.",
    },
    {
      title: "Use templates when helpful",
      description: "Browse the automation templates library for ready-to-customize starting points.",
    },
    {
      title: "Keep Growth Engines separate",
      description: "Realtor Growth Engine and similar packages stay in their own workspace — not mixed into global automations.",
    },
  ],
  featuresTitle: "Triggers, actions, and templates",
  features: [
    {
      label: "Common triggers",
      description: "New chat, new message, keyword, no reply, tag added/removed, pipeline change, and more.",
    },
    {
      label: "CRM actions",
      description: "Assign, tag, set status, set pipeline, add notes, and schedule follow-up.",
    },
    {
      label: "Workflow builder",
      description: "Compose multi-step automations your team can maintain.",
      href: "/automations",
    },
    {
      label: "Automation templates",
      description: "Ready-to-use presets you can customize for welcome, nurture, and support paths.",
      href: "/automation-templates",
    },
    {
      label: "Campaign enrollment",
      description: "Continue longer nurture sequences where campaign enrollment is supported.",
      href: "/campaigns",
    },
    {
      label: "Team collaboration",
      description: "Assignment actions keep ownership clear as automations fire.",
      href: "/shared-team-inbox",
    },
  ],
  workflowTitle: "A no-reply follow-up workflow",
  workflowSteps: [
    {
      label: "Trigger",
      description: "No reply after a defined window on a tracked conversation.",
    },
    {
      label: "Check condition",
      description: "Confirm the contact still matches the intended stage or tag.",
    },
    {
      label: "Update contact",
      description: "Apply a follow-up tag or stage so the pipeline stays accurate.",
    },
    {
      label: "Assign owner",
      description: "Route ownership to the right teammate.",
    },
    {
      label: "Send or recommend follow-up",
      description: "Continue the conversation with a reminder path.",
    },
    {
      label: "Continue campaign or workflow",
      description: "Keep nurturing until a human closes the loop.",
    },
  ],
  useCases: [
    {
      situation: "A new chat needs a consistent welcome.",
      action: "Trigger on new chat, tag the lead, and assign an owner.",
      outcome: "Every inquiry starts with the same operating standard.",
    },
    {
      situation: "Intent keywords signal a hot request.",
      action: "Keyword trigger updates stage and notifies the right teammate.",
      outcome: "High-intent messages get prioritized quickly.",
    },
    {
      situation: "A prospect went quiet after pricing.",
      action: "No-reply automation schedules follow-up and preserves history.",
      outcome: "Quiet leads re-enter the conversation path.",
    },
    {
      situation: "Qualified leads should move stages.",
      action: "Stage or tag changes kick off the next workflow steps.",
      outcome: "Pipeline hygiene happens without manual cleanup.",
    },
    {
      situation: "You want proven starting points.",
      action: "Open the automation templates library and customize.",
      outcome: "Teams launch faster without inventing every path.",
    },
  ],
  relatedProducts: [
    {
      label: "Automation Templates",
      href: "/automation-templates",
      description: "Library of ready-to-use automation templates.",
    },
    { label: "Campaigns", href: "/campaigns", description: "Longer nurture and re-engagement sequences." },
    { label: "Chatbot Builder", href: "/chatbot-builder", description: "Front-door journeys before automation." },
    { label: "Unified Inbox", href: "/unified-inbox", description: "Where automated work meets human replies." },
    {
      label: "Realtor Growth Engine",
      href: "/realtor-growth-engine",
      description: "Industry-packaged Growth Engine workflows.",
    },
  ],
  industryLinks: [
    { label: "Real Estate", href: "/real-estate-crm" },
    { label: "Local & Service Businesses", href: "/solutions/local-service-businesses" },
    { label: "Marketing Agencies", href: "/solutions/marketing-agencies" },
  ],
  howItWorks: [
    {
      title: "Choose a trigger",
      description: "Start from the moment that should kick off work.",
    },
    {
      title: "Add CRM actions",
      description: "Assign, tag, update stage, and continue follow-up.",
    },
    {
      title: "Or start from a template",
      description: "Browse /automation-templates and adapt a preset.",
    },
    {
      title: "Monitor in Unified Inbox",
      description: "Humans take over when the conversation needs judgment.",
    },
  ],
  finalCtaHeadline: "Stop rebuilding the same follow-up every day",
  finalCtaSubtitle:
    "Start free, create your first workflow, or customize a template from the automation library.",
  ssrBullets: [
    "Workflow builder for platform-wide automations",
    "Triggers for new chats, keywords, tags, stages, and no reply",
    "CRM actions for assign, tag, status, pipeline, and follow-up",
    "Ready-to-use templates at /automation-templates",
    "Separate from Growth Engine industry packages",
  ],
};

export const campaignsProduct: ProductPageContent = {
  path: "/campaigns",
  productLabel: "Campaigns",
  breadcrumbLabel: "Campaigns",
  title: "CRM Campaigns & Personalized Outreach | WhachatCRM",
  metaDescription:
    "Create personalized CRM campaigns in WhachatCRM. Select audiences, choose supported messaging channels, personalize with AI Brain where enabled, enroll contacts, track progress, and continue follow-up.",
  ogTitle: "Campaigns — Personalized Outreach | WhachatCRM",
  h1: "Create Personalized Campaigns That Continue the Conversation",
  heroIntro:
    "Campaigns help you enroll the right contacts on supported messaging channels, personalize outreach with business context, and keep follow-up moving — without treating every send like a one-off broadcast.",
  secondaryCta: { label: "Explore AI Brain", href: "/ai-brain" },
  themeId: "rose",
  heroVariant: "screenshot",
  workflowVariant: "both",
  heroVisual: {
    inquiryLabel: "Audience",
    inquiryMessage: "Qualified prospects tagged “ready for nurture”.",
    suggestionLabel: "Campaign step",
    suggestionMessage: "Personalized WhatsApp message → wait → follow-up if no reply.",
    stageLabel: "Active",
    nextStep: "Next: track enrollment",
  },
  screenshotKey: "automationTemplateCards",
  screenshotAlt: "Campaign and automation template cards for nurture and re-engagement sequences",
  problemTitle: "Why campaigns matter after the first reply",
  problems: [
    {
      title: "Qualified leads go quiet",
      description: "Without a sequenced path, interest fades after one message.",
    },
    {
      title: "Outreach feels generic",
      description: "Templates that ignore business context underperform.",
    },
    {
      title: "Channel rules get ignored",
      description: "Teams need enrollment that respects connected channels and messaging windows.",
    },
    {
      title: "Status is hard to see",
      description: "Draft, active, paused, and completed states should stay clear.",
    },
  ],
  howIntro:
    "Select an audience, choose a supported channel, create or personalize the message, review, enroll contacts, and continue follow-up based on campaign progress.",
  howPoints: [
    {
      title: "Audience and enrollment",
      description: "Enroll contacts into campaign sequences with eligibility checks.",
    },
    {
      title: "Channel-aware sending",
      description: "Campaigns run on supported messaging channels such as WhatsApp, Instagram, Facebook, SMS, web chat, and Telegram when connected.",
    },
    {
      title: "Personalization",
      description: "Use placeholders and AI-assisted personalization where enabled — including AI Brain context.",
    },
    {
      title: "Lifecycle visibility",
      description: "Track draft, active, paused, and completed campaign states.",
    },
  ],
  featuresTitle: "Campaign capabilities",
  features: [
    {
      label: "Audience selection",
      description: "Enroll the contacts that match your follow-up goal.",
    },
    {
      label: "Supported messaging channels",
      description: "WhatsApp-centric messaging set with Instagram, Facebook, SMS, web chat, and Telegram where connected.",
    },
    {
      label: "Message creation",
      description: "Build steps with templates and placeholders.",
    },
    {
      label: "AI Brain personalization",
      description: "Deeper business-aware personalization when Brain is enabled.",
      href: "/ai-brain",
    },
    {
      label: "Sequencing & follow-up",
      description: "Continue the conversation over time instead of a single blast.",
    },
    {
      label: "Consent and window awareness",
      description: "Enrollment respects channel connection, opt-out, and messaging eligibility checks.",
    },
  ],
  workflowTitle: "From audience to ongoing follow-up",
  workflowSteps: [
    {
      label: "Choose audience",
      description: "Select contacts ready for outreach or re-engagement.",
    },
    {
      label: "Select supported channel",
      description: "Pick a connected messaging channel the campaign can use.",
    },
    {
      label: "Create or personalize message",
      description: "Write steps with placeholders or AI-assisted personalization.",
    },
    {
      label: "Review campaign",
      description: "Confirm status, steps, and eligibility before going live.",
    },
    {
      label: "Send or enroll contacts",
      description: "Start enrollment when the campaign is ready.",
    },
    {
      label: "Track and continue follow-up",
      description: "Monitor progress and keep nurturing until a human closes the loop.",
    },
  ],
  useCases: [
    {
      situation: "Qualified prospects need a structured follow-up.",
      action: "Enroll them into a personalized nurture sequence.",
      outcome: "Interest stays warm without daily manual chasing.",
    },
    {
      situation: "Previous inquiries went quiet.",
      action: "Re-engage eligible contacts on a supported channel.",
      outcome: "Old opportunities get another relevant touch.",
    },
    {
      situation: "You want outreach that reflects your offer.",
      action: "Personalize with placeholders and AI Brain context.",
      outcome: "Messages feel closer to how your business actually sells.",
    },
    {
      situation: "Prospect AI found a list worth contacting.",
      action: "Continue personalized outreach and manage replies in Unified Inbox.",
      outcome: "Discovery and conversation stay in one CRM.",
    },
  ],
  relatedProducts: [
    { label: "AI Brain", href: "/ai-brain", description: "Approved business context for personalization." },
    { label: "Prospect AI", href: "/prospect-ai", description: "Find prospects to enroll in outreach." },
    { label: "Unified Inbox", href: "/unified-inbox", description: "Manage replies from campaign conversations." },
    { label: "Workflows & Automations", href: "/automations", description: "Trigger follow-up around campaign activity." },
  ],
  industryLinks: [
    { label: "Local & Service Businesses", href: "/solutions/local-service-businesses" },
    { label: "Marketing Agencies", href: "/solutions/marketing-agencies" },
    { label: "E-commerce", href: "/solutions/ecommerce" },
  ],
  showPlatformStory: true,
  howItWorks: [
    {
      title: "Prepare your audience",
      description: "Tag or stage contacts so enrollment is intentional.",
    },
    {
      title: "Build the sequence",
      description: "Create steps on a supported messaging channel.",
    },
    {
      title: "Personalize carefully",
      description: "Use placeholders and Brain context where enabled.",
    },
    {
      title: "Enroll and monitor",
      description: "Track progress and answer replies in Unified Inbox.",
    },
  ],
  finalCtaHeadline: "Keep the conversation going after the first touch",
  finalCtaSubtitle:
    "Start free, create a personalized campaign, and manage replies in the same CRM workspace.",
  ssrBullets: [
    "Audience enrollment with campaign status tracking",
    "Supported messaging channels including WhatsApp",
    "Placeholders and AI-assisted personalization where enabled",
    "Sequenced follow-up instead of one-off broadcasts",
    "Eligibility checks for connection, opt-out, and channel fit",
  ],
};

// Fix the accidental situation field in campaigns problems - I introduced a bug
// I'll fix it in a follow-up StrReplace

export const integrationsProduct: ProductPageContent = {
  path: "/integrations",
  productLabel: "Integrations",
  breadcrumbLabel: "Integrations",
  title: "CRM Integrations Directory | WhachatCRM",
  metaDescription:
    "Connect WhachatCRM to messaging channels and business tools you already use — WhatsApp, Instagram, Facebook, SMS, email, Shopify, GoHighLevel, Calendly, Stripe, and more.",
  ogTitle: "Integrations — Connect Your Tools | WhachatCRM",
  h1: "Connect WhachatCRM to the Tools Your Business Already Uses",
  heroIntro:
    "Integrations bring customer conversations and everyday business tools into one CRM workspace — so messaging, scheduling, commerce, and follow-up stay connected.",
  secondaryCta: { label: "See Unified Inbox", href: "/unified-inbox" },
  themeId: "sky",
  heroVariant: "screenshot",
  workflowVariant: "both",
  heroVisual: {
    inquiryLabel: "Connected channel",
    inquiryMessage: "WhatsApp via Meta Embedded Signup is ready.",
    suggestionLabel: "Business tool",
    suggestionMessage: "Calendly booking links and Shopify context sit beside the conversation.",
    stageLabel: "Connected",
    nextStep: "Next: open Unified Inbox",
  },
  screenshotKey: "channels",
  screenshotAlt: "WhachatCRM connected messaging channels including WhatsApp and social platforms",
  problemTitle: "Disconnected tools slow every reply",
  problems: [
    {
      title: "Conversations live outside the CRM",
      description: "WhatsApp, Instagram, and email replies scatter across apps.",
    },
    {
      title: "Commerce context is elsewhere",
      description: "Store and booking tools do not sit beside the message thread.",
    },
    {
      title: "Setup feels intimidating",
      description: "Teams need clear destinations for Meta, Shopify, and partner platforms.",
    },
    {
      title: "Not every connector needs a hard sell",
      description: "A trustworthy directory only lists integrations you can actually use.",
    },
  ],
  howIntro:
    "Connect the channels and platforms that match your workflow, then manage conversations and follow-up in WhachatCRM.",
  howPoints: [
    {
      title: "Connect messaging first",
      description: "Bring WhatsApp, Instagram, Facebook, SMS, Telegram, web chat, and email into Unified Inbox.",
    },
    {
      title: "Add business platforms",
      description: "Link commerce, scheduling, payments, and agency tools where available.",
    },
    {
      title: "Use dedicated guides when needed",
      description: "Shopify, GoHighLevel, WhatsApp API, and MLS pages go deeper on setup and value.",
    },
    {
      title: "Keep working in one inbox",
      description: "Integrations matter most when they support a live conversation.",
    },
  ],
  featuresTitle: "What you can connect",
  features: [
    {
      label: "Official WhatsApp via Meta",
      description: "Embedded Signup path for WhatsApp Business API access.",
      href: "/whatsapp-business-api",
    },
    {
      label: "Social messaging",
      description: "Instagram and Facebook Messenger conversations in one inbox.",
      href: "/unified-inbox",
    },
    {
      label: "Shopify",
      description: "Connect store context with WhachatCRM messaging workflows.",
      href: "/shopify-crm",
    },
    {
      label: "GoHighLevel",
      description: "Agency-friendly connection for teams already operating in GHL.",
      href: "/go-high-level-agencies",
    },
    {
      label: "Calendly & Stripe",
      description: "Booking and payment tools that support the next customer step.",
    },
    {
      label: "Real estate inventory",
      description: "MLS and Showcase IDX paths for listing-aware workflows.",
      href: "/crm-with-mls-integration",
    },
  ],
  workflowTitle: "From connection to conversation",
  workflowSteps: [
    {
      label: "Choose a channel or tool",
      description: "Pick messaging or a business platform from the directory.",
    },
    {
      label: "Complete guided setup",
      description: "Follow Meta Embedded Signup or the relevant integration flow.",
    },
    {
      label: "Confirm the connection",
      description: "Verify the channel or platform appears in your workspace.",
    },
    {
      label: "Open Unified Inbox",
      description: "Start managing conversations with context nearby.",
    },
    {
      label: "Add AI and automation",
      description: "Layer Copilot, chatbots, and workflows on top of connected channels.",
    },
    {
      label: "Expand as you grow",
      description: "Connect commerce, scheduling, or partner tools when ready.",
    },
  ],
  useCases: [
    {
      situation: "You need official WhatsApp for business messaging.",
      action: "Connect WhatsApp via Meta and open Unified Inbox.",
      outcome: "Customer chats land in a shared CRM workspace.",
    },
    {
      situation: "Your store runs on Shopify.",
      action: "Use the Shopify CRM path to connect commerce context.",
      outcome: "Messaging and store operations stay closer together.",
    },
    {
      situation: "Your agency already uses GoHighLevel.",
      action: "Connect WhachatCRM through the GHL agencies path.",
      outcome: "Messaging and AI sit beside your existing stack.",
    },
    {
      situation: "Real estate teams need listing context.",
      action: "Explore MLS / Showcase IDX integration paths.",
      outcome: "Conversations can reference inventory more easily.",
    },
  ],
  relatedProducts: [
    { label: "Unified Inbox", href: "/unified-inbox", description: "Where connected channels meet." },
    { label: "WhatsApp Business API", href: "/whatsapp-business-api", description: "Official WhatsApp setup guide." },
    { label: "Shopify CRM", href: "/shopify-crm", description: "Shopify integration product page." },
    { label: "GoHighLevel Agencies", href: "/go-high-level-agencies", description: "GHL marketplace path." },
  ],
  industryLinks: [
    { label: "E-commerce", href: "/solutions/ecommerce" },
    { label: "Marketing Agencies", href: "/solutions/marketing-agencies" },
    { label: "Real Estate", href: "/real-estate-crm" },
  ],
  integrationCategories: [
    {
      title: "Messaging",
      items: [
        {
          name: "WhatsApp",
          description: "Official Meta Embedded Signup for WhatsApp Business API.",
          href: "/whatsapp-business-api",
        },
        {
          name: "Instagram",
          description: "Manage Instagram conversations in Unified Inbox.",
          href: "/unified-inbox",
        },
        {
          name: "Facebook Messenger",
          description: "Bring Messenger threads into the same workspace.",
          href: "/unified-inbox",
        },
        {
          name: "SMS",
          description: "Text conversations alongside your other channels.",
          href: "/unified-inbox",
        },
        {
          name: "Telegram",
          description: "Supported messaging channel for connected workspaces.",
          href: "/unified-inbox",
        },
        {
          name: "Web Chat",
          description: "Website widget conversations into Unified Inbox.",
          href: "/unified-inbox",
        },
        {
          name: "Email / Gmail",
          description: "Email alongside messaging channels where connected.",
          href: "/unified-inbox",
        },
      ],
    },
    {
      title: "Business platforms",
      items: [
        {
          name: "Shopify",
          description: "Connect Shopify with WhachatCRM messaging workflows.",
          href: "/shopify-crm",
        },
        {
          name: "GoHighLevel",
          description: "Agency marketplace connection for GHL operators.",
          href: "/go-high-level-agencies",
        },
        {
          name: "Calendly",
          description: "Share booking links and keep scheduling next to conversations.",
        },
        {
          name: "Stripe",
          description: "Payments tooling available in the WhachatCRM platform.",
        },
        {
          name: "Google Sheets",
          description: "Spreadsheet connection for operational workflows.",
        },
        {
          name: "HubSpot",
          description: "CRM connection listed in the integrations workspace.",
        },
        {
          name: "WooCommerce",
          description: "Commerce connection for store teams.",
        },
      ],
    },
    {
      title: "Real estate",
      items: [
        {
          name: "Showcase IDX",
          description: "IDX inventory path for real estate teams.",
          href: "/crm-with-mls-integration",
        },
        {
          name: "MLS / Bridge Interactive",
          description: "MLS-aware CRM workflows for listing context.",
          href: "/crm-with-mls-integration",
        },
      ],
    },
  ],
  howItWorks: [
    {
      title: "Pick the integration you need",
      description: "Start with messaging, then add commerce or scheduling tools.",
    },
    {
      title: "Follow the setup destination",
      description: "Use dedicated pages when they exist; otherwise connect in-app.",
    },
    {
      title: "Confirm in Unified Inbox",
      description: "Make sure conversations arrive where your team works.",
    },
    {
      title: "Layer AI and automation",
      description: "Add Copilot, chatbots, and workflows after channels are live.",
    },
  ],
  finalCtaHeadline: "Bring your tools into one conversation workspace",
  finalCtaSubtitle:
    "Start free, connect your first channel, and explore deeper guides for Shopify, WhatsApp, and GoHighLevel.",
  ssrBullets: [
    "Messaging channels including WhatsApp, Instagram, Facebook, SMS, Telegram, web chat, and email",
    "Business platforms such as Shopify, GoHighLevel, Calendly, and Stripe",
    "Real estate paths for MLS and Showcase IDX",
    "Dedicated guides for WhatsApp API, Shopify CRM, and GHL agencies",
    "Unified Inbox as the destination for connected conversations",
  ],
};

export const unifiedInboxProduct: ProductPageContent = {
  path: "/unified-inbox",
  productLabel: "Unified Inbox",
  breadcrumbLabel: "Unified Inbox",
  title: "Unified Inbox for Multi-Channel Messaging | WhachatCRM",
  metaDescription:
    "WhachatCRM Unified Inbox brings WhatsApp, Instagram, Facebook, SMS, Telegram, web chat, and email into one intelligent workspace with assignments, tags, stages, AI Copilot, and follow-up.",
  ogTitle: "Unified Inbox — All Conversations in One Place | WhachatCRM",
  h1: "All Your Customer Conversations. One Intelligent Inbox.",
  heroIntro:
    "Unified Inbox is where WhachatCRM conversations live — across supported messaging channels — with contact context, team ownership, AI assistance, and follow-up in the same workspace.",
  secondaryCta: { label: "See AI Copilot", href: "/ai-copilot" },
  themeId: "emerald",
  heroVariant: "screenshot",
  workflowVariant: "both",
  heroVisual: {
    inquiryLabel: "Incoming message",
    inquiryMessage: "WhatsApp + Instagram threads waiting in one queue.",
    suggestionLabel: "Inbox context",
    suggestionMessage: "Contact history, tags, and Copilot recommendations appear beside the chat.",
    stageLabel: "Unread",
    nextStep: "Next: assign and reply",
  },
  screenshotKey: "unifiedInbox",
  screenshotAlt: "WhachatCRM Unified Inbox showing multi-channel conversations with contact context",
  problemTitle: "What happens when conversations scatter",
  problems: [
    {
      title: "Channels live on different phones",
      description: "WhatsApp, Instagram, and email replies never share ownership.",
    },
    {
      title: "Context is missing",
      description: "Agents answer without tags, stages, or history.",
    },
    {
      title: "AI help is disconnected",
      description: "Suggestions only help when they sit inside the real thread.",
    },
    {
      title: "Follow-up is easy to forget",
      description: "Without a shared inbox, reminders disappear with the person who saw the chat.",
    },
  ],
  howIntro:
    "Messages arrive on supported channels, contacts are identified, AI and CRM context appear, and your team replies, assigns, or automates the next step.",
  howPoints: [
    {
      title: "One queue for supported channels",
      description: "WhatsApp, Messenger, Instagram, SMS, Telegram, web chat, and email where connected.",
    },
    {
      title: "Contact and lead context",
      description: "See history, tags, stages, and ownership beside the conversation.",
    },
    {
      title: "AI inside the thread",
      description: "AI Composer and AI Copilot assist replies without leaving the inbox.",
    },
    {
      title: "Team collaboration",
      description: "Assign conversations and keep shared visibility across users.",
    },
  ],
  featuresTitle: "Inbox capabilities",
  features: [
    {
      label: "Multi-channel conversations",
      description: "Supported messaging channels in one workspace — Shopify is not a native messaging channel.",
      href: "/integrations",
    },
    {
      label: "Conversation list & unread state",
      description: "Scan what needs attention and open the right thread fast.",
    },
    {
      label: "Tags, stages, and contact history",
      description: "Keep opportunity context attached to every chat.",
    },
    {
      label: "Team assignments",
      description: "Clear ownership for multi-user teams.",
      href: "/shared-team-inbox",
    },
    {
      label: "AI Copilot & AI Composer",
      description: "Suggested replies and next-step guidance in-thread.",
      href: "/ai-copilot",
    },
    {
      label: "Follow-up and automation",
      description: "Continue with reminders, workflows, and campaigns.",
      href: "/automations",
    },
  ],
  workflowTitle: "From message to follow-up",
  workflowSteps: [
    {
      label: "Message arrives",
      description: "A customer writes on a connected channel.",
    },
    {
      label: "Contact is identified",
      description: "The conversation attaches to contact history.",
    },
    {
      label: "Conversation enters Unified Inbox",
      description: "The thread joins the shared queue.",
    },
    {
      label: "AI and contact context appear",
      description: "Copilot, tags, and stages help the teammate decide.",
    },
    {
      label: "Reply or assign",
      description: "A human responds or routes ownership.",
    },
    {
      label: "Follow-up continues",
      description: "Schedule, automate, or nurture the next step.",
    },
  ],
  useCases: [
    {
      situation: "Customers write on WhatsApp and Instagram.",
      action: "Handle both channels from one inbox queue.",
      outcome: "Fewer missed messages across apps.",
    },
    {
      situation: "A hot lead needs the right owner.",
      action: "Assign the conversation and keep notes visible.",
      outcome: "Handoffs stay clean for the next teammate.",
    },
    {
      situation: "Agents need help drafting replies.",
      action: "Use Copilot suggestions inside the thread.",
      outcome: "Faster responses with shared context.",
    },
    {
      situation: "Follow-up would otherwise be forgotten.",
      action: "Combine inbox ownership with automations or campaigns.",
      outcome: "Quiet leads stay on a defined path.",
    },
  ],
  relatedProducts: [
    { label: "AI Copilot", href: "/ai-copilot", description: "In-thread recommendations and drafts." },
    { label: "Chatbot Builder", href: "/chatbot-builder", description: "Qualify before humans take over." },
    { label: "Workflows & Automations", href: "/automations", description: "Repeatable follow-up from inbox events." },
    { label: "Integrations", href: "/integrations", description: "Connect the channels that feed the inbox." },
    { label: "Team Collaboration", href: "/shared-team-inbox", description: "Shared ownership and notes." },
  ],
  industryLinks: [
    { label: "Real Estate", href: "/real-estate-crm" },
    { label: "E-commerce", href: "/solutions/ecommerce" },
    { label: "Med Spas & Wellness", href: "/solutions/med-spas" },
  ],
  showPlatformStory: true,
  howItWorks: [
    {
      title: "Connect your channels",
      description: "Start with WhatsApp and the messaging channels you already use.",
    },
    {
      title: "Invite your team",
      description: "Share ownership so conversations do not live on one phone.",
    },
    {
      title: "Enable Copilot",
      description: "Add AI assistance for scoring, drafts, and next steps.",
    },
    {
      title: "Automate the repeats",
      description: "Use chatbots, workflows, and campaigns around the inbox.",
    },
  ],
  finalCtaHeadline: "Put every conversation in one intelligent inbox",
  finalCtaSubtitle:
    "Start free, connect your channels, and let your team reply with AI context beside every thread.",
  ssrBullets: [
    "Multi-channel messaging in one workspace",
    "Contact context, tags, stages, and unread state",
    "Team assignments and shared ownership",
    "AI Copilot and AI Composer in-thread",
    "Follow-up with automations and campaigns",
  ],
};

export const teamCollaborationProduct: ProductPageContent = {
  path: "/shared-team-inbox",
  productLabel: "Team Collaboration",
  breadcrumbLabel: "Team Collaboration",
  title: "Shared Team Inbox & Collaboration | WhachatCRM",
  metaDescription:
    "Collaborate on customer conversations in WhachatCRM with shared inbox access, assignments, ownership visibility, and multi-user plans — so teams reply together without losing context.",
  ogTitle: "Team Collaboration — Shared Inbox | WhachatCRM",
  h1: "Collaborate on Every Conversation Without Losing Context",
  heroIntro:
    "Team Collaboration turns Unified Inbox into a shared workspace — invite teammates, assign ownership, keep visibility into who replied, and move conversations forward together.",
  secondaryCta: { label: "See Unified Inbox", href: "/unified-inbox" },
  themeId: "indigo",
  heroVariant: "screenshot",
  workflowVariant: "both",
  heroVisual: {
    inquiryLabel: "Shared conversation",
    inquiryMessage: "Assigned to Alex — notes visible to the team.",
    suggestionLabel: "Ownership",
    suggestionMessage: "Clear assignee, shared history, and next follow-up in one thread.",
    stageLabel: "Assigned",
    nextStep: "Next: teammate replies",
  },
  screenshotKey: "unifiedInbox",
  screenshotAlt: "Shared WhachatCRM inbox used by a collaborating team with conversation ownership",
  problemTitle: "Single-owner inboxes create risk",
  problems: [
    {
      title: "Conversations live on one phone",
      description: "When that person is offline, customers wait.",
    },
    {
      title: "Nobody knows who owns the lead",
      description: "Duplicate replies and dropped handoffs become normal.",
    },
    {
      title: "Context stays private",
      description: "Without shared notes and history, every teammate starts over.",
    },
    {
      title: "Growth needs more seats",
      description: "Plans should make multi-user collaboration explicit.",
    },
  ],
  howIntro:
    "Invite teammates into WhachatCRM, share Unified Inbox conversations, assign ownership, and keep collaboration visible as the team responds.",
  howPoints: [
    {
      title: "Invite team members",
      description: "Add users according to your plan’s seat availability.",
    },
    {
      title: "Share conversations",
      description: "Work from the same inbox instead of forwarding screenshots.",
    },
    {
      title: "Assign ownership",
      description: "Make the next responsible teammate obvious.",
    },
    {
      title: "Keep visibility",
      description: "See who replied and maintain shared conversation history.",
    },
  ],
  featuresTitle: "Collaboration capabilities",
  features: [
    {
      label: "Shared Unified Inbox",
      description: "Multiple teammates can work from the same conversation workspace.",
      href: "/unified-inbox",
    },
    {
      label: "Assignments",
      description: "Route ownership so the right person follows through.",
    },
    {
      label: "Internal notes",
      description: "Capture private team context where supported.",
    },
    {
      label: "Reply visibility",
      description: "Understand who already responded before you type.",
    },
    {
      label: "Multi-user plans",
      description: "Seat availability expands from Free to Pro as documented on pricing.",
      href: "/pricing",
    },
    {
      label: "AI assistance for teams",
      description: "Copilot helps every assignee with shared context.",
      href: "/ai-copilot",
    },
  ],
  workflowTitle: "From invite to shared follow-through",
  workflowSteps: [
    {
      label: "Invite teammates",
      description: "Add users to the workspace under your plan.",
    },
    {
      label: "Conversation arrives",
      description: "A customer message enters Unified Inbox.",
    },
    {
      label: "Assign an owner",
      description: "Route the thread to the right teammate.",
    },
    {
      label: "Add shared context",
      description: "Use notes, tags, and history the whole team can see.",
    },
    {
      label: "Reply with visibility",
      description: "Everyone knows who already handled the chat.",
    },
    {
      label: "Continue follow-up",
      description: "Automations and campaigns keep ownership intact.",
    },
  ],
  useCases: [
    {
      situation: "A founder can no longer answer every WhatsApp alone.",
      action: "Invite teammates and share the inbox.",
      outcome: "Coverage continues when one person is offline.",
    },
    {
      situation: "Sales and support both touch the same lead.",
      action: "Assign ownership and leave notes for the next teammate.",
      outcome: "Handoffs stay clear and professional.",
    },
    {
      situation: "A growing team needs seats.",
      action: "Choose a plan that matches multi-user collaboration needs.",
      outcome: "Collaboration scales with the business.",
    },
  ],
  relatedProducts: [
    { label: "Unified Inbox", href: "/unified-inbox", description: "The shared conversation workspace." },
    { label: "AI Copilot", href: "/ai-copilot", description: "Assistance for every teammate in-thread." },
    { label: "Workflows & Automations", href: "/automations", description: "Assignment actions in workflows." },
    { label: "Pricing", href: "/pricing", description: "Seat availability by plan." },
  ],
  industryLinks: [
    { label: "Marketing Agencies", href: "/solutions/marketing-agencies" },
    { label: "Real Estate", href: "/real-estate-crm" },
    { label: "Local & Service Businesses", href: "/solutions/local-service-businesses" },
  ],
  howItWorks: [
    {
      title: "Invite your team",
      description: "Add seats available on your plan.",
    },
    {
      title: "Share the inbox",
      description: "Stop forwarding chats from personal phones.",
    },
    {
      title: "Assign every important thread",
      description: "Make ownership explicit.",
    },
    {
      title: "Use AI and automations together",
      description: "Keep collaboration plus follow-up in one CRM.",
    },
  ],
  finalCtaHeadline: "Make customer conversations a team sport",
  finalCtaSubtitle:
    "Start free, invite your teammates, and keep every reply visible in Unified Inbox.",
  ssrBullets: [
    "Shared Unified Inbox for multi-user teams",
    "Assignments and ownership visibility",
    "Internal notes where supported",
    "Plan-based seat availability",
    "Works with Copilot and automations",
  ],
};

export const ALL_PRODUCT_PAGES: ProductPageContent[] = [
  aiBrainProduct,
  aiCopilotProduct,
  chatbotBuilderProduct,
  automationsProduct,
  campaignsProduct,
  integrationsProduct,
  unifiedInboxProduct,
  teamCollaborationProduct,
];

export function getProductByPath(path: string): ProductPageContent | undefined {
  return ALL_PRODUCT_PAGES.find((p) => p.path === path);
}

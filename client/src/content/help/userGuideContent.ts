import type { SeoFaqItem } from "@/content/seo/types";

export type HelpSubsection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  image?: { src: string; alt: string; caption?: string };
};

export type HelpSection = {
  id: string;
  title: string;
  intro?: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: HelpSubsection[];
  image?: { src: string; alt: string; caption?: string };
};

const img = {
  dashboard: { src: "/hero/whachat-hero-mockup.png", alt: "WhachatCRM dashboard overview" },
  channels: { src: "/email/activation/channels.png", alt: "Channel settings in WhachatCRM" },
  embeddedSignup: { src: "/email/activation/embedded-signup.png", alt: "Meta embedded WhatsApp signup" },
  connectWhatsapp: { src: "/email/activation/connect-whatsapp.png", alt: "Connect WhatsApp channel" },
  inbox: { src: "/email/activation/inbox.png", alt: "Unified inbox" },
  aiCopilot: { src: "/email/activation/ai-copilot.png", alt: "AI Copilot panel" },
  aiSuggestions: { src: "/email/activation/inbox-ai-suggestions.png", alt: "AI suggested replies in inbox" },
  leadQual: { src: "/email/activation/lead-qualification.png", alt: "AI lead qualification" },
  listing: { src: "/email/activation/listing-recommendation.png", alt: "MLS listing recommendation" },
  rge: { src: "/rge-layout-preview.png", alt: "Growth Engine automation builder" },
  aiConversation: { src: "/email/activation/ai-conversation.png", alt: "AI conversation insights" },
};

export const USER_GUIDE_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    intro:
      "WhachatCRM brings customer conversations into one workspace. This Help Center reflects how the product works today — from your first login through advanced automations.",
    subsections: [
      {
        title: "Creating an account",
        paragraphs: [
          "Visit whachatcrm.com and click Start Free. Sign up with email or continue with Google. Verify your email if prompted, then land in the onboarding wizard.",
          "The wizard guides channel connection, workspace naming, and optional Shopify or real estate setup. You can skip steps and return later from Settings → Integrations.",
        ],
      },
      {
        title: "Free vs Pro plans",
        bullets: [
          "Free: test WhachatCRM with one user, basic inbox, limited active conversations, and supported channel testing.",
          "Starter ($19/mo): up to 3 users, AI Assist Basic, templates, follow-ups, core integrations, and basic automations.",
          "Pro ($49/mo): unlimited users, larger conversation capacity, advanced Growth Engine workflows, multi-channel scaling, and team assignment.",
          "AI Brain add-on: deeper AI on Starter or Pro — check Pricing for current availability.",
          "Meta/WhatsApp conversation fees bill separately through Meta; WhachatCRM adds no message markup.",
        ],
      },
      {
        title: "AI Trial",
        paragraphs: [
          "Eligible new workspaces receive a limited AI Trial to experience Copilot summaries, suggested replies, and lead scoring before committing to a paid tier or AI Brain add-on.",
          "Trial limits appear in Settings → Billing. When the trial ends, AI features downgrade per your plan unless you upgrade.",
        ],
      },
      {
        title: "Dashboard overview",
        paragraphs: [
          "After login, the dashboard summarizes open conversations, follow-ups due today, automation activity, and channel health. Quick links jump to Inbox, Automations, Templates, and Integrations.",
          "Pro users see team workload indicators and assignment queues when enabled.",
        ],
        image: { ...img.dashboard, caption: "Dashboard and navigation overview" },
      },
      {
        title: "Navigation",
        bullets: [
          "Inbox — all conversations across connected channels",
          "Contacts — searchable CRM records with tags and stages",
          "Automations — Growth Engine workflows and preset templates",
          "Templates — WhatsApp template library synced from Meta",
          "Campaigns — saved multi-step sequences",
          "Inventory — MLS listings when Bridge is connected",
          "Settings — channels, team, billing, integrations, agent page",
        ],
      },
    ],
  },
  {
    id: "connecting-channels",
    title: "Connecting Channels",
    intro:
      "Connect messaging channels from Settings → Integrations or Channel Settings. You do not need to manually hunt API tokens for standard Meta setup — embedded signup handles credentials securely.",
    subsections: [
      {
        title: "WhatsApp — Embedded Signup",
        paragraphs: [
          "Choose Meta (WhatsApp Cloud) and launch embedded signup. Sign in with Facebook, select your business portfolio, WhatsApp Business Account (WABA), and phone number.",
          "WhachatCRM stores connection status in channel settings and surfaces errors inline if Meta rejects a display name or requires verification documents.",
        ],
        image: { ...img.embeddedSignup, caption: "Meta embedded signup inside WhachatCRM" },
      },
      {
        title: "WhatsApp — Existing number migration",
        paragraphs: [
          "If your number already runs on WhatsApp Business app or another API provider, Meta may offer migration or coexistence during signup. Follow on-screen eligibility — options vary by region and account history.",
          "Backup important chats before migration if Meta prompts you to re-register the number on Cloud API.",
        ],
      },
      {
        title: "WhatsApp — New number registration",
        paragraphs: [
          "You can register a new Cloud API number without an existing WhatsApp personal account on that line. Complete SMS or voice verification when Meta requests it.",
        ],
        image: { ...img.connectWhatsapp, caption: "WhatsApp channel connection status" },
      },
      {
        title: "WhatsApp — Verification and testing",
        bullets: [
          "Business verification may be required for higher messaging limits — track status in Meta Business Manager.",
          "Send a test message to your personal phone from the inbox after connection succeeds.",
          "Sync templates before sending outside the 24-hour session window.",
        ],
      },
      {
        title: "WhatsApp — Common errors",
        bullets: [
          "Display name rejected — adjust to match legal business name guidelines in Meta.",
          "Number already registered — complete migration or release number from previous provider.",
          "Template send failed — sync library; verify template approval status in Meta.",
          "Session expired — use approved template to reopen conversation after 24h inactivity.",
        ],
      },
      {
        title: "Facebook Messenger",
        paragraphs: [
          "Connect your Facebook Page from Channel Settings. Grant messaging permissions when Meta prompts. Page admins must approve the connection.",
          "Messenger conversations appear in the unified inbox with a channel badge. Respect Meta messaging policies and opt-outs.",
        ],
      },
      {
        title: "Instagram",
        paragraphs: [
          "Link an Instagram Professional account connected to your Facebook Page. Business Manager ownership must align — mismatched Page/IG links are a common setup failure.",
          "Instagram DMs share the inbox with WhatsApp and Messenger; session rules differ from WhatsApp templates.",
        ],
        image: { ...img.channels, caption: "Connect WhatsApp, Messenger, and Instagram" },
      },
    ],
  },
  {
    id: "unified-inbox",
    title: "Unified Inbox",
    paragraphs: [
      "The unified inbox lists every conversation across connected channels in one searchable queue. Filter by channel, assignment, tags, or pipeline stage to focus work.",
    ],
    bullets: [
      "Multi-channel messaging — reply to WhatsApp, Messenger, and Instagram without switching apps",
      "Conversation history — full thread stored in WhachatCRM after connection",
      "Team assignments — assign owners on Pro plans",
      "Internal notes — private commentary teammates see but customers do not",
      "Lead timeline — chronological record of messages, stage changes, and automations",
    ],
    image: { ...img.inbox, caption: "Unified inbox with CRM sidebar" },
  },
  {
    id: "ai-copilot",
    title: "AI Copilot",
    paragraphs: [
      "AI Copilot accelerates sales and support without removing human judgment. Configure mode in workspace settings: Manual, Suggest, or Auto.",
    ],
    bullets: [
      "AI lead scoring — prioritizes contacts showing budget, urgency, and engagement signals",
      "Lead qualification — summarizes buyer/seller intent from natural conversation",
      "Suggested replies — drafts responses agents edit before sending",
      "AI summaries — condense long threads for handoffs",
      "Follow-up recommendations — nudge when conversations stall",
      "Conversation insights — highlight objections and next best actions",
      "Message drafting — generate templates for common scenarios",
    ],
    image: { ...img.aiSuggestions, caption: "Suggested replies in the inbox" },
  },
  {
    id: "growth-engine",
    title: "Growth Engine (RGE)",
    paragraphs: [
      "Growth Engine is WhachatCRM's automation builder. Install preset templates or create workflows from scratch with triggers, conditions, delays, messages, and AI actions.",
    ],
    bullets: [
      "Automation workflows — visual builder for multi-step sequences",
      "Preset automation templates — ecommerce, real estate, support, and nurture",
      "Tags — segment contacts for targeted automations",
      "Pipeline stages — trigger actions when deals progress",
      "Campaigns — multi-message sequences with scheduler controls",
      "Triggers — new message, keyword, tag added, stage changed, schedule",
      "Conditions — channel, score, time windows, stage exclusions",
      "AI actions — draft messages or update scores mid-workflow",
      "Appointment reminders — reduce no-shows for showings and calls",
      "Follow-up automation — no-reply sequences when leads go quiet",
    ],
    image: { ...img.rge, caption: "Growth Engine workflow editor" },
  },
  {
    id: "agent-pages",
    title: "Agent Pages",
    bullets: [
      "Public profile — SEO-friendly page with your name, photo, and contact options",
      "Lead capture — forms create CRM contacts instantly",
      "Home valuation CTA — optional seller lead magnet",
      "Market areas — highlight cities and neighborhoods you serve",
      "Custom biography — tell your story for organic search",
      "Branding — colors and logo aligned with your business",
      "MLS integration — display synced listings when Bridge is connected",
    ],
  },
  {
    id: "mls-integration",
    title: "MLS Integration",
    paragraphs: [
      "WhachatCRM connects to Bridge Interactive for MLS inventory sync. Listings power AI property matching, agent page displays, and automated recommendations.",
    ],
    bullets: [
      "Bridge Interactive integration — enter credentials in Integrations",
      "Inventory synchronization — scheduled sync updates price, status, and media",
      "Automatic updates — no manual CSV exports for participating feeds",
      "AI buyer preference extraction — infer budget and areas from chats",
      "AI property matching — suggest listings inside conversations",
      "Lead qualification — scores reflect engagement with recommended properties",
      "Inventory recommendations — share listings with one click from inbox sidebar",
    ],
    image: { ...img.listing, caption: "Listing recommendations in a buyer thread" },
  },
  {
    id: "shopify-integration",
    title: "Shopify Integration",
    intro:
      "Shopify is one of the deepest WhachatCRM integrations — install from the App Store for embedded onboarding, order context, and ecommerce automations.",
    subsections: [
      {
        title: "Installing from Shopify",
        paragraphs: [
          "Search WhachatCRM in the Shopify App Store, install, and approve permissions. Embedded onboarding connects billing (where applicable), WhatsApp, and optional Meta channels.",
        ],
      },
      {
        title: "WhatsApp notifications and messaging",
        bullets: [
          "Order confirmations and shipping updates via approved templates",
          "Abandoned Cart Recovery workflows tied to live cart data",
          "Product inquiry follow-up when shoppers ask questions pre-purchase",
        ],
      },
      {
        title: "Facebook Messenger and Instagram",
        paragraphs: [
          "Connect Meta channels alongside Shopify for omnichannel support — same inbox, same order context.",
        ],
      },
      {
        title: "Customer support and AI Copilot",
        paragraphs: [
          "Agents see order history beside chats. AI Copilot suggests answers about products, returns, and shipping policies.",
        ],
        image: { ...img.aiCopilot, caption: "AI Copilot for Shopify support" },
      },
      {
        title: "Preset eCommerce automation templates",
        bullets: [
          "Abandoned Cart Recovery",
          "Order follow-up and review requests",
          "Customer support keyword routing",
          "Re-engagement for lapsed buyers",
        ],
      },
    ],
  },
  {
    id: "templates-campaigns",
    title: "Templates, Campaigns & Billing",
    subsections: [
      {
        title: "WhatsApp templates",
        bullets: [
          "Sync approved templates from Meta Business Manager",
          "Support text, media, and carousel formats where Meta approved them",
          "Use Library send for variable mapping; Quick send for fast one-offs",
          "Required for messages outside the 24-hour session window",
        ],
      },
      {
        title: "Campaigns",
        bullets: [
          "Start from preset campaigns; save as workspace-owned sequences",
          "Enroll contacts manually from inbox sidebar",
          "Pause, resume, cancel, or retry enrollments from campaign dashboard",
        ],
      },
      {
        title: "Billing",
        paragraphs: [
          "Manage plans in Settings → Billing via Stripe or Shopify depending on signup path. Upgrade to Starter or Pro for users, AI, and advanced automations.",
        ],
      },
    ],
  },
  {
    id: "policies",
    title: "Policies & Support",
    bullets: [
      "Privacy Policy — /privacy-policy",
      "Terms of Use — /terms-of-use",
      "Data deletion — /data-deletion",
      "Email preferences — /unsubscribe",
      "Searchable articles — /help",
      "Contact support — /contact",
    ],
  },
];

export const USER_GUIDE_FAQS: SeoFaqItem[] = [
  { question: "How do I create a WhachatCRM account?", answer: "Click Start Free on the website, sign up with email or Google, and complete the onboarding wizard." },
  { question: "Is there a free plan?", answer: "Yes. Free includes core inbox features with one user and limited active conversations." },
  { question: "What is the difference between Starter and Pro?", answer: "Starter supports up to 3 users and basic automations. Pro adds unlimited users, advanced Growth Engine workflows, and team assignment." },
  { question: "What is the AI Trial?", answer: "A limited trial of AI Copilot features for eligible new workspaces before upgrading or purchasing AI Brain." },
  { question: "How do I connect WhatsApp?", answer: "Go to Integrations → Meta (WhatsApp Cloud) and complete embedded signup with your Meta business portfolio." },
  { question: "Do I need a developer for WhatsApp setup?", answer: "No for standard embedded signup. Developers can extend via webhooks where offered." },
  { question: "Can I migrate my existing WhatsApp Business number?", answer: "Often yes — Meta guides migration or coexistence during embedded signup depending on eligibility." },
  { question: "What is the 24-hour WhatsApp session window?", answer: "After a customer messages you, free-form replies are allowed for 24 hours. After that, use Meta-approved templates." },
  { question: "How do I connect Facebook Messenger?", answer: "Link your Facebook Page in Channel Settings and approve Meta messaging permissions." },
  { question: "Why won't Instagram connect?", answer: "Ensure Instagram Professional is linked to the same Facebook Page and Business Manager ownership matches." },
  { question: "What channels appear in the unified inbox?", answer: "WhatsApp, Messenger, Instagram, and others you connect such as SMS or web chat on eligible plans." },
  { question: "How do I assign conversations to teammates?", answer: "On Pro, use Assign in the inbox sidebar to set conversation ownership." },
  { question: "Are internal notes visible to customers?", answer: "No. Notes are private to your workspace." },
  { question: "What is the lead timeline?", answer: "A chronological history of messages, automation events, and stage changes for each contact." },
  { question: "How does AI lead scoring work?", answer: "AI analyzes conversation content and engagement to produce scores that help prioritize follow-ups." },
  { question: "Can AI send messages automatically?", answer: "Only if you enable Auto mode and configure automations accordingly. Default is human-approved sends." },
  { question: "What is AI Brain?", answer: "An optional add-on that deepens AI capabilities on Starter or Pro plans." },
  { question: "What is Growth Engine?", answer: "WhachatCRM's automation builder for triggers, conditions, messages, and AI actions." },
  { question: "How do I install preset automation templates?", answer: "Open Automations, browse the preset library, install, customize, and enroll contacts." },
  { question: "What are pipeline stages?", answer: "CRM phases like New, Qualified, or Closed that trigger automations and organize reporting." },
  { question: "How do appointment reminders work?", answer: "Workflow steps send template or session messages before scheduled showings or calls." },
  { question: "What is an Agent Page?", answer: "A public SEO profile with biography, market areas, lead forms, and optional listings." },
  { question: "How do I connect Bridge MLS?", answer: "Enter Bridge Interactive credentials in Integrations and verify sync on the Inventory screen." },
  { question: "How often does MLS inventory sync?", answer: "On a recurring schedule — listing status and price updates propagate automatically." },
  { question: "Can AI recommend listings?", answer: "Yes. AI uses buyer preferences from conversations to suggest matching MLS inventory." },
  { question: "How do I install WhachatCRM on Shopify?", answer: "Install from the Shopify App Store and follow embedded onboarding for channels and billing." },
  { question: "Does abandoned cart recovery work on WhatsApp?", answer: "Yes with Shopify connected and Meta-approved templates for compliant outreach." },
  { question: "Are WhatsApp fees included in my subscription?", answer: "No. Meta bills conversation fees separately; WhachatCRM adds no markup." },
  { question: "How do I sync WhatsApp templates?", answer: "Use Sync on the Templates screen to pull approved templates from Meta Business Manager." },
  { question: "Can I connect HubSpot?", answer: "Yes. Paste your HubSpot token during connect and manage sync from the integration card." },
  { question: "Does WhachatCRM support WooCommerce?", answer: "Yes where enabled — connect from Integrations for order-aware follow-ups." },
  { question: "How do I upgrade my plan?", answer: "Settings → Billing → change plan via Stripe or Shopify portal." },
  { question: "How do I cancel?", answer: "Cancel from the billing portal shown in Settings. Export important data before cancellation." },
  { question: "Where is the searchable Help Center?", answer: "Visit /help for topic articles or this guide at /user-guide for the full walkthrough." },
  { question: "How do I contact support?", answer: "Use /contact or email from your registered account for authenticated support." },
  { question: "Is my data encrypted?", answer: "WhachatCRM uses industry-standard transport encryption. See Privacy Policy for details." },
  { question: "Can I request data deletion?", answer: "Yes — follow instructions at /data-deletion." },
  { question: "Do you mark up Meta message fees?", answer: "No. You pay Meta directly per their pricing." },
  { question: "What is coexistence on WhatsApp?", answer: "Meta feature allowing Business app and Cloud API on the same number when eligible." },
  { question: "How do I test automations safely?", answer: "Enroll an internal test contact, use pause/resume controls, and review messages before broad enrollment." },
];

export const USER_GUIDE_RELATED_LINKS = [
  { href: "/whatsapp-crm", label: "WhatsApp CRM Guide" },
  { href: "/unified-inbox", label: "Unified Inbox" },
  { href: "/shopify-crm", label: "Shopify CRM" },
  { href: "/real-estate-crm", label: "Real Estate CRM" },
  { href: "/crm-with-mls-integration", label: "MLS Integration" },
  { href: "/automation-templates", label: "Automation Templates" },
  { href: "/ai-lead-scoring", label: "AI Lead Scoring" },
  { href: "/whatsapp-business-api", label: "WhatsApp Business API" },
];

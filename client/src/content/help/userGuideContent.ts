import type { SeoFaqItem } from "@/content/seo/types";
import type { MarketingScreenshotMeta } from "@shared/marketingScreenshots";
import { S } from "@shared/marketingScreenshots";
import {
  PROSPECT_AI_BRAIN_FAQ,
  PROSPECT_AI_BRAIN_OPTIONAL_DETAIL,
  PROSPECT_AI_BRAIN_OPTIONAL_SUMMARY,
  PROSPECT_AI_BRAIN_RELATIONSHIP,
} from "@/content/prospectAiBrainEducation";

export type HelpSubsection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  image?: MarketingScreenshotMeta;
};

export type HelpSection = {
  id: string;
  title: string;
  intro?: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: HelpSubsection[];
  image?: MarketingScreenshotMeta;
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
          "Free: test WhachatCRM with one user, Unified Inbox, Integrations, basic WhatsApp templates, Prospect AI, and limited active conversations.",
          "Starter ($19/mo): up to 3 users, AI Assist Basic, campaign automation, follow-ups, and chatbot.",
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
        image: S.dashboard,
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
        image: S.embeddedSignup,
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
        image: S.connectWhatsapp,
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
        image: S.channels,
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
    image: S.unifiedInbox,
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
    image: S.leadScore,
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
      "Follow-up automation — next-day re-engagement and multi-step nurture when leads go quiet",
    ],
    image: S.automationWorkflows,
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
    image: S.agentPagePublic,
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
    image: S.inventorySource,
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
        image: S.unifiedInbox,
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
    id: "prospect-ai",
    title: "Prospect AI",
    intro:
      "Prospect AI is your AI sales team for discovering local businesses, qualifying opportunities with real public information, and launching personalized outreach—included with every WhachatCRM plan.",
    subsections: [
      {
        title: "Introduction",
        paragraphs: [
          "Open Prospect AI from the Growth Engines gallery or the sidebar after activation. The first time you activate Prospect AI, a short onboarding guide explains how discovery, review, and campaigns work. You can reopen Prospect AI Guide anytime from the Prospect AI header.",
          "Think of Prospect AI as an AI sales employee—not a perfect database. It works with real-world public business information, so incomplete contact data and Not Qualified outcomes are expected.",
        ],
      },
      {
        title: "Discover Businesses",
        paragraphs: [
          "On the Discover tab, choose a business type (industry) and location, optionally set a search radius and target count, then start discovery. Prospect AI searches publicly available business information and returns potential customers.",
          "Start with one city or niche and a smaller batch so you can learn what works for your market.",
        ],
        bullets: [
          "Business Type — e.g. dental clinics, restaurants, auto repair",
          "Location — city or region to search",
          "Target new prospects — how many net-new businesses to aim for",
          "Existing CRM matches and duplicates do not count toward your target",
        ],
      },
      {
        title: "AI Review",
        paragraphs: [
          "After discovery, send prospects to Review. Prospect AI analyzes each business and surfaces a mix of Qualified, Needs Review, Missing Email, Enrichment Unavailable, and Not Qualified outcomes.",
          "This mix is normal. Not every business is the right customer for your offer.",
        ],
      },
      {
        title: "Understanding AI Decisions",
        paragraphs: [
          "Qualification uses publicly available signals about the prospect, plus your business context when available (including AI Brain if you use it). Decisions explain fit, gaps, and suggested next steps so you can accept, edit, or archive with confidence. AI Brain is optional — Prospect AI discovery, qualification, outreach, campaigns, and reply management work without it.",
        ],
      },
      {
        title: "AI Brain (Optional)",
        paragraphs: [
          PROSPECT_AI_BRAIN_OPTIONAL_SUMMARY,
          PROSPECT_AI_BRAIN_OPTIONAL_DETAIL,
          PROSPECT_AI_BRAIN_RELATIONSHIP.replace("\n", " "),
        ],
      },
      {
        title: "Enrichment",
        paragraphs: [
          "Enrichment looks for publicly available contact details such as websites and emails. When public sources are thin, you may see Enrichment Unavailable or Missing Email—even for otherwise strong businesses.",
        ],
      },
      {
        title: "Missing Data",
        paragraphs: [
          "Missing emails, websites, or limited profiles do not mean Prospect AI is broken. They mean the public web does not expose that information cleanly. Prefer honest gaps over invented contact details.",
        ],
        bullets: [
          "Missing Email — common for small local businesses",
          "Missing Website — many businesses rely on social profiles only",
          "Enrichment Unavailable — public sources did not yield usable fields",
          "Duplicate — already in your workspace or discovery batch",
          "Not Qualified — outside your ideal customer profile",
        ],
      },
      {
        title: "Manual Prospect Updates",
        paragraphs: [
          "Before discarding a strong prospect with a missing email, update the record manually. Check the business website, contact page, Facebook, Instagram, Google Business Profile, or LinkedIn. One verified email can move a prospect to Campaign Ready.",
        ],
      },
      {
        title: "Campaigns",
        paragraphs: [
          "Review & Accept fits (mark Qualified), send Campaign Ready prospects to Campaign, then use Message Creation. Start Sending when ready. Replies land in Inbox.",
        ],
      },
      {
        title: "Message Creation Modes",
        paragraphs: [
          "Prospect AI supports message creation modes for drafting personalized outreach. Use campaign instructions and AI assistance to tailor tone and length, then edit anything before send.",
        ],
      },
      {
        title: "Unified Inbox",
        paragraphs: [
          "When prospects reply, conversations appear in the Unified Inbox. AI Copilot can help draft responses and suggest next actions so you keep momentum after the first outreach.",
        ],
      },
      {
        title: "Archive & Restore",
        paragraphs: [
          "Archive prospects you do not need so your Review and Campaign queues stay focused. Restore archived prospects later if you want to revisit them.",
        ],
      },
      {
        title: "Best Practices",
        bullets: [
          "Start with one city or niche",
          "Begin with a smaller batch",
          "Review AI recommendations before accepting",
          "Manually add verified emails for promising prospects",
          "Personalize outreach before sending",
          "Archive prospects you will not pursue",
          "Watch replies in the Unified Inbox",
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
  { question: "Is there a free plan?", answer: "Yes. Free includes Unified Inbox, Integrations, basic WhatsApp templates, Prospect AI, one user, and limited active conversations. Chatbot, campaign automation, and AI Brain are not included." },
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
  {
    question: "Why is a business Not Qualified?",
    answer:
      "Prospect AI marks a business Not Qualified when it does not fit your ideal customer profile or AI Brain context. This is expected when working with real public listings—not every business is a good opportunity.",
  },
  {
    question: "Why is email missing?",
    answer:
      "Many local businesses do not publish a clear public email. Prospect AI does not invent contact details. You can add a verified email manually from the website, social profiles, or Google Business Profile to make the prospect Campaign Ready.",
  },
  {
    question: "Why does Enrichment Unavailable happen?",
    answer:
      "Enrichment Unavailable means public sources did not yield usable contact fields for that business. It does not mean Prospect AI failed—it means the public web did not expose enough information.",
  },
  {
    question: "Can I edit prospect information manually?",
    answer:
      "Yes. Update missing fields such as email or website on promising prospects before discarding them. Manual updates often unlock Campaign Ready status.",
  },
  {
    question: "How does Prospect AI qualify businesses?",
    answer:
      "Prospect AI analyzes publicly available business information against your goals and business context when available (including AI Brain if you use it), then recommends Qualified, Needs Review, or Not Qualified with reasoning you can review before accepting. AI Brain is optional and not required for qualification.",
  },
  {
    question: PROSPECT_AI_BRAIN_FAQ.question,
    answer: PROSPECT_AI_BRAIN_FAQ.answer,
  },
];

export const USER_GUIDE_RELATED_LINKS = [
  { href: "/whatsapp-crm", label: "WhatsApp CRM Guide" },
  { href: "/unified-inbox", label: "Unified Inbox" },
  { href: "/app/prospect-ai", label: "Prospect AI" },
  { href: "/shopify-crm", label: "Shopify CRM" },
  { href: "/real-estate-crm", label: "Real Estate CRM" },
  { href: "/crm-with-mls-integration", label: "MLS Integration" },
  { href: "/automation-templates", label: "Automation Templates" },
  { href: "/ai-lead-scoring", label: "AI Lead Scoring" },
  { href: "/whatsapp-business-api", label: "WhatsApp Business API" },
];

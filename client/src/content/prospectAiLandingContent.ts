/**
 * Prospect AI product SEO landing — content + FAQ (presentation only).
 */
import { screenshot, S } from "@shared/marketingScreenshots";
import { cluster } from "@/content/seo/sharedLinks";

export const PROSPECT_AI_LANDING_PATH = "/prospect-ai";

export const PROSPECT_AI_LANDING_SEO = {
  title: "Prospect AI — AI Sales Team for Lead Generation & Outreach | WhachatCRM",
  description:
    "Prospect AI is your AI sales team: discover local businesses, qualify opportunities, launch personalized email outreach, and manage every reply in one CRM. Start free.",
  keywords: [
    "AI Sales Assistant",
    "AI Sales Agent",
    "AI Sales Team",
    "AI Prospecting Software",
    "AI Lead Generation",
    "AI Sales Automation",
    "AI Business Prospecting",
    "Local Business Lead Generation",
    "Business Prospecting Software",
    "Lead Qualification Software",
    "Sales Prospecting Tool",
    "AI Outreach Software",
    "Sales Engagement Platform",
    "Lead Qualification AI",
    "Prospecting CRM",
    "AI Customer Acquisition",
  ].join(", "),
  ogTitle: "Prospect AI — Meet Your AI Sales Team | WhachatCRM",
  ogDescription:
    "Discover businesses, qualify opportunities, launch personalized outreach, and manage replies—all from one platform.",
  ogImagePath: "/og/og-prospect-ai.png",
} as const;

export const PROSPECT_AI_LANDING = {
  brand: "Prospect AI",
  h1: "Meet Your AI Sales Team",
  subheadlineLines: [
    "Discover businesses.",
    "Qualify opportunities.",
    "Launch personalized outreach.",
    "Manage every reply—",
    "all from one platform.",
  ],
  primaryCta: "Start Free Trial",
  secondaryCta: "Watch Demo",
  authRedirect: "/app/prospect-ai",

  pain: {
    id: "stop-cold-prospecting",
    title: "Stop Cold Prospecting",
    paragraphs: [
      "Traditional prospecting still means hours of Google searches, spreadsheet chaos, and guessing who might buy. Teams scrape directories, chase incomplete contact data, and send generic blasts that never earn a reply.",
      "Meanwhile, local businesses that need your offer sit one search away—if only you had an AI sales assistant to find them, qualify the fit, and start a real conversation.",
      "Prospect AI replaces that grind with AI prospecting software built for local business lead generation, lead qualification, and sales engagement—inside the CRM you already use for replies.",
    ],
  },

  meetTeam: {
    id: "meet-ai-sales-team",
    title: "Meet Your AI Sales Team",
    paragraphs: [
      "Think of Prospect AI as an AI employee for customer acquisition—not a static database. It discovers businesses in your market, researches publicly available information, recommends who is worth your time, and helps you launch personalized outreach.",
      "You stay in control: Review & Accept fits, edit every message, then Start Sending when you are ready. Replies land in your Unified Inbox beside WhatsApp, Messenger, Instagram, and more.",
    ],
    image: screenshot(
      "prospectAiReview",
      "WhachatCRM Prospect AI Review workspace showing AI-qualified business prospects and campaign readiness.",
      {
        size: "content",
        caption: "The real Prospect AI Review workspace—AI-qualified prospects ready for campaign outreach.",
      },
    ),
  },

  howItWorks: {
    id: "how-prospect-ai-works",
    title: "How Prospect AI Works",
    subtitle: "A clear sales workflow from first discovery to won customer.",
    steps: [
      { label: "Discover", detail: "Find local businesses by industry and location." },
      { label: "AI Review", detail: "AI qualifies opportunities against your goals." },
      { label: "Campaign", detail: "Launch personalized AI outreach on your schedule." },
      { label: "Inbox", detail: "Continue every reply with AI Copilot." },
      { label: "Customer", detail: "Move wins into your pipeline." },
    ],
  },

  featureSections: [
    {
      id: "discover-businesses",
      title: "Discover Businesses",
      paragraphs: [
        "Choose a business type and location, set your radius, and start discovery. Prospect AI searches publicly available business information to surface net-new prospects for your market.",
        "Use it as local business lead generation and business prospecting software in one step—without renting another cold-email list.",
      ],
      bullets: [
        "Industry + location targeting",
        "Public business discovery",
        "Send promising results straight to Review",
      ],
      image: screenshot(
        "prospectAiDiscover",
        "WhachatCRM Prospect AI business discovery tool for finding prospects by business type and location.",
        {
          size: "content",
          caption: "Discover local businesses by industry and location—then send fits to AI Review.",
        },
      ),
    },
    {
      id: "ai-qualification",
      title: "AI Qualification",
      paragraphs: [
        "Lead qualification AI reviews each business and surfaces outcomes like Qualified, Needs Review, Missing Email, and Not Qualified—with reasoning you can trust.",
        "Enrichment looks for public contact details when a website exists. You can manually add a verified email anytime to make a prospect Campaign Ready.",
      ],
      bullets: [
        "AI-powered qualification",
        "Lead enrichment from public sources",
        "Review & Accept before outreach",
      ],
      image: screenshot(
        "prospectAiQualification",
        "WhachatCRM Prospect AI Review workspace showing AI-qualified business prospects and campaign readiness.",
        {
          size: "content",
          caption: "AI qualifies leads so your team reviews exceptions—not every raw listing.",
        },
      ),
    },
    {
      id: "personalized-outreach",
      title: "Personalized Outreach",
      paragraphs: [
        "Message Creation lets AI write outreach, use your templates, or blend both. Edit every subject and body before you Start Sending.",
        "Prospect AI is AI outreach software with pacing controls—so sales automation stays personal, not spammy.",
      ],
      bullets: [
        "AI Writes / Template / Personalization modes",
        "Edit before send",
        "Start, Pause, and Resume Sending",
      ],
      image: screenshot(
        "prospectAiPersonalizedOutreach",
        "WhachatCRM Prospect AI message editor for creating and reviewing personalized business outreach.",
        {
          size: "content",
          caption: "Personalized email outreach campaigns with clear Ready to Send controls.",
        },
      ),
    },
    {
      id: "unified-inbox",
      title: "Unified Inbox",
      paragraphs: [
        "When a business replies, the conversation opens in your Unified Inbox—the same place you run WhatsApp CRM conversations, Messenger, Instagram, and website chat.",
        "AI Copilot helps you answer faster while your sales workflow stays in one prospecting CRM.",
      ],
      bullets: [
        "Replies beside every channel",
        "AI Copilot on every thread",
        "Mark wins without switching tools",
      ],
      image: {
        ...S.unifiedInbox,
        alt: "Unified Inbox where Prospect AI replies continue beside WhatsApp and Messenger",
        caption: "Manage every Prospect AI reply in the same Unified Inbox as WhatsApp and social.",
      },
    },
  ],

  platform: {
    id: "everything-in-one-platform",
    title: "Everything in One Platform",
    subtitle: "Prospecting automation plus the channels your customers already use.",
    items: [
      "Prospect AI",
      "Unified Inbox",
      "AI Copilot",
      "Chatbot",
      "Workflow Automation",
      "Gmail",
      "WhatsApp",
      "Facebook",
      "Instagram",
      "Telegram",
      "Website Chat",
      "TikTok Lead Forms",
    ],
  },

  whyChoose: {
    id: "why-businesses-choose",
    title: "Why Businesses Choose Prospect AI",
    items: [
      {
        title: "No active-contact pricing",
        body: "Grow your pipeline without paying per contact you already own.",
      },
      {
        title: "No Meta markup",
        body: "Connect official messaging channels without BSP message markup.",
      },
      {
        title: "Free Prospect AI discoveries",
        body: "Every plan includes Prospect AI discoveries so AI lead generation is not locked behind an add-on.",
      },
      {
        title: "Works inside your CRM",
        body: "Discovery, campaigns, and replies stay in WhachatCRM—not another tab jungle.",
      },
      {
        title: "AI-powered qualification",
        body: "Lead qualification software that explains fits before you spend outreach time.",
      },
      {
        title: "Unified Inbox",
        body: "Close the loop from first discovery to conversation in one sales engagement platform.",
      },
    ],
  },

  faqs: [
    {
      question: "What is Prospect AI?",
      answer:
        "Prospect AI is WhachatCRM’s AI sales team for discovering local businesses, qualifying opportunities with public information, launching personalized outreach, and managing replies in a Unified Inbox. It works as AI prospecting software and a sales prospecting tool inside your CRM.",
    },
    {
      question: "How does Prospect AI find businesses?",
      answer:
        "On Discover, you choose an industry and location (and optional radius). Prospect AI searches publicly available business information to find potential customers—real local listings, not invented contacts.",
    },
    {
      question: "Does AI contact businesses automatically?",
      answer:
        "No. You Review & Accept prospects, configure Message Creation, then explicitly Start Sending. Prospect AI does not cold-email businesses without your approval.",
    },
    {
      question: "Can I review businesses before outreach?",
      answer:
        "Yes. After discovery, send results to Review. You see AI recommendations such as Qualified, Needs Review, Missing Email, and Not Qualified before anything is queued for a campaign.",
    },
    {
      question: "Can I edit messages?",
      answer:
        "Yes. Every outreach subject and body can be edited before send. You stay in control of tone, offers, and personalization.",
    },
    {
      question: "Can I use my own templates?",
      answer:
        "Yes. Message Creation supports using your own templates, letting AI write the message, or combining AI personalization with your template.",
    },
    {
      question: "Can I manually update missing email addresses?",
      answer:
        "Yes. Many local businesses do not publish a clear public email. You can add a verified email from the website, social profiles, or Google Business Profile to make a prospect Campaign Ready.",
    },
    {
      question: "Does Prospect AI work with Gmail?",
      answer:
        "Yes. Connect Gmail (or Google Workspace) in Channel Settings to send campaign email and keep outreach in your own mailbox.",
    },
    {
      question: "Does Prospect AI work with WhatsApp?",
      answer:
        "Prospect AI outreach campaigns send email. When conversations continue—or you already use WhatsApp for sales—replies and WhatsApp chats live in the same Unified Inbox and WhatsApp CRM workspace.",
    },
    {
      question: "What happens when a business replies?",
      answer:
        "The reply opens in your Unified Inbox. You can continue with AI Copilot, assign teammates, and mark the prospect Won when they become a customer.",
    },
  ],

  relatedLinks: cluster(
    "localServiceSolution",
    "aiBrain",
    "campaigns",
    "unifiedInbox",
    "aiLeadScoring",
    "whatsappCrm",
    "automations",
    "realtorGrowth",
    "pricing",
    "userGuide",
  ),

  finalCta: {
    headline: "Put an AI sales team on local business lead generation",
    subtext: "Start your free trial and run your first discovery in minutes.",
  },
} as const;

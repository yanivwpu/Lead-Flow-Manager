import {
  PARTNER_COMMISSION_POLICY_TEXT,
  PARTNER_DEFAULT_COMMISSION_RATE,
} from "@/lib/partnerProgram";

export const PARTNER_PROGRAM_META = {
  title: "WhachatCRM Partner Program | Earn Recurring Revenue with AI Messaging CRM",
  description:
    "Partner with WhachatCRM and earn recurring commissions helping ecommerce, service businesses, support teams, and real estate professionals connect WhatsApp, AI Copilot, and automation workflows.",
  slug: "partner-program",
} as const;

export const PARTNER_HERO = {
  headline: "Help clients automate conversations—and grow recurring revenue",
  subheadline:
    "WhachatCRM is a multi-industry AI messaging platform built for agencies, consultants, and resellers who onboard clients and earn every month they stay subscribed.",
  bullets: [
    "Deploy WhatsApp, Messenger, and Instagram automations for clients",
    "Earn 30% lifetime recurring commission on paid subscriptions",
    "Serve ecommerce, service businesses, support teams, and real estate",
    "0% markup on Meta messaging fees",
  ],
} as const;

export const PARTNER_SOLUTIONS_SECTION = {
  title: "One platform. Multiple revenue opportunities.",
  intro:
    "Package onboarding, AI, and automation into the services your agency already sells—then grow predictable monthly income as clients scale on WhachatCRM.",
} as const;

export const PARTNER_INDUSTRY_SECTION = {
  title: "Solutions you can deploy for clients",
  intro:
    "Show prospects real product workflows—not slide decks. Onboard faster, deliver outcomes, and expand into new verticals from one platform.",
} as const;

export const PARTNER_MODELS = [
  {
    id: "referral",
    title: "Referral Partner",
    audience: "Consultants, creators, freelancers, agents, and business advisors.",
    benefits: [
      "Share WhachatCRM with your network",
      "Earn 30% lifetime recurring commission",
      "No technical setup required",
      "Track referrals and conversions",
    ],
  },
  {
    id: "agency",
    title: "Agency Partner",
    audience: "Marketing agencies, CRM consultants, automation experts, and web agencies.",
    benefits: [
      "Offer WhatsApp, Messenger, Instagram, and AI automation services",
      "Help clients onboard and configure workflows",
      "Earn recurring commissions",
      "Optional paid setup services",
    ],
  },
  {
    id: "real-estate",
    title: "Real Estate Partner",
    audience: "Real estate coaches, brokerages, IDX/MLS consultants, and proptech advisors.",
    benefits: [
      "Promote AI lead qualification",
      "MLS property matching",
      "Agent Pages",
      "Realtor Growth Engine",
      "Follow-up automation",
    ],
  },
  {
    id: "shopify",
    title: "Shopify / Ecommerce Partner",
    audience: "Shopify experts, ecommerce consultants, and digital agencies.",
    benefits: [
      "Free Abandoned Cart Recovery templates",
      "Free Customer Retention and AI chatbot templates",
      "WhatsApp follow-up and support inbox",
      "AI Copilot for product and order questions",
      "One-click template install for merchants",
    ],
  },
] as const;

export const PARTNER_WHY_BENEFITS = [
  `${PARTNER_DEFAULT_COMMISSION_RATE.replace(".00", "")}% lifetime recurring commission`,
  "Fast-growing AI messaging category",
  "WhatsApp + Messenger + Instagram unified inbox",
  "Free Abandoned Cart Recovery, Free Customer Retention Templates, Free AI Chatbot, and AI-powered follow-up sequences.",
  "AI Copilot and lead scoring",
  "0% markup on Meta messaging fees — your customers pay Meta directly at Meta's standard pricing.",
  "Real estate CRM with MLS integration (one of many supported verticals)",
  "Partner support and enablement resources",
] as const;

export const PARTNER_INDUSTRY_SHOWCASES = [
  {
    id: "embedded-signup",
    title: "Embedded WhatsApp signup",
    intro:
      "Official Meta Embedded Signup lets partners connect client WhatsApp Business Accounts in minutes without complicated setup.",
    bullets: [
      "Guided business verification inside WhachatCRM",
      "No manual API tokens for standard client onboarding",
      "Faster time-to-live on the Cloud API",
    ],
    screenshotKey: "embeddedSignupMeta" as const,
    screenshotTitle: "Meta embedded signup for Business",
    caption:
      "Official Meta onboarding connects your client's WhatsApp Business Account to WhachatCRM in minutes.",
    imageOnLeft: false,
  },
  {
    id: "shopify",
    title: "Shopify & ecommerce",
    intro:
      "Launch revenue-driving automations on day one with free templates your clients can customize and deploy immediately.",
    bullets: [
      "Free Abandoned Cart Recovery sequences",
      "Customer retention and limited-time offer templates",
      "Unified inbox for support and marketing in one thread",
    ],
    screenshotKey: "automationTemplateCards" as const,
    screenshotTitle: "Preset ecommerce automation templates",
    caption:
      "Abandoned Cart Recovery, Lead Nurture, and Limited-Time Offers — free preset templates for Shopify merchants.",
    imageOnLeft: true,
  },
  {
    id: "real-estate",
    title: "Real estate (one of many verticals)",
    intro:
      "Offer AI lead qualification, MLS property matching, and follow-up automation when your clients need a real estate workflow.",
    bullets: [
      "AI scores buyers and sellers from live conversations",
      "MLS-backed listing recommendations in the inbox",
      "Agent Pages and Growth Engine presets included",
    ],
    screenshotKey: "propertyMatchDetails" as const,
    screenshotTitle: "MLS property matching",
    caption:
      "AI explains why a listing matches buyer preferences — one supported vertical among many.",
    imageOnLeft: false,
  },
] as const;

export const PARTNER_PRODUCT_LINES = [
  { label: "Unified Inbox", href: "/unified-inbox" },
  { label: "WhatsApp Business API onboarding", href: "/whatsapp-business-api" },
  { label: "AI Copilot", href: "/ai-lead-scoring" },
  { label: "Automation Templates", href: "/automation-templates" },
  { label: "Shopify CRM", href: "/shopify-crm" },
  { label: "Real Estate CRM", href: "/real-estate-crm" },
  { label: "MLS Integration", href: "/crm-with-mls-integration" },
  { label: "Agent Pages", href: "/real-estate-crm" },
  { label: "Growth Engine / RGE", href: "/realtor-growth-engine" },
  { label: "WhatsApp CRM", href: "/whatsapp-crm" },
] as const;

export const PARTNER_STEPS = [
  {
    step: 1,
    title: "Apply",
    description: "Tell us about your business, audience, or client base.",
  },
  {
    step: 2,
    title: "Get approved",
    description: "We review fit and assign the right partner model.",
  },
  {
    step: 3,
    title: "Refer, onboard, and earn",
    description: "Send leads, help clients activate, and earn recurring commissions on paid subscriptions.",
  },
] as const;

export const PARTNER_TYPES = [
  "Referral Partner",
  "Agency Partner",
  "Real Estate Partner",
  "Shopify / Ecommerce Partner",
  "Other",
] as const;

export const PARTNER_FAQS = [
  {
    question: "Who can become a WhachatCRM partner?",
    answer:
      "Consultants, agencies, creators, real estate coaches, Shopify experts, automation specialists, and advisors who help businesses improve customer conversations. If your audience needs WhatsApp CRM, AI automation, or omnichannel inbox software, you are likely a fit.",
  },
  {
    question: "How much commission do partners earn?",
    answer: `Approved affiliate partners earn ${PARTNER_DEFAULT_COMMISSION_RATE.replace(".00", "")}% recurring commission on qualifying base subscription revenue. ${PARTNER_COMMISSION_POLICY_TEXT}`,
  },
  {
    question: "Is the commission really lifetime?",
    answer:
      "Yes — for approved affiliate partners, commissions continue for the lifetime of the customer while their paid subscription remains active, subject to our partner agreement terms.",
  },
  {
    question: "Do partners need technical experience?",
    answer:
      "Referral partners can start with no technical setup. Agency and implementation partners benefit from experience configuring WhatsApp, automations, or CRM workflows — but WhachatCRM includes guided onboarding and preset templates.",
  },
  {
    question: "Can agencies charge clients setup fees?",
    answer:
      "Yes. Many agency partners offer paid onboarding, workflow design, template customization, and ongoing managed services in addition to WhachatCRM commissions.",
  },
  {
    question: "Does WhachatCRM mark up Meta messaging fees?",
    answer:
      "No. WhachatCRM adds 0% markup on Meta messaging fees — your customers pay Meta directly at Meta's standard pricing.",
  },
  {
    question: "Can real estate consultants partner with WhachatCRM?",
    answer:
      "Absolutely. Real estate coaches, brokerages, and proptech advisors can promote AI lead qualification, MLS property matching, Agent Pages, and Realtor Growth Engine automations.",
  },
  {
    question: "Can Shopify experts partner with WhachatCRM?",
    answer:
      "Yes. Shopify consultants and ecommerce agencies can promote abandoned cart recovery, order follow-up automations, AI support, and the unified inbox for customer conversations.",
  },
  {
    question: "How are referrals tracked?",
    answer:
      "Approved partners receive a unique referral link and dashboard in the Partner Portal. First-touch attribution assigns referred signups to your partner account.",
  },
  {
    question: "When are commissions paid?",
    answer:
      "Commissions are tracked in your partner dashboard as customers subscribe and renew. Payout timing and methods are defined in your partner agreement after approval.",
  },
  {
    question: "Do you offer partner support?",
    answer:
      "Yes. Approved partners get enablement resources, product guidance, and partner support to help you position WhachatCRM and onboard clients successfully.",
  },
  {
    question: "Can partners use WhachatCRM for their own business?",
    answer:
      "Yes. Many partners run their own client communications in WhachatCRM while referring other businesses. You can start on the Free plan and upgrade as needed.",
  },
] as const;

export const PARTNER_RELATED_LINKS = [
  { label: "WhatsApp CRM", href: "/whatsapp-crm" },
  { label: "WhatsApp Business API", href: "/whatsapp-business-api" },
  { label: "Unified Inbox", href: "/unified-inbox" },
  { label: "Shopify CRM", href: "/shopify-crm" },
  { label: "Real Estate CRM", href: "/real-estate-crm" },
  { label: "MLS Integration", href: "/crm-with-mls-integration" },
  { label: "Automation Templates", href: "/automation-templates" },
  { label: "AI Lead Scoring", href: "/ai-lead-scoring" },
  { label: "Pricing", href: "/pricing" },
] as const;

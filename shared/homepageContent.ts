/**
 * Public Homepage (Welcome) content model — English base.
 * Brand / product / channel names stay as approved; descriptive copy is localizable.
 */

export type HomepageDiscoveryCard = {
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  href: string;
};

export type HomepageAiCard = {
  title: string;
  body: string;
  cta: string;
  href: string;
};

export type HomepageStaticShell = {
  trustPill: string;
  navProduct: string;
  navSolutions: string;
  navResources: string;
  navPricing: string;
  navLogin: string;
  navStartTrial: string;
  homeAria: string;
  primaryNavAria: string;
  h1: string;
  subtitle: string;
  channels: string;
  ctaTrial: string;
  ctaPricing: string;
  ctaDemo: string;
  noCreditCard: string;
  heroImageAlt: string;
  exploreNavAria: string;
};

export type HomepageContent = {
  seo: {
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    twitterTitle: string;
    twitterDescription: string;
  };
  heroImageAlt: string;
  discovery: {
    sectionAria: string;
    findProspects: HomepageDiscoveryCard;
    convertConversations: HomepageDiscoveryCard;
  };
  aiPlatform: {
    eyebrow: string;
    title: string;
    subtitle: string;
    prospectAi: HomepageAiCard;
    aiBrain: HomepageAiCard;
    aiCopilot: HomepageAiCard;
  };
  eyebrows: {
    businessOutcomes: string;
    integrations: string;
    setup: string;
    useCases: string;
  };
  integrationsCta: string;
  chromeA11y: {
    primaryNav: string;
    siteNav: string;
    openMenu: string;
    closeMenu: string;
    homeAria: string;
  };
  ssr: {
    h1: string;
    lead: string;
    channels: string;
    productLine: string;
    exploreHeading: string;
    pricingLabel: string;
    startTrialLabel: string;
    findProspectsTitle: string;
    findProspectsBody: string;
    findProspectsCta: string;
    convertTitle: string;
    convertBody: string;
    convertLinks: {
      inbox: string;
      automations: string;
      chatbot: string;
      copilot: string;
    };
    aiSectionTitle: string;
    aiBrainTitle: string;
    aiBrainBody: string;
    aiBrainCta: string;
    aiCopilotTitle: string;
    aiCopilotBody: string;
    aiCopilotCta: string;
    siteNavHeading: string;
    footerCopyright: string;
    footerPrivacy: string;
    footerTerms: string;
  };
  staticShell: HomepageStaticShell;
};

export const HOMEPAGE_CONTENT_EN: HomepageContent = {
  seo: {
    title: "WhatsApp & Unified Mailbox | WhachatCRM",
    description:
      "Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers.",
    ogTitle: "WhatsApp & Unified Mailbox | WhachatCRM",
    ogDescription:
      "Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers.",
    twitterTitle: "WhatsApp & Unified Mailbox | WhachatCRM",
    twitterDescription:
      "Manage WhatsApp, Instagram, and SMS in one unified mailbox. The simple CRM for SMBs and Shopify sellers.",
  },
  heroImageAlt: "WhachatCRM WhatsApp conversation mockup with AI Copilot and lead score",
  discovery: {
    sectionAria: "Choose how you want to grow",
    findProspects: {
      eyebrow: "Find prospects",
      title: "Find and qualify the right businesses",
      body: "Use Prospect AI to discover local opportunities, score fit, and start personalized outreach.",
      cta: "Explore Prospect AI",
      href: "/prospect-ai",
    },
    convertConversations: {
      eyebrow: "Convert conversations",
      title: "Manage and convert every conversation",
      body: "Bring channels into Unified Inbox, use AI Copilot in-thread, and automate follow-up with templates.",
      cta: "Explore Unified Inbox",
      href: "/unified-inbox",
    },
  },
  aiPlatform: {
    eyebrow: "AI Sales Team",
    title: "AI that finds opportunities and guides every next step",
    subtitle:
      "Prospect AI discovers who to sell to. AI Brain personalizes strategy and powers AI features across WhachatCRM. AI Copilot helps your team respond inside live conversations.",
    prospectAi: {
      title: "Prospect AI",
      body: "Find and qualify local businesses, launch personalized outreach, and manage replies in one CRM.",
      cta: "Explore Prospect AI",
      href: "/prospect-ai",
    },
    aiBrain: {
      title: "AI Brain",
      body: "Analyzes business knowledge, helps create personalized campaigns, recommends strategy, and powers AI features across the platform where enabled.",
      cta: "Explore AI Brain",
      href: "/ai-brain",
    },
    aiCopilot: {
      title: "AI Copilot",
      body: "Assists inside customer conversations with summaries, suggested replies, and lead context so your team moves faster without losing quality.",
      cta: "Explore AI Copilot",
      href: "/ai-copilot",
    },
  },
  eyebrows: {
    businessOutcomes: "Business outcomes",
    integrations: "Integrations",
    setup: "Setup",
    useCases: "Use cases",
  },
  integrationsCta: "Explore all integrations",
  chromeA11y: {
    primaryNav: "Primary",
    siteNav: "Site",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    homeAria: "WhachatCRM home",
  },
  ssr: {
    h1: "Meet Your AI Sales Team",
    lead:
      "WhachatCRM helps businesses find and qualify prospects, manage conversations across channels, personalize the next action with AI, automate follow-up, and convert more chats into revenue.",
    channels: "Official Meta API · WhatsApp, Instagram, Facebook, SMS, Telegram, Email and more",
    productLine: "Prospect AI · AI Brain · AI Copilot · Unified Inbox · Growth Engines",
    exploreHeading: "Explore WhachatCRM",
    pricingLabel: "Pricing",
    startTrialLabel: "Start Free Trial",
    findProspectsTitle: "Find and qualify prospects",
    findProspectsBody:
      "Use Prospect AI to discover local businesses, qualify fit, and launch personalized outreach — then manage replies in Unified Inbox.",
    findProspectsCta: "Explore Prospect AI",
    convertTitle: "Manage and convert conversations",
    convertBody:
      "Bring WhatsApp and supported channels into one Unified Inbox. Use AI Copilot in-thread and automate follow-up with templates and chatbots.",
    convertLinks: {
      inbox: "Unified Inbox",
      automations: "Workflows & Automations",
      chatbot: "Chatbot Builder",
      copilot: "AI Copilot",
    },
    aiSectionTitle: "AI Brain and AI Copilot",
    aiBrainTitle: "AI Brain",
    aiBrainBody:
      "Analyzes business knowledge, helps create personalized campaigns, recommends strategy, and powers AI features across the platform where enabled.",
    aiBrainCta: "Explore AI Brain",
    aiCopilotTitle: "AI Copilot",
    aiCopilotBody:
      "Assists inside customer conversations with summaries, suggested replies, and lead context.",
    aiCopilotCta: "Explore AI Copilot",
    siteNavHeading: "Site navigation",
    footerCopyright: "© 2025 WhachatCRM. All rights reserved.",
    footerPrivacy: "Privacy",
    footerTerms: "Terms",
  },
  staticShell: {
    trustPill: "AI-powered sales & messaging for growing teams",
    navProduct: "Product",
    navSolutions: "Solutions",
    navResources: "Resources",
    navPricing: "Pricing",
    navLogin: "Log in",
    navStartTrial: "Start Free Trial",
    homeAria: "WhachatCRM home",
    primaryNavAria: "Primary",
    h1: "Meet Your AI Sales Team",
    subtitle:
      "WhachatCRM helps businesses find and qualify prospects, manage conversations across channels, personalize the next action with AI, automate follow-up, and convert more chats into revenue.",
    channels: "Official Meta API · WhatsApp, Instagram, Facebook, SMS, Telegram, Email and more",
    ctaTrial: "Start Free Trial →",
    ctaPricing: "Pricing",
    ctaDemo: "Book a Demo",
    noCreditCard: "No credit card required",
    heroImageAlt: "WhachatCRM WhatsApp conversation mockup with AI Copilot and lead score",
    exploreNavAria: "Explore WhachatCRM",
  },
};

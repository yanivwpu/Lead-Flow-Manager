/** SEO + on-page copy for /go-high-level-agencies — preserve wording when editing layout only. */

export const GHL_AGENCIES_SLUG = "go-high-level-agencies";

export const GHL_AGENCIES_META = {
  title: "GoHighLevel Agency Partner | WhachatCRM Messaging & AI for GHL",
  description:
    "Extend GoHighLevel with AI-powered WhatsApp Business API, Messenger, Instagram, Shopify CRM, and omnichannel inboxes. Built for agencies—no CRM migration required.",
  keywords:
    "GoHighLevel agency, GHL partner, GoHighLevel WhatsApp, GoHighLevel messaging, agency CRM extension, omnichannel for GoHighLevel",
};

export const GHL_HERO = {
  h1: "Grow Your GoHighLevel Agency Beyond Funnels and Automations",
  subheading:
    "Give your clients AI-powered conversations, WhatsApp Business API, Facebook Messenger, Instagram, Shopify CRM, and industry-specific solutions—all seamlessly integrated with GoHighLevel.",
  body: "Instead of competing with GoHighLevel, WhachatCRM extends it by helping agencies deliver smarter customer communication, better client experiences, and new recurring revenue opportunities.",
  trustStatements: [
    "Works alongside GoHighLevel",
    "No CRM migration",
    "Built for agencies",
  ] as const,
};

export const GHL_WHY_MORE_THAN_CRM = {
  heading: "Why GoHighLevel Agencies Need More Than a CRM",
  paragraphs: [
    "Today's clients expect more than email campaigns and sales pipelines.",
    "They expect to communicate with businesses through WhatsApp, Facebook Messenger, Instagram, live chat, and other messaging channels they already use every day. They expect quick responses, personalized conversations, and seamless experiences across every touchpoint.",
    "GoHighLevel provides an excellent foundation for managing leads, automations, and customer relationships. But as messaging becomes the preferred way customers interact with businesses, agencies need additional tools that help clients manage those conversations efficiently.",
    "That's where WhachatCRM comes in.",
    "Rather than replacing GoHighLevel, WhachatCRM extends it with AI-powered messaging, omnichannel conversations, collaborative inboxes, and industry-specific workflows that help your clients communicate faster and convert more leads.",
  ] as const,
  quote: {
    line1: "GoHighLevel manages the customer journey.",
    line2: "WhachatCRM powers the conversations that move customers through it.",
  },
};

export const GHL_WHY_AGENCIES = {
  heading: "Why Agencies Choose WhachatCRM",
  cards: [
    {
      title: "Win More Clients",
      description:
        "Differentiate your agency by offering services that many GoHighLevel agencies don't provide, including AI-powered messaging, WhatsApp Business API, and omnichannel communication.",
    },
    {
      title: "Increase Client Retention",
      description:
        "Clients who rely on messaging every day become more engaged with your services and are less likely to switch providers.",
    },
    {
      title: "Create New Revenue Opportunities",
      description:
        "Package WhachatCRM into premium service plans, offer implementation services, or refer clients directly through our Partner Program to earn recurring commissions.",
    },
    {
      title: "Deliver More Value Without More Complexity",
      description:
        "WhachatCRM integrates alongside your existing GoHighLevel workflows, allowing your team and your clients to continue using familiar processes while gaining powerful new communication capabilities.",
    },
  ] as const,
};

/** FAQ copy will be added in a future section; schema renders when items exist. */
export const GHL_FAQ_ITEMS: readonly { question: string; answer: string }[] = [];

export const GHL_FUTURE_SECTIONS = [
  { id: "everything-your-clients-can-offer", title: "Everything Your Clients Can Offer" },
  { id: "industry-solutions", title: "Industry Solutions" },
  { id: "how-it-works-with-gohighlevel", title: "How It Works With GoHighLevel" },
  { id: "ways-agencies-make-money", title: "Ways Agencies Make Money" },
  { id: "faq", title: "FAQ" },
  { id: "final-cta", title: "Final CTA" },
] as const;

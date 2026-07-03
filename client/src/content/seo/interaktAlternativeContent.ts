export const INTERAKT_ALT_META = {
  title: "Interakt Alternative: Omnichannel WhatsApp CRM Comparison | WhachatCRM",
  description:
    "Compare Interakt vs WhachatCRM for WhatsApp CRM. Balanced overview of strengths, limitations, omnichannel inbox, AI, pricing transparency, and who each platform fits best.",
  keywords:
    "Interakt alternative, Interakt vs WhachatCRM, WhatsApp CRM comparison, omnichannel CRM, Interakt competitor",
  h1: "Interakt Alternative: A Balanced Comparison for WhatsApp CRM Teams",
} as const;

export const INTERAKT_BEST_FOR = [
  "WhatsApp-first businesses in India and adjacent markets with campaign-heavy use cases",
  "Teams that want established WhatsApp marketing and broadcast tooling",
  "Brands already standardized on Interakt workflows and Meta template operations",
  "Operators comfortable navigating tiered plans and add-on packaging",
] as const;

export const INTERAKT_STRENGTHS = [
  {
    title: "WhatsApp marketing maturity",
    description:
      "Interakt is widely used for WhatsApp campaigns, catalog-style flows, and template operations familiar to growth teams in its core markets.",
  },
  {
    title: "Chatbot and automation",
    description:
      "Visual bot builders and drip-style sequences help teams automate common qualification and nurture paths on WhatsApp.",
  },
  {
    title: "Team inbox",
    description:
      "Shared access and assignment features support multiple agents on business WhatsApp numbers.",
  },
  {
    title: "Market presence",
    description:
      "A large installed base means agencies and freelancers may already know Interakt's interface and onboarding patterns.",
  },
] as const;

export const INTERAKT_LIMITATIONS = [
  {
    title: "Pricing complexity",
    description:
      "Plans, add-ons, and per-feature packaging can make total cost harder to forecast as teams scale users or message volume.",
  },
  {
    title: "WhatsApp-centric positioning",
    description:
      "Teams that receive equal volume on Instagram, Messenger, and SMS may need additional tools or higher tiers for true omnichannel coverage.",
  },
  {
    title: "Markup transparency",
    description:
      "Evaluate how Meta conversation fees are passed through — some platforms add margin on top of Meta's published rates.",
  },
  {
    title: "Heavier onboarding for SMBs",
    description:
      "Smaller teams sometimes report a learning curve when configuring bots, templates, and billing across modules.",
  },
] as const;

export const OMNICHANNEL_FIT_SIGNALS = [
  "Customers routinely message on Instagram and Messenger — not only WhatsApp",
  "You want one inbox per contact across WhatsApp, SMS, and web chat",
  "Support and sales share the same number set and need unified history",
  "You prefer predictable subscription pricing with clear Meta fee pass-through",
  "You need preset ecommerce or industry templates without building every flow from scratch",
] as const;

export type CompareCell = "yes" | "partial" | "no" | string;

export interface FeatureCompareRow {
  feature: string;
  whachat: CompareCell;
  interakt: CompareCell;
}

export const FEATURE_COMPARISON: FeatureCompareRow[] = [
  { feature: "Free plan", whachat: "yes", interakt: "no" },
  { feature: "WhatsApp Business API", whachat: "yes", interakt: "yes" },
  { feature: "Omnichannel inbox (Messenger, Instagram, SMS)", whachat: "yes", interakt: "partial" },
  { feature: "Visual chatbot / automation builder", whachat: "yes", interakt: "yes" },
  { feature: "Preset automation templates", whachat: "yes", interakt: "partial" },
  { feature: "AI Copilot / lead scoring", whachat: "yes", interakt: "partial" },
  { feature: "Shared team inbox", whachat: "yes", interakt: "yes" },
  { feature: "Shopify-oriented workflows", whachat: "yes", interakt: "partial" },
  { feature: "0% markup on Meta messaging fees", whachat: "yes", interakt: "partial" },
  { feature: "Starting subscription (typical SMB)", whachat: "$19/mo", interakt: "Higher tiers common" },
  { feature: "Unlimited users on top plan", whachat: "$49/mo Pro", interakt: "Plan-dependent" },
];

export const FAQ_ITEMS = [
  {
    question: "What is the best Interakt alternative?",
    answer:
      "The best Interakt alternative depends on your channels and budget. If you need omnichannel inbox, AI assistance, preset templates, and transparent Meta pricing, WhachatCRM is built for SMBs comparing Interakt, WATI, and Respond.io. If you only need WhatsApp campaigns in a single market, staying on Interakt may still fit.",
  },
  {
    question: "Who is Interakt best for?",
    answer:
      "Interakt is often a strong fit for WhatsApp-first marketing teams — especially in India — that run broadcast campaigns, chatbots, and template-heavy flows and are comfortable with tiered SaaS packaging.",
  },
  {
    question: "When is an omnichannel CRM a better fit than Interakt?",
    answer:
      "Consider an omnichannel CRM when customers contact you on Instagram, Messenger, and SMS as often as WhatsApp, when support and sales need one shared timeline per contact, or when you want bundled AI and templates without stitching multiple tools together.",
  },
  {
    question: "Does WhachatCRM cost less than Interakt?",
    answer:
      "WhachatCRM offers a free plan and paid plans from $19/month, with Pro at $49/month including unlimited users. Interakt pricing varies by tier and add-ons — compare total cost including Meta conversation fees for your message volume.",
  },
  {
    question: "Can I migrate from Interakt to WhachatCRM?",
    answer:
      "You can connect your WhatsApp number through Meta embedded signup on WhachatCRM, rebuild or import key templates, and parallel-run during a transition. Export contacts and document automation logic from Interakt before switching.",
  },
  {
    question: "Does WhachatCRM support WhatsApp chatbots?",
    answer:
      "Yes. WhachatCRM includes a visual chatbot builder and preset Growth Engine templates for nurture, support routing, and ecommerce recovery flows.",
  },
  {
    question: "How does Meta pricing compare?",
    answer:
      "WhachatCRM does not mark up Meta messaging fees. Verify how Interakt passes through Meta conversation charges when modeling total cost at scale.",
  },
  {
    question: "Which platform is better for Shopify merchants?",
    answer:
      "Shopify brands often need abandoned cart recovery and order-context support in chat. WhachatCRM includes Shopify CRM workflows and ecommerce templates; evaluate Interakt's Shopify depth against your checkout and support requirements.",
  },
] as const;

export const RELATED_LINKS = [
  { href: "/wati-alternative", label: "WATI Alternative" },
  { href: "/respond-io-alternative", label: "Respond.io Alternative" },
  { href: "/best-whatsapp-crm-2026", label: "Best WhatsApp CRM 2026" },
  { href: "/whatsapp-crm", label: "WhatsApp CRM guide" },
  { href: "/unified-inbox", label: "Unified Inbox" },
  { href: "/pricing", label: "Pricing" },
] as const;

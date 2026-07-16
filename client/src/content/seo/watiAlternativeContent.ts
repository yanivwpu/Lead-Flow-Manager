import {
  CHECK_PACKAGING,
  DEFAULT_FREE_VS_PAID,
  DEFAULT_MIGRATION_STEPS,
  NOT_CLEARLY_DISCLOSED,
  VARIES_BY_PLAN,
  relatedLinksExcluding,
  sharedComparisonFaqs,
  withCompetitorMatrix,
  type CompetitorAlternativeContent,
} from "./comparisonShared";

const SLUG = "/wati-alternative";

export const watiAlternativeContent: CompetitorAlternativeContent = {
  slug: SLUG,
  competitorName: "WATI",
  meta: {
    title: "WATI Alternative 2026: WhatsApp CRM vs Omnichannel Inbox | WhachatCRM",
    description:
      "Honest WATI vs WhachatCRM comparison: team inbox maturity vs broader channels, Email, Starter+ chatbot/templates, unlimited Pro users, and 0% WhachatCRM Meta markup.",
    keywords:
      "WATI alternative, WATI vs WhachatCRM, WATI competitor, WhatsApp CRM comparison, WATI pricing alternative, omnichannel WhatsApp inbox",
    h1: "WATI Alternative: WhatsApp Ops Maturity vs Omnichannel CRM Simplicity",
  },
  heroEyebrow: "WATI Alternative · Updated for 2026",
  heroLead:
    "WATI is a proven WhatsApp operations platform with strong shared-inbox and broadcast workflows. WhachatCRM targets SMBs that want Meta Embedded Signup, WhatsApp beside Email and Meta social channels, and predictable seat economics on Pro — without rebuilding around a WhatsApp-only console.",
  quickSummary:
    "Stay on WATI when your team already runs mature WhatsApp campaigns, template ops, and agent playbooks on their stack. Consider WhachatCRM when you need a Unified Inbox across WhatsApp, Messenger, Instagram, and Gmail; Starter+ chatbot and preset templates (not on Free); unlimited users on Pro; Shopify and GoHighLevel on Starter+; and Meta conversation fees passed through without WhachatCRM markup. Confirm current WATI packaging on their site before modeling total cost.",
  whoFor: [
    "SMBs outgrowing WATI seat packs or channel limits and exploring omnichannel inbox options",
    "Support leads who want Email beside WhatsApp without a separate mailbox",
    "Teams that need Free → Starter ($19) → Pro ($49) pricing they can forecast as headcount grows",
    "Operators comparing WhatsApp BSP maturity against a self-serve CRM workspace",
    "Buyers who want balanced trade-offs — not a one-sided feature checklist",
  ],
  competitorGoodWhen: [
    "WhatsApp broadcast, template, and agent workflows are already standardized on WATI",
    "Your team has WATI-certified partners or internal ops trained on their console",
    "Primary growth motion is WhatsApp volume — not Email, Instagram DMs, or CRM outreach in one timeline",
    "You have budget for tiered packaging and dedicated WhatsApp operations staff",
  ],
  competitorStrengths: [
    {
      title: "WhatsApp operations depth",
      description:
        "WATI is widely adopted for business WhatsApp: shared inbox, approved templates, broadcasts, and agent tooling that agencies and support teams already know how to run.",
    },
    {
      title: "Team inbox and routing maturity",
      description:
        "Assignment, collision handling, and WhatsApp-specific agent workflows are core to the product — helpful when WhatsApp is your primary revenue channel.",
    },
    {
      title: "Established BSP ecosystem",
      description:
        "A large installed base means freelancers, agencies, and support partners may already be fluent in WATI deployment and template strategy.",
    },
  ],
  competitorLimitations: [
    {
      title: "Packaging and seat economics",
      description:
        "Growth features and additional agents often map to higher tiers. Total cost can climb with seats, volume, and add-ons — harder for SMBs to forecast than flat Pro unlimited users.",
    },
    {
      title: "Omnichannel and Email breadth",
      description:
        "Teams that split time across Instagram, Messenger, Gmail, and Shopify context may need more than a WhatsApp-centric operations hub.",
    },
    {
      title: "Console weight for small teams",
      description:
        "Powerful WhatsApp suites can feel heavy when you mainly need inbox + CRM + a few automations, not a full broadcast operations center.",
    },
  ],
  whachatBetterWhen: [
    "You want Meta Embedded Signup and WhatsApp Cloud API onboarding without a long BSP implementation project",
    "You need one Unified Inbox across WhatsApp, Messenger, Instagram, Email (Gmail), and web chat",
    "You want chatbot, Flow Builder, and preset automation templates on Starter+ — Free is for inbox validation only",
    "You need unlimited users on Pro so sales, support, and marketing share one workspace without seat packs",
    "Shopify orders/customers in inbox context or GoHighLevel LeadConnector sync matter on Starter+",
    "You want 0% WhachatCRM markup on Meta conversation fees with clear Free / $19 / $49 plans",
  ],
  advantages: [
    {
      title: "Email and social beside WhatsApp",
      description:
        "WhachatCRM connects Gmail OAuth, Messenger, and Instagram Messaging without forcing a channel upgrade — useful when WATI-centric workflows leave Email in a separate tool.",
    },
    {
      title: "Pro unlimited seats for growing teams",
      description:
        "Pro ($49/mo) includes unlimited team members. Starter covers up to 3 users; Free is single-user — a simpler seat model than stacking agent licenses as headcount grows.",
    },
  ],
  matrix: withCompetitorMatrix({
    "WhatsApp included": "yes",
    "Facebook Messenger included": "partial",
    "Instagram Messaging included": "partial",
    "Email inbox included (Gmail OAuth)": "no",
    "Web chat widget": "partial",
    "Channels without per-channel upsell": "partial",
    "Meta Embedded Signup / Cloud API onboarding": "yes",
    "Twilio required for WhatsApp": "no",
    "Unified multi-channel inbox": "partial",
    "CRM / contact management": "partial",
    "Team collaboration / shared inbox": "yes",
    "Chatbot / flow builder": "yes",
    "Ready-made automation templates": "yes",
    "Workflow builder": "yes",
    "AI Assist / Copilot": "partial",
    "AI Brain (optional add-on)": NOT_CLEARLY_DISCLOSED,
    "Shopify integration (orders/customers → inbox)": "partial",
    "GoHighLevel integration": NOT_CLEARLY_DISCLOSED,
    "Calendly booking integration": "partial",
    "Realtor Growth Engine": "no",
    "Conversation / template analytics": "yes",
    "Included users": VARIES_BY_PLAN,
    "Unlimited users on Pro": "no",
    "Additional seat charges on Pro": "yes",
    "Free plan available": "no",
    "Entry-level paid pricing": CHECK_PACKAGING,
    "Pro subscription": CHECK_PACKAGING,
    "Cost predictability as team grows": "partial",
    "Platform per-message markup on Meta": NOT_CLEARLY_DISCLOSED,
    "Meta fees passed through without WhachatCRM markup": "partial",
    "Technical skill required": "Low–medium",
    "Best fit": "WhatsApp-heavy support & broadcast teams",
    "Migration assistance": "partial",
  }),
  migrationSteps: DEFAULT_MIGRATION_STEPS,
  pricingNotes: {
    competitorSummary:
      "WATI is typically sold on tiered paid plans with packaging that scales by agents, features, and message volume. Philosophy: WhatsApp operations platform with broadcast and team inbox depth. Confirm current plan names, seat limits, and Meta fee handling on WATI's official pricing page before purchasing — we do not quote live monthly totals here.",
    whachatSummary:
      "WhachatCRM: Free forever to start (1 user, no chatbot/templates), Starter $19/mo (up to 3 users, chatbot + templates + Integrations), Pro $49/mo with unlimited users. No WhachatCRM per-message markup on Meta WhatsApp conversation fees.",
  },
  freeVsPaid: DEFAULT_FREE_VS_PAID,
  faqs: [
    ...sharedComparisonFaqs("WATI"),
    {
      question: "Is WhachatCRM cheaper than WATI for a growing team?",
      answer:
        "It depends on your WATI tier, agent count, and volume. Many SMBs save on seat economics with unlimited Pro users ($49/mo) and fewer channel upsells. Model Meta conversation fees separately on both sides and verify current WATI packaging on their site.",
    },
    {
      question: "Can I keep my WhatsApp number when switching from WATI?",
      answer:
        "Usually yes, but you must complete a proper Meta Cloud API cutover via Embedded Signup and avoid overlapping providers on the same number. Plan a short parallel-run and confirm approved template status before full cutover.",
    },
    {
      question: "Does WhachatCRM replace WATI broadcast workflows?",
      answer:
        "WhachatCRM covers template messaging, workflow automations, and chatbot flows on Starter+. If you rely on very large WATI-specific broadcast operations, validate volume and template workflows during a Free or Starter trial before switching.",
    },
    {
      question: "Who wins for a 5-person support team?",
      answer:
        "Teams already deep in WATI with trained agents may stay until a migration window makes sense. A 5-person team that needs Email, social DMs, and unlimited Pro seats without buying extra agents often fits WhachatCRM better — chatbot and templates require Starter or Pro, not Free.",
    },
  ],
  recommendation:
    "Keep WATI if WhatsApp broadcast maturity and existing WATI playbooks are your competitive advantage. Switch to WhachatCRM when you need Meta Embedded Signup, a Unified Inbox with Email and social channels, Starter+ chatbot/templates, unlimited Pro users, Shopify/GHL on Starter+, and transparent Meta fee pass-through — with a self-serve SMB workspace instead of a WhatsApp-only ops console.",
  relatedLinks: relatedLinksExcluding(SLUG),
};

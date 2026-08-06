import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Check,
  MessageSquare,
  Radar,
  Sparkles,
  Workflow,
  Inbox,
} from "lucide-react";
import { AI_BRAIN_ADDON_PRICE_USD } from "@shared/pricingEntitlements";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "@shared/prospectAI";
import { PROSPECT_AI_PATH } from "@/lib/prospectAi";
import { trackPricingEvent } from "@/lib/ga4Events";

export function PricingHeroChips() {
  const chips = [
    { id: "prospect-ai", label: "Prospect AI" },
    { id: "inbox", label: "Unified Inbox" },
    { id: "chatbot", label: "Chatbot & Automations" },
    { id: "copilot", label: "AI Copilot" },
  ];
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid={`chip-capability-${chip.id}`}
          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-900"
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

export function TransparentPricingStrip() {
  const points = [
    "No pricing based on active contacts",
    "No extra seat fees on Pro",
    "0% WhachatCRM markup on Meta conversation fees",
    "Prospect AI included in every plan",
    "Upgrade only when your usage grows",
  ];
  return (
    <section
      className="mb-10 rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm"
      data-testid="section-transparent-pricing"
    >
      <h2 className="text-center text-lg font-display font-bold text-gray-900 sm:text-xl">
        Transparent pricing without the usual surprises
      </h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-gray-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProspectAiCallout({ loggedIn }: { loggedIn: boolean }) {
  const href = loggedIn
    ? PROSPECT_AI_PATH
    : `/auth?redirect=${encodeURIComponent(PROSPECT_AI_PATH)}`;
  return (
    <section
      className="mb-12 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-6 sm:px-8"
      data-testid="section-prospect-ai-callout"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">New</p>
      <h2 className="mt-1 text-xl font-display font-bold text-gray-900 sm:text-2xl">
        Prospect AI is included in every plan
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-700">
        Discover businesses, qualify the best opportunities, and create outreach campaigns from the
        same platform where replies are managed.
      </p>
      <ul className="mt-4 flex flex-wrap gap-3 text-sm font-medium text-gray-800">
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Free: {PROSPECT_AI_MONTHLY_QUOTAS.free}/month
        </li>
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Starter: {PROSPECT_AI_MONTHLY_QUOTAS.starter}/month
        </li>
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Pro: {PROSPECT_AI_MONTHLY_QUOTAS.pro}/month
        </li>
      </ul>
      <Link href={href}>
        <Button
          className="mt-5 bg-brand-green hover:bg-emerald-700"
          data-testid="button-explore-prospect-ai"
          onClick={() => trackPricingEvent("prospect_ai_learn_more_click")}
        >
          Explore Prospect AI
        </Button>
      </Link>
    </section>
  );
}

export function CoreCapabilitiesSection() {
  const cards = [
    {
      icon: Radar,
      title: "Prospect AI",
      body: "Find and qualify businesses and prepare targeted outreach.",
    },
    {
      icon: Inbox,
      title: "Unified Inbox",
      body: "Manage Email, WhatsApp, Facebook, Instagram, SMS, and other connected channels from one place.",
    },
    {
      icon: Workflow,
      title: "Chatbot & Automations",
      body: "Capture leads, ask qualification questions, route conversations, and trigger follow-ups.",
    },
    {
      icon: MessageSquare,
      title: "AI Copilot",
      body: "Understand conversations, draft replies, and see recommended next actions.",
    },
    {
      icon: Brain,
      title: "AI Brain",
      body: "Teach the platform about your business and power advanced intelligence across the workspace.",
    },
  ];
  return (
    <section className="mb-12" data-testid="section-capabilities">
      <h2 className="mb-6 text-center text-2xl font-display font-bold text-gray-900">
        What you can do with WhachatCRM
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <card.icon className="h-5 w-5 text-brand-green" />
            <h3 className="mt-3 text-sm font-semibold text-gray-900">{card.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{card.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WhyChooseSection() {
  const points = [
    {
      title: "No active-contact pricing",
      body: "Your bill does not increase just because more contacts exist in your CRM.",
    },
    {
      title: "Pro includes unlimited users",
      body: "Collaborate without buying additional seats on the Pro plan.",
    },
    {
      title: "0% WhachatCRM markup on Meta fees",
      body: "Meta’s own conversation charges may still apply.",
    },
    {
      title: "Prospecting and conversations together",
      body: "Prospect AI finds opportunities, while the Unified Inbox manages replies and follow-up.",
    },
    {
      title: "Chatbot and automation on paid plans",
      body: "Starter and Pro include Chatbot & Website Widget plus workflow automations—no separate chatbot subscription required.",
    },
  ];
  return (
    <section className="mb-12" data-testid="section-why-choose">
      <h2 className="mb-6 text-center text-2xl font-display font-bold text-gray-900">
        Why businesses choose WhachatCRM
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        {points.map((point) => (
          <div key={point.title} className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">{point.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{point.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AiBrainSpotlight({
  onAdd,
  ctaLabel,
  disabled,
  loading,
}: {
  onAdd: () => void;
  ctaLabel: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <section
      className="mb-12 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-5 py-7 sm:px-8"
      data-testid="section-ai-brain"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-purple-700">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Add-on</span>
          </div>
          <h2 className="mt-2 text-2xl font-display font-bold text-gray-900">
            Supercharge WhachatCRM with AI Brain
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Add AI Brain to Starter or Pro for +${AI_BRAIN_ADDON_PRICE_USD}/month. Requires an
            eligible paid plan.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              "Learns your services, policies, and business information",
              "Uses connected Offers & Payment Links",
              "Improves Prospect AI personalization",
              "Powers smarter Copilot recommendations",
              "Helps draft accurate, context-aware replies",
              "Coordinates Knowledge Sources and Live Business Data",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-gray-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            Chatbot captures leads and runs configured flows. AI Brain adds company knowledge,
            advanced personalization, and intelligent assistance across the workspace.
          </p>
        </div>
        <div className="shrink-0 text-center lg:text-end">
          <p className="text-3xl font-bold text-gray-900">+${AI_BRAIN_ADDON_PRICE_USD}</p>
          <p className="text-sm text-gray-500">/month add-on</p>
          <Button
            className="mt-4 bg-purple-600 hover:bg-purple-700"
            disabled={disabled || loading}
            onClick={() => {
              trackPricingEvent("ai_brain_addon_click");
              onAdd();
            }}
            data-testid="button-ai-brain-spotlight"
          >
            {ctaLabel}
          </Button>
        </div>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "What is Prospect AI?",
    a: "Prospect AI helps you discover local businesses, review AI qualification, build outreach campaigns, and manage replies in the Unified Inbox. Monthly discovery quotas apply by plan.",
  },
  {
    q: "How many Prospect AI discoveries are included?",
    a: `Free includes ${PROSPECT_AI_MONTHLY_QUOTAS.free}/month, Starter ${PROSPECT_AI_MONTHLY_QUOTAS.starter}/month, and Pro ${PROSPECT_AI_MONTHLY_QUOTAS.pro}/month. Only newly created Prospect AI records count toward the quota.`,
  },
  {
    q: "Is the chatbot included?",
    a: "Chatbot & Website Widget is included on Starter and Pro. Free does not include the visual chatbot builder. The chatbot captures leads and runs configured conversation flows; AI Brain is optional for deeper company knowledge.",
  },
  {
    q: "What is the difference between AI Assist and AI Brain?",
    a: `AI Assist is included on paid plans with fair use (AI Assist Basic on Starter; AI Assist Enhanced on Pro). AI Brain is a $${AI_BRAIN_ADDON_PRICE_USD}/month add-on that adds business knowledge and advanced intelligence across the platform.`,
  },
  {
    q: "Do you charge by active contact?",
    a: "No. Plan limits are based on active conversations and other included usage—not how many contacts are stored in your CRM.",
  },
  {
    q: "Do you charge extra for team members?",
    a: "Starter includes up to 3 users. Pro includes unlimited users with no extra seat fees on Pro.",
  },
  {
    q: "Do you add a markup to Meta messaging fees?",
    a: "WhachatCRM applies 0% markup on Meta conversation fees. Meta’s own charges may still apply according to Meta’s pricing.",
  },
  {
    q: "Can I upgrade, downgrade, or cancel?",
    a: "Yes. You can change plans as your usage grows. Cancel anytime according to your billing provider (Stripe or Shopify).",
  },
];

export function PricingFaqSection() {
  return (
    <section className="mb-12 max-w-3xl mx-auto" data-testid="section-faq">
      <h2 className="mb-6 text-center text-2xl font-display font-bold text-gray-900">
        Common questions
      </h2>
      <div className="space-y-3">
        {FAQ_ITEMS.map((item, idx) => (
          <details
            key={item.q}
            className="group rounded-xl border border-gray-200 bg-white p-4"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                trackPricingEvent("pricing_faq_open", { question_index: idx });
              }
            }}
          >
            <summary className="cursor-pointer list-none font-semibold text-gray-900">
              {item.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export const COMPARE_FEATURE_LABELS: Record<string, string> = {
  activeConversations: "Active conversations",
  users: "Users",
  whatsappNumbers: "WhatsApp numbers",
  unifiedInbox: "Unified Inbox",
  supportedChannels: "Supported messaging channels",
  prospectDiscoveries: "Monthly Prospect AI discoveries",
  prospectReview: "AI Review / qualification workspace",
  prospectCampaigns: "Campaign builder",
  messageCreation: "Message Creation modes",
  prospectArchive: "Archive / Restore",
  chatbotWidget: "Chatbot & website widget",
  workflowAutomation: "Visual workflow automation",
  followUps: "Follow-ups",
  aiBrainAddon: "AI Brain add-on",
  assignment: "Assignment / collaboration",
  integrations: "Integrations",
  growthEngines: "Growth Engines",
};

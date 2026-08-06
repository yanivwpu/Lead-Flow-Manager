import { useState } from "react";
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
  Bot,
  Globe2,
} from "lucide-react";
import { AI_BRAIN_ADDON_PRICE_USD } from "@shared/pricingEntitlements";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "@shared/prospectAI";
import { PROSPECT_AI_PATH } from "@/lib/prospectAi";
import { trackPricingEvent } from "@/lib/ga4Events";
import { BookDemoModal } from "@/components/BookDemoModal";

export function PricingHeroChips() {
  const chips = [
    { id: "prospect-ai", label: "Prospect AI" },
    { id: "inbox", label: "Unified Inbox" },
    { id: "chatbot", label: "AI Chatbot" },
    { id: "workflows", label: "Workflow Automation" },
    { id: "copilot", label: "AI Copilot" },
  ];
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2" data-testid="section-hero-chips">
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-testid={`chip-capability-${chip.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-900"
        >
          <Check className="h-3 w-3 text-brand-green" aria-hidden />
          {chip.label}
        </span>
      ))}
    </div>
  );
}

type ChannelItem = { id: string; label: string; logoSrc: string; logoBgClass?: string };

const MESSAGING_CHANNELS: ChannelItem[] = [
  { id: "whatsapp", label: "WhatsApp Business", logoSrc: "/logos/whatsapp.svg", logoBgClass: "bg-emerald-500" },
  { id: "facebook", label: "Facebook Messenger", logoSrc: "/logos/facebook.svg", logoBgClass: "bg-blue-600" },
  { id: "instagram", label: "Instagram", logoSrc: "/logos/instagram.svg", logoBgClass: "bg-pink-600" },
  { id: "gmail", label: "Gmail", logoSrc: "/logos/gmail.svg", logoBgClass: "bg-white" },
  { id: "telegram", label: "Telegram", logoSrc: "/logos/telegram.svg", logoBgClass: "bg-sky-500" },
  { id: "webchat", label: "Website Chat", logoSrc: "/logos/whatsapp.svg", logoBgClass: "bg-emerald-100" },
  { id: "sms", label: "SMS", logoSrc: "/logos/sms.svg", logoBgClass: "bg-gray-100" },
];

const LEAD_SOURCES: ChannelItem[] = [
  { id: "tiktok", label: "TikTok Lead Forms", logoSrc: "/logos/tiktok.svg", logoBgClass: "bg-black" },
  { id: "website-forms", label: "Website Forms", logoSrc: "/logos/gmail.svg", logoBgClass: "bg-white" },
];

function ChannelIcon({ item }: { item: ChannelItem }) {
  return (
    <li
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-gray-800"
      data-testid={`channel-${item.id}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md ${item.logoBgClass || "bg-gray-100"}`}
      >
        {item.id === "webchat" ? (
          <Globe2 className="h-4 w-4 text-emerald-700" aria-hidden />
        ) : item.id === "website-forms" ? (
          <Bot className="h-4 w-4 text-gray-700" aria-hidden />
        ) : (
          <img src={item.logoSrc} alt="" className="h-4 w-4 object-contain" />
        )}
      </span>
      {item.label}
    </li>
  );
}

export function SupportedChannelsSection() {
  return (
    <section className="mb-8" data-testid="section-supported-channels">
      <h2 className="mb-4 text-center text-lg font-display font-bold text-gray-900 sm:text-xl">
        Works with your customer channels
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Messaging
          </p>
          <ul className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-1 md:grid-cols-2">
            {MESSAGING_CHANNELS.map((item) => (
              <ChannelIcon key={item.id} item={item} />
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Lead Sources
          </p>
          <ul className="grid gap-2">
            {LEAD_SOURCES.map((item) => (
              <ChannelIcon key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function TransparentPricingStrip() {
  const points = [
    "No active-contact pricing",
    "0% WhachatCRM markup on Meta conversation fees",
    "Upgrade only as your business grows",
  ];
  return (
    <section
      className="mb-8 rounded-2xl border border-gray-200 bg-white px-5 py-5 shadow-sm"
      data-testid="section-transparent-pricing"
    >
      <h2 className="text-center text-lg font-display font-bold text-gray-900 sm:text-xl">
        Transparent Pricing
      </h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
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
      className="mb-10 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-6 sm:px-8"
      data-testid="section-prospect-ai-callout"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">NEW</p>
      <h2 className="mt-1 text-xl font-display font-bold text-gray-900 sm:text-2xl">
        Prospect AI included with every plan
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-700">
        Discover businesses, qualify opportunities and launch outreach campaigns without leaving
        WhachatCRM.
      </p>
      <ul className="mt-4 flex flex-wrap gap-3 text-sm font-medium text-gray-800">
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Free: {PROSPECT_AI_MONTHLY_QUOTAS.free} discoveries
        </li>
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Starter: {PROSPECT_AI_MONTHLY_QUOTAS.starter}
        </li>
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Pro: {PROSPECT_AI_MONTHLY_QUOTAS.pro}
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
      body: "Find businesses, qualify opportunities, and launch outreach from one workspace.",
    },
    {
      icon: Inbox,
      title: "Unified Inbox",
      body: "Reply across WhatsApp, Messenger, Instagram, Gmail, Telegram, SMS, and Website Chat.",
    },
    {
      icon: Workflow,
      title: "Chatbot & Automations",
      body: "Capture and qualify leads with Chatbot & Website Widget, then automate follow-ups.",
    },
    {
      icon: MessageSquare,
      title: "AI Copilot",
      body: "Draft replies, understand conversations, and see recommended next actions.",
    },
    {
      icon: Brain,
      title: "AI Brain",
      body: "Teach WhachatCRM your business so Copilot, Prospect AI, and replies get smarter.",
    },
  ];
  return (
    <section className="mb-10" data-testid="section-capabilities">
      <h2 className="mb-5 text-center text-2xl font-display font-bold text-gray-900">
        What you can do
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <card.icon className="h-5 w-5 text-brand-green" />
            <h3 className="mt-2.5 text-sm font-semibold text-gray-900">{card.title}</h3>
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
      title: "Find, engage, and convert",
      body: "Prospect AI finds opportunities. Unified Inbox and automations help you close more sales.",
    },
    {
      title: "No active-contact pricing",
      body: "Your bill does not rise just because more contacts exist in your CRM.",
    },
    {
      title: "0% WhachatCRM markup on Meta fees",
      body: "Meta’s own conversation charges may still apply.",
    },
    {
      title: "Chatbot on Starter and Pro",
      body: "Chatbot captures and qualifies leads. AI Brain makes conversations smarter.",
    },
  ];
  return (
    <section className="mb-10" data-testid="section-why-choose">
      <h2 className="mb-5 text-center text-2xl font-display font-bold text-gray-900">
        Why businesses choose WhachatCRM
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
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
      className="mb-10 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white px-5 py-7 sm:px-8"
      data-testid="section-ai-brain"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-purple-700">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Add-on</span>
          </div>
          <h2 className="mt-2 text-2xl font-display font-bold text-gray-900">
            AI Brain enhances the whole platform
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Add AI Brain to Starter or Pro for +${AI_BRAIN_ADDON_PRICE_USD}/month. It enhances the
            platform with business knowledge—not a standalone base plan.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              "Learns your business",
              "Uses company knowledge",
              "Connects Offers & Payment Links",
              "Improves Prospect AI personalization",
              "Smarter AI Copilot",
              "Better recommendations",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2 text-sm text-gray-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            Chatbot captures and qualifies leads. AI Brain makes conversations smarter with your
            business context.
          </p>
        </div>
        <div className="shrink-0 text-center lg:text-end">
          <p className="text-3xl font-bold text-gray-900">+${AI_BRAIN_ADDON_PRICE_USD}</p>
          <p className="text-sm text-gray-500">/month add-on</p>
          <Button
            className="mt-4 bg-purple-600 hover:bg-purple-700"
            disabled={disabled || loading}
            onClick={() => {
              trackPricingEvent("ai_brain_learn_more_click");
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
    a: "Prospect AI helps you discover businesses, qualify opportunities, and launch outreach campaigns without leaving WhachatCRM. Monthly discovery quotas apply by plan.",
  },
  {
    q: "Is Chatbot included?",
    a: "Chatbot & Website Widget is included on Starter and Pro. Free does not include the visual chatbot builder. Chatbot captures and qualifies leads; AI Brain makes conversations smarter with your business knowledge.",
  },
  {
    q: "What is AI Brain?",
    a: `AI Brain is a $${AI_BRAIN_ADDON_PRICE_USD}/month add-on for Starter or Pro. It learns your business, uses company knowledge and Offers & Payment Links, improves Prospect AI personalization, and powers a smarter AI Copilot across the platform.`,
  },
  {
    q: "Do you charge by active contacts?",
    a: "No. Plan limits are based on active conversations and other included usage—not how many contacts are stored in your CRM.",
  },
  {
    q: "Do you add markup to Meta fees?",
    a: "WhachatCRM applies 0% markup on Meta conversation fees. Meta’s own charges may still apply according to Meta’s pricing.",
  },
  {
    q: "Can I upgrade anytime?",
    a: "Yes. Upgrade as your business grows. You can change plans according to your billing provider (Stripe or Shopify).",
  },
];

export function PricingFaqSection() {
  return (
    <section className="mb-10 max-w-3xl mx-auto" data-testid="section-faq">
      <h2 className="mb-5 text-center text-2xl font-display font-bold text-gray-900">
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

export function PricingBottomCta({
  onStartFree,
}: {
  onStartFree: () => void;
}) {
  const [showDemoModal, setShowDemoModal] = useState(false);
  return (
    <div
      className="rounded-2xl bg-gray-900 p-8 text-center text-white md:p-10"
      data-testid="section-final-cta"
    >
      <h2 className="mb-3 font-display text-2xl font-bold md:text-3xl">
        Start finding customers before you pay
      </h2>
      <p className="mx-auto mb-7 max-w-2xl text-gray-400">
        Get 50 Prospect AI discoveries every month on Free.
      </p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          className="h-12 rounded-full bg-brand-green px-8 font-semibold text-white hover:bg-emerald-700"
          onClick={() => {
            trackPricingEvent("pricing_plan_cta_click", { plan: "free", source: "bottom_cta" });
            onStartFree();
          }}
          data-testid="button-cta-start-free"
        >
          Start Free
        </Button>
        <Button
          variant="outline"
          className="h-12 rounded-full border-gray-700 px-8 text-gray-300 hover:bg-gray-800"
          onClick={() => {
            trackPricingEvent("pricing_book_demo_click");
            setShowDemoModal(true);
          }}
          data-testid="button-cta-book-demo"
        >
          Book Demo
        </Button>
      </div>
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
    </div>
  );
}

export const COMPARE_FEATURE_LABELS: Record<string, string> = {
  activeConversations: "Active conversations",
  users: "Users",
  whatsappNumbers: "WhatsApp Business accounts",
  unifiedInbox: "Unified Inbox",
  supportedChannels: "Supported messaging channels",
  prospectDiscoveries: "Monthly Prospect AI discoveries",
  prospectReview: "AI Review / qualification",
  prospectCampaigns: "Campaign builder",
  messageCreation: "Message Creation modes",
  prospectArchive: "Archive / Restore",
  chatbotWidget: "Chatbot & Website Widget",
  workflowAutomation: "Workflow Automation",
  followUps: "Follow-ups",
  aiBrainAddon: "AI Brain add-on",
  assignment: "Assignment / collaboration",
  integrations: "Integrations",
  growthEngines: "Growth Engines",
};

export const COMPARE_GROUP_LABELS: Record<string, string> = {
  MESSAGING: "Messaging",
  "PROSPECT AI": "Prospect AI",
  CHATBOT: "Chatbot",
  AUTOMATION: "Automation",
  AI: "AI",
  TEAM: "Team",
  SUPPORT: "Support",
};

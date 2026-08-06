import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Check,
  FileText,
  Globe2,
  Inbox,
  MessageSquare,
  Radar,
  Workflow,
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

type ChannelItem =
  | { id: string; label: string; logoSrc: string }
  | { id: string; label: string; icon: "webchat" | "sms" | "forms" };

const MESSAGING_CHANNELS: ChannelItem[] = [
  { id: "whatsapp", label: "WhatsApp Business", logoSrc: "/logos/whatsapp.svg" },
  { id: "facebook", label: "Facebook Messenger", logoSrc: "/logos/facebook.svg" },
  { id: "instagram", label: "Instagram", logoSrc: "/logos/instagram.svg" },
  { id: "gmail", label: "Gmail", logoSrc: "/logos/gmail.svg" },
  { id: "telegram", label: "Telegram", logoSrc: "/logos/telegram.svg" },
  { id: "webchat", label: "Website Chat", icon: "webchat" },
  { id: "sms", label: "SMS", icon: "sms" },
];

const LEAD_SOURCES: ChannelItem[] = [
  { id: "tiktok", label: "TikTok Lead Forms", logoSrc: "/logos/tiktok.svg" },
  { id: "website-forms", label: "Website Forms", icon: "forms" },
];

/** Official logo shapes forced to one monochrome weight (no brand colors). */
function MonoOfficialLogo({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className="h-3.5 w-3.5 object-contain brightness-0 opacity-70"
      data-mono-logo="true"
    />
  );
}

function ChannelGlyph({ item }: { item: ChannelItem }) {
  if ("icon" in item) {
    const Icon =
      item.icon === "webchat" ? Globe2 : item.icon === "sms" ? MessageSquare : FileText;
    return <Icon className="h-3.5 w-3.5 text-gray-700" strokeWidth={1.75} aria-hidden />;
  }
  return <MonoOfficialLogo src={item.logoSrc} />;
}

function ChannelPill({ item }: { item: ChannelItem }) {
  return (
    <li
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
      data-testid={`channel-${item.id}`}
    >
      <ChannelGlyph item={item} />
      {item.label}
    </li>
  );
}

export function SupportedChannelsSection() {
  return (
    <section className="mb-5 sm:mb-7" data-testid="section-supported-channels">
      <h2 className="mb-2.5 text-center text-lg font-display font-bold text-gray-900 sm:mb-3 sm:text-xl">
        Works with your customer channels
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-8">
        <div>
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:text-start">
            Messaging
          </p>
          <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {MESSAGING_CHANNELS.map((item) => (
              <ChannelPill key={item.id} item={item} />
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:text-start">
            Lead Sources
          </p>
          <ul className="flex flex-wrap justify-center gap-2 sm:justify-start">
            {LEAD_SOURCES.map((item) => (
              <ChannelPill key={item.id} item={item} />
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
      className="mb-6 rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:mb-8 sm:px-5 sm:py-5"
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
      className="mb-6 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-5 sm:mb-8 sm:px-8 sm:py-6"
      data-testid="section-prospect-ai-callout"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">NEW</p>
      <h2 className="mt-1 text-xl font-display font-bold text-gray-900 sm:text-2xl">
        Prospect AI Included — Free with Every Plan
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-700">
        Find local businesses, qualify opportunities with AI, and launch personalized outreach
        campaigns—all without leaving WhachatCRM.
      </p>
      <ul className="mt-4 flex flex-wrap gap-3 text-sm font-medium text-gray-800">
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Free: {PROSPECT_AI_MONTHLY_QUOTAS.free}
        </li>
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Starter: {PROSPECT_AI_MONTHLY_QUOTAS.starter}
        </li>
        <li className="rounded-lg bg-white/80 px-3 py-1.5 ring-1 ring-emerald-100">
          Pro: {PROSPECT_AI_MONTHLY_QUOTAS.pro}
        </li>
      </ul>
      <p className="mt-2 text-xs text-gray-500">Monthly Prospect AI discoveries by plan</p>
      <Link href={href}>
        <Button
          className="mt-4 bg-brand-green hover:bg-emerald-700"
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
      title: "Multi-channel Inbox",
      body: "Reply across WhatsApp, Messenger, Instagram, Gmail, Telegram, SMS, and Website Chat.",
    },
    {
      icon: Workflow,
      title: "AI Chatbot & Automations",
      body: "Capture, qualify, and respond to website visitors—then automate follow-ups.",
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
      title: "FREE Prospect AI",
      body: "Discover and qualify local businesses on every plan—including Free.",
    },
    {
      title: "No Active Contact Pricing",
      body: "Your bill does not rise just because more contacts exist in your CRM.",
    },
    {
      title: "0% WhachatCRM markup on Meta conversation fees",
      body: "You only pay Meta’s published WhatsApp conversation rates.",
    },
    {
      title: "Unified Inbox for messaging and email",
      body: "Manage WhatsApp, Messenger, Instagram, Gmail, and more in one place.",
    },
    {
      title: "AI Chatbot & Workflow Automation",
      body: "Capture, qualify, and follow up automatically on Starter and Pro.",
    },
  ];
  return (
    <section className="mb-8" data-testid="section-why-choose">
      <h2 className="mb-4 text-center text-2xl font-display font-bold text-gray-900">
        Why businesses switch to WhachatCRM
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((point) => (
          <div key={point.title} className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="flex items-start gap-2 text-sm font-semibold text-gray-900">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
              <span>{point.title}</span>
            </h3>
            <p className="mt-1 pl-6 text-sm text-gray-600">{point.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "Can I try Pro and AI Brain before upgrading?",
    a: "Every new account receives a full-featured 14-day Pro + AI Brain trial. No feature restrictions during the trial.",
  },
  {
    q: "What is Prospect AI?",
    a: "Prospect AI helps you find local businesses, qualify opportunities with AI, and launch personalized outreach campaigns without leaving WhachatCRM. Monthly discovery quotas apply by plan.",
  },
  {
    q: "Is Chatbot included?",
    a: "AI Chatbot & Website Widget is included on Starter and Pro. Free does not include the visual chatbot builder. Chatbot captures, qualifies, and responds to website visitors; AI Brain is an optional add-on that makes conversations smarter.",
  },
  {
    q: "What is AI Brain?",
    a: `AI Brain is an optional $${AI_BRAIN_ADDON_PRICE_USD}/month add-on for Starter or Pro—not a base plan. It learns your business, uses company knowledge and Offers & Payment Links, improves Prospect AI personalization, and powers a smarter AI Copilot.`,
  },
  {
    q: "What counts as an active conversation?",
    a: "A conversation counts once when a customer actively messages you during the billing period. Multiple messages within that conversation do not create additional conversations.",
  },
  {
    q: "What are Meta conversation fees?",
    a: "Meta determines WhatsApp conversation pricing. WhachatCRM adds 0% markup. Customers only pay Meta’s published rates.",
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
  unifiedInbox: "Multi-channel Inbox",
  supportedChannels: "Supported messaging channels",
  prospectDiscoveries: "Monthly Prospect AI Discoveries",
  prospectReview: "AI Review / qualification",
  prospectCampaigns: "Campaign builder",
  messageCreation: "Message Creation modes",
  prospectArchive: "Archive / Restore",
  chatbotWidget: "AI Chatbot & Website Widget",
  workflowAutomation: "Workflow Automation",
  followUps: "Follow-ups",
  aiBrainAddon: "AI Brain add-on",
  assignment: "Assignment / collaboration",
  integrations: "Integrations",
  growthEngines: "Growth Engines",
};

/** Helper / tooltip copy for comparison rows (internal + title attributes). */
export const COMPARE_FEATURE_HINTS: Record<string, string> = {
  growthEngines: "Required platform plan to activate compatible Growth Engines.",
};

export const COMPARE_GROUP_LABELS: Record<string, string> = {
  MESSAGING: "Messaging",
  "PROSPECT AI": "Prospect AI",
  CHATBOT: "Chatbot",
  AUTOMATION: "Automation",
  AI: "AI",
  TEAM: "Team",
  SUPPORT: "Support",
  "GROWTH ENGINES": "Growth Engines",
};

/** Consistent trial messaging for public pricing surfaces. */
export const FULL_PRO_AI_TRIAL_COPY =
  "Every new account includes a full 14-day Pro + AI Brain trial.";

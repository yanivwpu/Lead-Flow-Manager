import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Check,
  Inbox,
  MessageSquare,
  Radar,
  Workflow,
} from "lucide-react";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "@shared/prospectAI";
import { PROSPECT_AI_PATH } from "@/lib/prospectAi";
import { trackPricingEvent } from "@/lib/ga4Events";
import { BookDemoModal } from "@/components/BookDemoModal";
import { renderRtlAwareHeadingText } from "@/components/marketing/RtlAwareHeadingText";
import {
  getLocalizedPricingPage,
  type PricingPageContent,
} from "@shared/localizeMarketingContent";
import { localizedInternalHref } from "@shared/localeRoutes";
import { FULL_PRO_AI_TRIAL_COPY as FULL_PRO_AI_TRIAL_COPY_EN } from "@shared/pricingPageContent";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";

/** Kept for entitlement/regression tests that assert English string presence. */
export const FULL_PRO_AI_TRIAL_COPY = FULL_PRO_AI_TRIAL_COPY_EN;

export const COMPARE_FEATURE_LABELS = FULL_PRO_AI_TRIAL_COPY_EN
  ? getLocalizedPricingPage("en").compareLabels
  : {};
export const COMPARE_FEATURE_HINTS = getLocalizedPricingPage("en").compareHints;
export const COMPARE_GROUP_LABELS = getLocalizedPricingPage("en").compareGroups;

function usePricingContent(): PricingPageContent {
  const locale = useMarketingUrlLocale();
  return getLocalizedPricingPage(locale);
}

function useMarketingLocale() {
  return useMarketingUrlLocale();
}

export function TransparentPricingStrip() {
  const content = usePricingContent();
  return (
    <section
      className="mx-auto mb-4 max-w-3xl rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-3.5"
      data-testid="section-transparent-pricing"
    >
      <h2 className="text-center text-base font-display font-bold text-gray-900 sm:text-lg">
        {content.transparent.title}
      </h2>
      <ul className="mx-auto mt-3 flex w-fit max-w-full flex-col items-start gap-2.5 sm:flex-row sm:items-start sm:justify-center sm:gap-x-10">
        {content.transparent.points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-gray-700">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green" aria-hidden />
            <span className="leading-snug whitespace-nowrap sm:whitespace-normal sm:max-w-[12rem]">
              {point}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProspectAiCallout({ loggedIn }: { loggedIn: boolean }) {
  const content = usePricingContent();
  const locale = useMarketingLocale();
  const href = loggedIn
    ? PROSPECT_AI_PATH
    : localizedInternalHref("/prospect-ai", locale);
  const prospectAiTitle =
    locale === "he"
      ? renderRtlAwareHeadingText(content.prospectAi.title)
      : content.prospectAi.title;
  return (
    <section
      className="mb-6 overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-white to-gray-50 px-4 py-6 sm:mb-8 sm:px-8 sm:py-8"
      data-testid="section-prospect-ai-callout"
    >
      <div className="mx-auto max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {content.prospectAi.badge}
        </p>
        <h2 className="mt-1.5 font-display text-xl font-bold text-gray-900 sm:text-2xl">
          {prospectAiTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-600">
          {content.prospectAi.body}
        </p>
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-sm font-medium text-gray-800">
          <li className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
            Free: {PROSPECT_AI_MONTHLY_QUOTAS.free}
          </li>
          <li className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
            Starter: {PROSPECT_AI_MONTHLY_QUOTAS.starter}
          </li>
          <li className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
            Pro: {PROSPECT_AI_MONTHLY_QUOTAS.pro}
          </li>
        </ul>
        <p className="mt-2 text-xs text-gray-500">{content.prospectAi.quotaNote}</p>
        <Link href={href}>
          <Button
            className="mt-4 bg-brand-green hover:bg-emerald-700"
            data-testid="button-explore-prospect-ai"
            onClick={() => trackPricingEvent("prospect_ai_learn_more_click")}
          >
            {content.prospectAi.cta}
          </Button>
        </Link>
      </div>
    </section>
  );
}

const CAPABILITY_ICONS = {
  "prospect-ai": Radar,
  inbox: Inbox,
  chatbot: Workflow,
  copilot: MessageSquare,
  brain: Brain,
} as const;

export function CoreCapabilitiesSection() {
  const content = usePricingContent();
  return (
    <section className="mb-10" data-testid="section-capabilities">
      <h2 className="mb-5 text-center text-2xl font-display font-bold text-gray-900">
        {content.capabilities.title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {content.capabilities.cards.map((card) => {
          const Icon =
            CAPABILITY_ICONS[(card.id || "") as keyof typeof CAPABILITY_ICONS] || Radar;
          return (
            <div
              key={card.title}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <Icon className="h-5 w-5 text-brand-green" />
              <h3 className="mt-2.5 text-sm font-semibold text-gray-900">{card.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{card.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function WhyChooseSection() {
  const content = usePricingContent();
  return (
    <section className="mb-8" data-testid="section-why-choose">
      <h2 className="mb-4 text-center text-2xl font-display font-bold text-gray-900">
        {content.whyChoose.title}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {content.whyChoose.cards.map((point) => (
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

export function PricingFaqSection() {
  const content = usePricingContent();
  return (
    <section className="mb-10 max-w-3xl mx-auto" data-testid="section-faq">
      <h2 className="mb-5 text-center text-2xl font-display font-bold text-gray-900">
        {content.faq.title}
      </h2>
      <div className="space-y-3">
        {content.faq.items.map((item, idx) => (
          <details
            key={item.q}
            className="group rounded-xl border border-gray-200 bg-white p-4"
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                trackPricingEvent("pricing_faq_open", { question_index: idx });
              }
            }}
          >
            <summary className="cursor-pointer list-none font-semibold text-gray-900 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 text-start">{item.q}</span>
              <span
                className="shrink-0 text-gray-400 transition-transform group-open:rotate-180 ms-auto"
                aria-hidden
              >
                ▾
              </span>
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
  const content = usePricingContent();
  const [showDemoModal, setShowDemoModal] = useState(false);
  return (
    <div
      className="rounded-2xl bg-gray-900 p-8 text-center text-white md:p-10"
      data-testid="section-final-cta"
    >
      <h2 className="mb-3 font-display text-2xl font-bold md:text-3xl">
        {content.bottomCta.title}
      </h2>
      <p className="mx-auto mb-7 max-w-2xl text-gray-400">{content.bottomCta.subtitle}</p>
      <div className="flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          className="h-12 rounded-full bg-brand-green px-8 font-semibold text-white hover:bg-emerald-700"
          onClick={() => {
            trackPricingEvent("pricing_plan_cta_click", { plan: "free", source: "bottom_cta" });
            onStartFree();
          }}
          data-testid="button-cta-start-free"
        >
          {content.bottomCta.startFree}
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
          {content.bottomCta.bookDemo}
        </Button>
      </div>
      <BookDemoModal isOpen={showDemoModal} onClose={() => setShowDemoModal(false)} />
    </div>
  );
}

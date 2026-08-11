import { Link } from "wouter";
import { ArrowRight, Brain, MessageSquareText, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { getLocalizedHomepage } from "@shared/localizeMarketingContent";
import { needsHebrewAiBidiLayout } from "@shared/rtlLeadingLtrIsolate";
import { renderRtlAwareHeadingText } from "@/components/marketing/RtlAwareHeadingText";
import { useLocalizedHref, useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";

/**
 * Homepage Hebrew AI copy: keep stored order, isolate standalone Latin "AI"
 * so bidi does not push it to the wrong visual end under dir=rtl.
 */
function renderHomepageHebrewAiCopy(text: string): ReactNode {
  if (needsHebrewAiBidiLayout(text)) {
    return renderRtlAwareHeadingText(text);
  }
  const trailingAi = text.match(/^(.*?)(\s+)(AI)$/u);
  if (trailingAi) {
    return (
      <>
        {trailingAi[1]}
        {trailingAi[2]}
        <bdi dir="ltr">AI</bdi>
      </>
    );
  }
  return text;
}

/**
 * Homepage AI Sales Team cards — link to dedicated Product pages.
 * Stable IDs retained for deep links: #ai-platform, #ai-brain, #ai-copilot
 */
export default function WelcomeAiPlatformSection() {
  const locale = useMarketingUrlLocale();
  const content = getLocalizedHomepage(locale).aiPlatform;
  const prospectHref = useLocalizedHref(content.prospectAi.href);
  const brainHref = useLocalizedHref(content.aiBrain.href);
  const copilotHref = useLocalizedHref(content.aiCopilot.href);
  const eyebrow = locale === "he" ? renderHomepageHebrewAiCopy(content.eyebrow) : content.eyebrow;
  const title = locale === "he" ? renderHomepageHebrewAiCopy(content.title) : content.title;

  return (
    <section
      id="ai-platform"
      className="scroll-mt-24 px-4 md:px-6 py-16 md:py-20 bg-white"
      aria-labelledby="ai-platform-heading"
    >
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">
            {eyebrow}
          </p>
          <h2
            id="ai-platform-heading"
            className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4"
          >
            {title}
          </h2>
          <p className="text-base md:text-lg text-gray-600">{content.subtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <article className="rounded-[1.5rem] bg-gray-50 p-6 ring-1 ring-gray-100">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-brand-green">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-gray-950 mb-2">{content.prospectAi.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">{content.prospectAi.body}</p>
            <Link
              href={prospectHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded"
            >
              {content.prospectAi.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>

          <article
            id="ai-brain"
            className="scroll-mt-24 rounded-[1.5rem] bg-gray-50 p-6 ring-1 ring-gray-100"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <Brain className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-gray-950 mb-2">{content.aiBrain.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">{content.aiBrain.body}</p>
            <Link
              href={brainHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded"
            >
              {content.aiBrain.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>

          <article
            id="ai-copilot"
            className="scroll-mt-24 rounded-[1.5rem] bg-gray-50 p-6 ring-1 ring-gray-100"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <MessageSquareText className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-gray-950 mb-2">{content.aiCopilot.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">{content.aiCopilot.body}</p>
            <Link
              href={copilotHref}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded"
            >
              {content.aiCopilot.cta}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

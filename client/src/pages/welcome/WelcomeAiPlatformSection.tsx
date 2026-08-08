import { Link } from "wouter";
import { ArrowRight, Brain, MessageSquareText, Sparkles } from "lucide-react";

/**
 * Homepage anchors for Product nav items without dedicated public landings.
 * Stable IDs: #ai-platform, #ai-brain, #ai-copilot
 */
export default function WelcomeAiPlatformSection() {
  return (
    <section
      id="ai-platform"
      className="scroll-mt-24 px-4 md:px-6 py-16 md:py-20 bg-white"
      aria-labelledby="ai-platform-heading"
    >
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-14">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">
            AI Sales Team
          </p>
          <h2
            id="ai-platform-heading"
            className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4"
          >
            AI that finds opportunities and guides every next step
          </h2>
          <p className="text-base md:text-lg text-gray-600">
            Prospect AI discovers who to sell to. AI Brain personalizes strategy and powers AI
            features across WhachatCRM. AI Copilot helps your team respond inside live
            conversations.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          <article className="rounded-[1.5rem] bg-gray-50 p-6 ring-1 ring-gray-100">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-brand-green">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-gray-950 mb-2">Prospect AI</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              Find and qualify local businesses, launch personalized outreach, and manage replies
              in one CRM.
            </p>
            <Link
              href="/prospect-ai"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded"
            >
              Explore Prospect AI
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
            <h3 className="text-lg font-bold text-gray-950 mb-2">AI Brain</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Analyzes prospects, helps create personalized campaigns, recommends strategy, and
              powers AI features across the platform where enabled.
            </p>
          </article>

          <article
            id="ai-copilot"
            className="scroll-mt-24 rounded-[1.5rem] bg-gray-50 p-6 ring-1 ring-gray-100"
          >
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <MessageSquareText className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-gray-950 mb-2">AI Copilot</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">
              Assists inside customer conversations with summaries, suggested replies, and lead
              context so your team moves faster without losing quality.
            </p>
            <Link
              href="/ai-lead-scoring"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded"
            >
              See AI lead scoring
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}

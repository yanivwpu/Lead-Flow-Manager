import { Link } from "wouter";
import { ArrowRight, Inbox, Search } from "lucide-react";

/** Two clear discovery paths below the hero — only when it fits the homepage narrative. */
export default function WelcomeDiscoveryPaths() {
  return (
    <section
      className="px-4 md:px-6 pb-10 md:pb-14"
      aria-label="Choose how you want to grow"
    >
      <div className="mx-auto grid max-w-7xl gap-3 md:grid-cols-2 md:gap-4 xl:max-w-[1440px] 2xl:max-w-[1536px]">
        <Link
          href="/prospect-ai"
          className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-green/40 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-brand-green">
            <Search className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-green mb-1">
              Find prospects
            </p>
            <h2 className="text-lg font-bold text-gray-950 mb-1">Find and qualify the right businesses</h2>
            <p className="text-sm text-gray-600 mb-3">
              Use Prospect AI to discover local opportunities, score fit, and start personalized outreach.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green group-hover:gap-1.5 transition-all">
              Explore Prospect AI
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Link>

        <Link
          href="/unified-inbox"
          className="group flex items-start gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-green/40 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Inbox className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-green mb-1">
              Convert conversations
            </p>
            <h2 className="text-lg font-bold text-gray-950 mb-1">Manage and convert every conversation</h2>
            <p className="text-sm text-gray-600 mb-3">
              Bring channels into Unified Inbox, use AI Copilot in-thread, and automate follow-up with
              templates.
            </p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green group-hover:gap-1.5 transition-all">
              Explore Unified Inbox
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}

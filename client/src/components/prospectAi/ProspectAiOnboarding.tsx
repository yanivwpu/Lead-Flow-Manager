import { useEffect, useRef } from "react";
import { Link } from "wouter";
import {
  ArrowDown,
  Brain,
  Building2,
  CheckCircle2,
  CircleAlert,
  Inbox,
  Mail,
  MessageSquare,
  Pencil,
  Radar,
  Search,
  Send,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackProspectAiGuideEvent } from "@/lib/prospectAiOnboarding";
import {
  PROSPECT_AI_BRAIN_ONBOARDING,
  PROSPECT_AI_BRAIN_RELATIONSHIP_LINES,
} from "@/content/prospectAiBrainEducation";

export type ProspectAiOnboardingMode = "first_time" | "reference";

type Props = {
  mode: ProspectAiOnboardingMode;
  onSkip: () => void;
  onFinishDiscover: () => void;
  onViewFullGuide: () => void;
  onCloseReference?: () => void;
  /** When true, show subtle active confirmation (no pricing / recommendation CTA). */
  aiBrainActive?: boolean;
};

const STATUS_ROWS = [
  { icon: CheckCircle2, label: "Qualified", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { icon: CircleAlert, label: "Needs Review", tone: "text-amber-800 bg-amber-50 border-amber-200" },
  { icon: CircleAlert, label: "Missing Email", tone: "text-amber-800 bg-amber-50 border-amber-200" },
  { icon: CircleAlert, label: "Enrichment Unavailable", tone: "text-amber-800 bg-amber-50 border-amber-200" },
  { icon: XCircle, label: "Not Qualified", tone: "text-rose-700 bg-rose-50 border-rose-200" },
] as const;

const WORKFLOW_STEPS = [
  { icon: Radar, title: "Discover", body: "Choose industry and location to find businesses." },
  { icon: Search, title: "Send to Review", body: "Move promising results into AI Review." },
  { icon: CheckCircle2, title: "Review & Accept", body: "Mark fits Qualified; Archive the rest." },
  { icon: Target, title: "Send to Campaign", body: "Queue Campaign Ready prospects for outreach." },
  { icon: Pencil, title: "Message Creation", body: "Personalize before you Start Sending." },
  { icon: Send, title: "Start Sending", body: "Launch outreach on your schedule." },
  { icon: Inbox, title: "Inbox", body: "Continue conversations with AI Copilot." },
] as const;

const TIPS = [
  "Start with one city or niche.",
  "Begin with a smaller batch.",
  "Review AI recommendations.",
  "Manually add verified email addresses for promising prospects.",
  "Personalize your outreach.",
  "Archive prospects you don't need.",
  "Watch replies in the Unified Inbox.",
] as const;

function FlowArrow({ className }: { className?: string }) {
  return <ArrowDown className={cn("mx-auto h-4 w-4 text-cyan-600/70", className)} aria-hidden />;
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700/80">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}

export function ProspectAiOnboarding({
  mode,
  onSkip,
  onFinishDiscover,
  onViewFullGuide,
  onCloseReference,
  aiBrainActive = false,
}: Props) {
  const trackedView = useRef(false);

  useEffect(() => {
    if (trackedView.current) return;
    trackedView.current = true;
    trackProspectAiGuideEvent(
      mode === "first_time" ? "prospect_ai_guide_viewed" : "prospect_ai_guide_reopened",
      { mode },
    );
  }, [mode]);

  const scrollToHow = () => {
    document.getElementById("pai-onboarding-how")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      className="min-h-full w-full bg-gradient-to-b from-slate-50 via-white to-sky-50/40"
      data-testid="prospect-ai-onboarding"
      data-mode={mode}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Hero */}
        <header className="rounded-3xl border border-sky-100 bg-gradient-to-br from-[#0B1F3A] via-[#123A5C] to-[#0E2A4A] px-6 py-10 text-center text-white shadow-xl shadow-sky-900/10 sm:px-10 sm:py-12">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-400/15 ring-1 ring-cyan-300/40">
            <Sparkles className="h-6 w-6 text-cyan-300" aria-hidden />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/90">
            Prospect AI · ~2–3 min
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-pretty sm:text-4xl">
            Meet Your AI Sales Team
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-sky-100/90 sm:text-base">
            Prospect AI helps you discover businesses, research publicly available information,
            qualify the best opportunities, and launch personalized outreach campaigns—all without
            leaving WhachatCRM.
          </p>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-cyan-100/80">
            We include Prospect AI with every WhachatCRM account because we want every customer—from
            Free to Pro—to experience the power of AI-powered prospecting and create new business
            growth opportunities.
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button
              className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              onClick={scrollToHow}
              data-testid="prospect-ai-guide-see-how"
            >
              See How It Works
            </Button>
            {mode === "first_time" ? (
              <Button
                variant="ghost"
                className="text-sky-100 hover:bg-white/10 hover:text-white"
                onClick={onSkip}
                data-testid="prospect-ai-guide-skip"
              >
                Skip Guide
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="text-sky-100 hover:bg-white/10 hover:text-white"
                onClick={onCloseReference}
                data-testid="prospect-ai-guide-back"
              >
                Back to Workspace
              </Button>
            )}
          </div>
        </header>

        <div className="mt-12 space-y-14">
          <Section id="pai-onboarding-how" eyebrow="How it works" title="How Prospect AI Works">
            <div className="grid gap-4 sm:grid-cols-1">
              <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-cyan-700">
                  <Building2 className="h-5 w-5" aria-hidden />
                  <h3 className="font-semibold text-gray-900">1. Discover Businesses</h3>
                </div>
                <p className="mt-2">
                  Choose an industry and location. Prospect AI searches publicly available business
                  information and finds potential customers.
                </p>
                <div className="mt-4 flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <span>Businesses</span>
                  <FlowArrow />
                  <span className="text-cyan-700">AI Discovery</span>
                </div>
              </article>

              <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-cyan-700">
                  <Sparkles className="h-5 w-5" aria-hidden />
                  <h3 className="font-semibold text-gray-900">2. AI Review</h3>
                </div>
                <p className="mt-2">
                  Prospect AI automatically analyzes every business. You will normally see a mix of
                  outcomes—this is completely normal. Not every business is the right customer.
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {STATUS_ROWS.map((row) => (
                    <li
                      key={row.label}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                        row.tone,
                      )}
                    >
                      <row.icon className="h-3.5 w-3.5" aria-hidden />
                      {row.label}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5 shadow-sm">
                <div className="flex items-center gap-2 text-amber-800">
                  <CircleAlert className="h-5 w-5" aria-hidden />
                  <h3 className="font-semibold text-gray-900">3. Understanding Real-World Data</h3>
                </div>
                <p className="mt-2">
                  Prospect AI works with real public business information—not artificially generated
                  data. Because every business is different, you may occasionally see missing email
                  addresses, no official website, limited public information, duplicate businesses, or
                  businesses marked Not Qualified.
                </p>
                <p className="mt-2">
                  These outcomes are completely normal and do <strong className="font-semibold text-gray-800">not</strong>{" "}
                  mean Prospect AI is broken. Our goal is to provide honest, real-world opportunities
                  rather than inventing information just to make every prospect appear complete.
                </p>
                <div className="mt-4 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-amber-950">
                  Think of Prospect AI as an AI sales employee—not a perfect database.
                </div>
              </article>

              <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-cyan-700">
                  <Mail className="h-5 w-5" aria-hidden />
                  <h3 className="font-semibold text-gray-900">4. Improve Great Prospects</h3>
                </div>
                <p className="mt-2">
                  Sometimes Prospect AI finds an excellent business but cannot locate a public email
                  address. Before discarding it, consider updating the prospect manually.
                </p>
                <p className="mt-2">Good places to look:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Business website</li>
                  <li>Contact page</li>
                  <li>Facebook</li>
                  <li>Instagram</li>
                  <li>Google Business Profile</li>
                  <li>LinkedIn</li>
                </ul>
                <p className="mt-2">
                  One manually added email can immediately turn a great prospect into a Campaign Ready
                  opportunity.
                </p>
                <div className="mt-4 flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-4 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <span>Missing Email</span>
                  <FlowArrow />
                  <span>Manual Update</span>
                  <FlowArrow />
                  <span className="text-emerald-700">Campaign Ready</span>
                </div>
              </article>

              <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-cyan-700">
                  <MessageSquare className="h-5 w-5" aria-hidden />
                  <h3 className="font-semibold text-gray-900">5. Launch Campaigns</h3>
                </div>
                <p className="mt-2">
                  Choose the prospects you accepted. Create your outreach. Review or edit the message.
                  Start sending. Replies automatically arrive in your Unified Inbox where AI Copilot
                  helps continue the conversation.
                </p>
              </article>
            </div>
          </Section>

          <Section title="What is Normal?">
            <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 sm:p-6">
              <p>
                The following outcomes are expected when Prospect AI works with real-world public
                business information:
              </p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  "✓ Qualified",
                  "⚠ Missing Email",
                  "⚠ Missing Website",
                  "⚠ Enrichment Unavailable",
                  "❌ Not Qualified",
                  "↻ Duplicate",
                ].map((item) => (
                  <li
                    key={item}
                    className="rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm font-medium text-gray-800"
                  >
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-4">
                These outcomes demonstrate that Prospect AI is working with real public information
                instead of generating fake data.
              </p>
            </div>
          </Section>

          <Section title="Your Prospect AI Workflow">
            <p className="text-gray-600">
              This is the mental model for every campaign—from first discovery to replies in your
              inbox.
            </p>
            <ol
              className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              data-testid="prospect-ai-workflow-illustration"
            >
              {WORKFLOW_STEPS.map((step, idx) => (
                <li
                  key={step.title}
                  className="relative rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
                    <step.icon className="h-4 w-4" aria-hidden />
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-cyan-700/80">
                    Step {idx + 1}
                  </p>
                  <h3 className="mt-0.5 text-sm font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{step.body}</p>
                  {idx < WORKFLOW_STEPS.length - 1 ? (
                    <span className="pointer-events-none absolute -bottom-3 left-1/2 hidden -translate-x-1/2 text-cyan-500 sm:block lg:hidden">
                      ↓
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            <div className="mt-4 hidden overflow-x-auto lg:block">
              <div className="flex min-w-max items-center gap-2 px-1 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {WORKFLOW_STEPS.map((step, idx) => (
                  <div key={step.title} className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                      {step.title}
                    </span>
                    {idx < WORKFLOW_STEPS.length - 1 ? (
                      <span className="text-cyan-600" aria-hidden>
                        →
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Best Practices">
            <ul className="grid gap-2 sm:grid-cols-2">
              {TIPS.map((tip) => (
                <li
                  key={tip}
                  className="flex gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </Section>

          <section
            className="rounded-2xl border border-slate-200/90 bg-slate-50/80 px-5 py-5 sm:px-6"
            data-testid="prospect-ai-guide-ai-brain"
            aria-label="AI Brain optional intelligence"
          >
            {aiBrainActive ? (
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-200/80 bg-white text-violet-600 shadow-sm">
                  <Brain className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium leading-snug text-slate-800">
                    {PROSPECT_AI_BRAIN_ONBOARDING.activeConfirmation}
                  </p>
                  <p className="text-xs leading-relaxed text-slate-500 whitespace-pre-line">
                    {PROSPECT_AI_BRAIN_RELATIONSHIP_LINES.join("\n")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                    <Brain className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                      {PROSPECT_AI_BRAIN_ONBOARDING.heading}
                    </h2>
                    <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-600">
                      {PROSPECT_AI_BRAIN_ONBOARDING.body.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
                  <p className="text-sm font-semibold leading-snug text-slate-900 whitespace-pre-line">
                    {PROSPECT_AI_BRAIN_RELATIONSHIP_LINES.join("\n")}
                  </p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {PROSPECT_AI_BRAIN_ONBOARDING.priceLabel}
                  </p>
                </div>
                <div>
                  <Link href={PROSPECT_AI_BRAIN_ONBOARDING.ctaHref}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      data-testid="prospect-ai-guide-learn-ai-brain"
                    >
                      {PROSPECT_AI_BRAIN_ONBOARDING.ctaLabel}
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-sky-50 px-6 py-8 text-center sm:px-10">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-gray-900">
              You're Ready
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-gray-600">
              Your AI Sales Team is ready to help you discover, qualify and engage new business
              opportunities. Start with a small campaign, learn what works for your industry, and let
              Prospect AI save you hours of manual prospecting.
            </p>
            <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button
                className="bg-brand-green hover:bg-brand-green/90"
                onClick={onFinishDiscover}
                data-testid="prospect-ai-guide-finish-discover"
              >
                {mode === "first_time" ? "Finish & Discover Businesses" : "Discover Businesses"}
              </Button>
              <Button
                variant="outline"
                onClick={onViewFullGuide}
                data-testid="prospect-ai-guide-full-docs"
              >
                View Full User Guide
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

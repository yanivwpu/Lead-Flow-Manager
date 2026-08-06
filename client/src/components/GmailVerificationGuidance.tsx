import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Link2,
  MailCheck,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readGmailSetupVideoUrl } from "@/lib/gmailGoogleVerification";
import { cn } from "@/lib/utils";

const TIMELINE_STEPS = [
  { n: 1, label: "Click Connect Gmail", icon: Link2 },
  { n: 2, label: "Click Advanced", icon: Sparkles },
  { n: 3, label: "Continue to WhachatCRM", icon: ShieldCheck },
  { n: 4, label: "Approve Gmail Access", icon: MailCheck },
] as const;

type GmailVerificationGuidanceProps = {
  className?: string;
  /** Override for tests / storybooks */
  setupVideoUrl?: string | null;
};

export function GmailVerificationGuidance({
  className,
  setupVideoUrl,
}: GmailVerificationGuidanceProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const videoUrl = setupVideoUrl === undefined ? readGmailSetupVideoUrl() : setupVideoUrl;

  return (
    <div
      className={cn("rounded-lg border border-sky-200 bg-sky-50/80 p-3.5 space-y-3", className)}
      data-testid="gmail-verification-guidance"
    >
      <div>
        <p className="text-sm font-semibold text-sky-950">Connecting Gmail (Quick Setup)</p>
        <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-sky-900/90">
          <p>
            WhachatCRM securely connects to Gmail using Google&apos;s official OAuth sign-in.
          </p>
          <p>
            While Google completes our app verification, you may briefly see Google&apos;s standard
            &quot;This app isn&apos;t verified&quot; screen before authorizing access.
          </p>
          <p>
            This is expected and only affects the approval status—not the security of your Gmail
            account.
          </p>
          <p className="font-medium text-sky-950">To continue:</p>
          <ol className="list-decimal ml-4 space-y-0.5">
            <li>
              Click <strong>Advanced</strong>
            </li>
            <li>
              Click <strong>Continue to WhachatCRM</strong>
            </li>
            <li>Sign in with your Google account</li>
            <li>Approve the requested Gmail permissions</li>
          </ol>
          <p>
            Once Google&apos;s verification is complete, this additional screen will disappear
            automatically.
          </p>
        </div>
      </div>

      <ol
        className="flex flex-col sm:flex-row sm:items-center sm:gap-0"
        aria-label="Gmail connection steps"
        data-testid="gmail-verification-timeline"
      >
        {TIMELINE_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.n} className="flex flex-col sm:flex-row sm:items-center sm:flex-1 sm:min-w-0">
              <div className="flex items-center gap-2.5 sm:flex-col sm:items-center sm:text-center sm:gap-1.5 rounded-md bg-white/70 border border-sky-100 px-2.5 py-2 w-full">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">
                  {step.n}
                </span>
                <div className="flex items-center gap-1.5 sm:flex-col sm:gap-1 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-sky-700 shrink-0 hidden sm:block" aria-hidden />
                  <span className="text-[11px] font-medium text-sky-950 leading-snug">
                    {step.label}
                  </span>
                </div>
              </div>
              {index < TIMELINE_STEPS.length - 1 ? (
                <>
                  <div className="flex justify-center py-0.5 text-sky-400 sm:hidden" aria-hidden>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </div>
                  <div className="hidden sm:flex px-0.5 text-sky-400 shrink-0" aria-hidden>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-0.5">
        <button
          type="button"
          onClick={() => setHelpOpen((v) => !v)}
          aria-expanded={helpOpen}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sky-800 hover:text-sky-950 underline-offset-2 hover:underline text-left"
          data-testid="gmail-verification-help-link"
        >
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          Need help connecting Gmail?
        </button>

        {videoUrl ? (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-sky-800 hover:text-sky-950 underline-offset-2 hover:underline"
            data-testid="gmail-setup-video-link"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            Watch 20-second setup
          </a>
        ) : null}
      </div>

      {helpOpen ? (
        <div
          className="rounded-lg border border-sky-200 bg-white p-3 space-y-3"
          data-testid="gmail-verification-help-panel"
          role="region"
          aria-label="Gmail connection help"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold text-sky-950">Google verification screen</p>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="rounded-md p-1 text-sky-700 hover:bg-sky-50"
              aria-label="Close help"
              data-testid="gmail-verification-help-close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-sky-900/90">
            Google shows a standard verification screen while WhachatCRM&apos;s app approval is
            pending. Your Gmail account stays secure—this only changes the approval prompt.
          </p>
          <div className="rounded-md border bg-slate-50 overflow-hidden">
            <img
              src="/images/gmail-google-unverified-placeholder.svg"
              alt="Google app verification screen with Advanced and Continue to WhachatCRM highlighted"
              className="w-full h-auto"
              data-testid="gmail-verification-screenshot"
            />
          </div>
          <ul className="space-y-1.5 text-[12px] text-sky-950">
            <li className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
              <span>
                Tap <strong>Advanced</strong> on Google&apos;s warning page.
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Then choose <strong>Continue to WhachatCRM</strong> and approve Gmail access.
              </span>
            </li>
          </ul>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => setHelpOpen(false)}
          >
            Got it
          </Button>
        </div>
      ) : null}
    </div>
  );
}

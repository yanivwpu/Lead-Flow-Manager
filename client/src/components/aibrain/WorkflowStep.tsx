/**
 * One numbered step in the AI Brain workflow.
 *
 * Shared so every step — including the questions step, which lives in its own file — draws
 * the same marker, connector, spacing and status. The workflow reads as one list because it
 * is one list: each step renders an <li> into the same <ol>.
 *
 * The step shell is full-column width (same edges as the AI behavior card). The timeline
 * rail and numbered/completed circles sit in an internal start-side gutter so they never
 * steal width from the page column.
 */

import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "todo" | "ready" | "busy" | "done";

const STEP_MARKER_STYLES: Record<StepState, string> = {
  todo: "border-slate-200 bg-white text-slate-400",
  ready: "border-violet-300 bg-white text-violet-700",
  busy: "border-violet-300 bg-violet-50 text-violet-700",
  done: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

const STEP_STATUS_STYLES: Record<StepState, string> = {
  todo: "text-slate-500",
  ready: "text-violet-800",
  busy: "text-violet-800",
  done: "text-emerald-800",
};

export function Step({
  index,
  title,
  description,
  state,
  status,
  isLast,
  children,
}: {
  index: number;
  title: string;
  description: string;
  state: StepState;
  status: string;
  isLast?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative w-full min-w-0" data-testid={`knowledge-step-${index}`}>
      <div
        className="flex w-full min-w-0 items-start gap-2 rounded-2xl border-0 bg-white/95 ps-2.5 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50 sm:gap-3.5 sm:ps-4"
        data-testid={`knowledge-step-card-${index}`}
      >
        <div
          className="relative w-8 shrink-0 self-stretch sm:w-10"
          data-testid={`knowledge-step-gutter-${index}`}
          aria-hidden
        >
          {!isLast && (
            <span
              className="pointer-events-none absolute inset-x-0 top-9 z-0 mx-auto w-px bg-gradient-to-b from-violet-200/80 to-slate-200/70 sm:top-11"
              style={{ bottom: "-1.25rem" }}
            />
          )}
          <span
            className={cn(
              "relative z-10 mt-1 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold shadow-sm sm:h-10 sm:w-10",
              STEP_MARKER_STYLES[state],
            )}
          >
            {state === "busy" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : state === "done" ? (
              <Check className="h-4 w-4" strokeWidth={2.5} />
            ) : (
              index
            )}
          </span>
        </div>

        <div className="min-w-0 flex-1 pe-4 pt-4 sm:pe-5 sm:pt-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                <span className="sr-only">{`Step ${index}: `}</span>
                {title}
              </h3>
              <span className={cn("text-xs font-medium", STEP_STATUS_STYLES[state])}>{status}</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{description}</p>
          </div>
          <div className="space-y-4 pb-5 pt-4">{children}</div>
        </div>
      </div>
    </li>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-slate-200/70 bg-slate-50/50 px-3 py-2 text-sm text-slate-600">
      {children}
    </p>
  );
}

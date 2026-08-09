import { ArrowDown, CheckCircle2, MessageSquare, Tag, UserPlus, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductTheme } from "@shared/productThemes";

export type FlowNodeKind = "trigger" | "message" | "question" | "action" | "outcome" | "delay";

export type FlowNode = {
  kind: FlowNodeKind;
  label: string;
  detail?: string;
};

export type FlowScenario = {
  title: string;
  summary: string;
  nodes: FlowNode[];
};

const KIND_ICON = {
  trigger: Zap,
  message: MessageSquare,
  question: MessageSquare,
  action: Tag,
  outcome: CheckCircle2,
  delay: ArrowDown,
} as const;

type Props = {
  scenarios: FlowScenario[];
  theme: ProductTheme;
  heading?: string;
  eyebrow?: string;
};

export function ProductFlowSchema({
  scenarios,
  theme,
  heading = "Practical workflow scenarios",
  eyebrow = "When this happens → WhachatCRM does this next",
}: Props) {
  return (
    <section className={cn("px-4 py-14 md:px-6 md:py-16", theme.sectionAltBg)}>
      <div className="mx-auto max-w-7xl xl:max-w-[1440px]">
        <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", theme.accentText)}>
          {eyebrow}
        </p>
        <h2 className="font-display mb-8 text-2xl font-bold text-gray-950 md:text-3xl">{heading}</h2>
        <div className="grid gap-6 lg:grid-cols-3">
          {scenarios.map((scenario) => (
            <article
              key={scenario.title}
              className={cn("rounded-2xl border bg-white p-5 shadow-sm", theme.accentBorder)}
            >
              <h3 className="text-lg font-semibold text-gray-950">{scenario.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{scenario.summary}</p>
              <ol className="mt-5 space-y-0" aria-label={`${scenario.title} steps`}>
                {scenario.nodes.map((node, index) => {
                  const Icon = KIND_ICON[node.kind];
                  return (
                    <li key={`${scenario.title}-${node.label}-${index}`} className="relative">
                      <div
                        className={cn(
                          "flex gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3",
                          node.kind === "trigger" && theme.accentSoft,
                          node.kind === "outcome" && "bg-emerald-50 border-emerald-100",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                            node.kind === "outcome" ? "bg-emerald-600 text-white" : cn(theme.nodeBg, theme.nodeText),
                          )}
                          aria-hidden
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            {node.kind}
                          </p>
                          <p className="text-sm font-semibold text-gray-950">{node.label}</p>
                          {node.detail ? (
                            <p className="mt-0.5 text-sm text-gray-600">{node.detail}</p>
                          ) : null}
                        </div>
                      </div>
                      {index < scenario.nodes.length - 1 ? (
                        <div className="flex justify-center py-1" aria-hidden>
                          <ArrowDown className={cn("h-4 w-4", theme.accentText)} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Small helper icon for assign-style nodes in schemas */
export function ProductAssignHint({ className }: { className?: string }) {
  return <UserPlus className={className} aria-hidden />;
}

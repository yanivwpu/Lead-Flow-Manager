import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type WorkflowStep = {
  label: string;
  description: string;
};

type Props = {
  title: string;
  steps: WorkflowStep[];
  className?: string;
  eyebrowClassName?: string;
  stepBadgeClassName?: string;
};

/** Lightweight workflow graphic — HTML/CSS only, no heavy animation libs. */
export function SolutionWorkflow({
  title,
  steps,
  className,
  eyebrowClassName = "text-brand-green",
  stepBadgeClassName = "bg-brand-green text-white",
}: Props) {
  return (
    <section
      className={cn("scroll-mt-24", className)}
      aria-labelledby="solution-workflow-heading"
    >
      <div className="mb-8 max-w-3xl">
        <p className={cn("mb-2 text-sm font-semibold uppercase tracking-[0.16em]", eyebrowClassName)}>
          Visual workflow
        </p>
        <h2
          id="solution-workflow-heading"
          className="font-display text-2xl font-bold tracking-tight text-gray-950 md:text-3xl"
        >
          {title}
        </h2>
      </div>

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="relative flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  stepBadgeClassName,
                )}
                aria-hidden
              >
                {index + 1}
              </span>
              {index < steps.length - 1 ? (
                <ArrowRight
                  className="hidden h-4 w-4 text-gray-300 xl:absolute xl:-right-2 xl:top-8 xl:block xl:translate-x-full"
                  aria-hidden
                />
              ) : null}
              <h3 className="text-base font-semibold text-gray-950">{step.label}</h3>
            </div>
            <p className="text-sm leading-relaxed text-gray-600">{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

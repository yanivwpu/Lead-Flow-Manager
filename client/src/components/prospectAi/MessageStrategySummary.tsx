import {
  PROSPECT_MESSAGE_CREATION_MODE_LABELS,
  type ProspectMessageCreationMode,
} from "@shared/prospectMessageCreation";

const SUMMARY_POINTS: Record<ProspectMessageCreationMode, string[]> = {
  ai_compose: [
    "AI creates every message individually.",
    "Uses your campaign instructions, AI Brain business knowledge, and prospect information.",
  ],
  use_my_template: [
    "Your wording is preserved exactly.",
    "Only inserted personalized fields are replaced.",
    "No AI rewriting.",
  ],
  ai_assisted_template: [
    "Your wording stays unchanged.",
    "AI personalizes only the sections you inserted.",
  ],
};

type Props = {
  mode: ProspectMessageCreationMode;
};

export function MessageStrategySummary({ mode }: Props) {
  const points = SUMMARY_POINTS[mode];
  return (
    <div
      className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5"
      data-testid="pi-message-strategy-summary"
      aria-label="Message Strategy summary"
    >
      <p className="text-xs font-semibold text-gray-900">
        Message Strategy · {PROSPECT_MESSAGE_CREATION_MODE_LABELS[mode]}
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {points.map((point) => (
          <li key={point} className="text-[11px] leading-snug text-gray-600">
            ✓ {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

import { Label } from "@/components/ui/label";
import {
  PROSPECT_MESSAGE_CREATION_MODE_LABELS,
  PROSPECT_MESSAGE_CREATION_MODES,
  type ProspectMessageCreationMode,
} from "@shared/prospectMessageCreation";
import { cn } from "@/lib/utils";

const MODE_HELP: Record<ProspectMessageCreationMode, string> = {
  ai_compose: "AI writes a personalized message for every prospect.",
  use_my_template:
    "Your wording remains exact. Only inserted personalized fields are replaced.",
  ai_assisted_template:
    "Your wording remains exact. AI writes only the personalization sections you insert.",
};

type Props = {
  value: ProspectMessageCreationMode;
  onChange: (mode: ProspectMessageCreationMode) => void;
};

export function MessageCreationModePicker({ value, onChange }: Props) {
  const legendId = "pi-message-creation-mode-legend";

  return (
    <fieldset className="space-y-2" data-testid="pi-message-creation-mode-picker">
      <Label id={legendId} className="text-sm font-medium text-gray-900">
        How would you like to create your messages?
      </Label>
      <div
        role="radiogroup"
        aria-labelledby={legendId}
        className="space-y-1.5"
      >
        {PROSPECT_MESSAGE_CREATION_MODES.map((mode) => {
          const selected = value === mode;
          const helpId = `pi-message-mode-help-${mode}`;
          const labelId = `pi-message-mode-label-${mode}`;
          return (
            <label
              key={mode}
              htmlFor={`pi-message-mode-input-${mode}`}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
                "focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-green/35 focus-within:ring-offset-1",
                selected
                  ? "border-2 border-brand-green bg-emerald-50 shadow-sm"
                  : "border border-gray-200 bg-white hover:bg-gray-50",
              )}
              aria-current={selected ? "true" : undefined}
            >
              <input
                id={`pi-message-mode-input-${mode}`}
                type="radio"
                name="pi-message-creation-mode"
                className="mt-1"
                checked={selected}
                onChange={() => onChange(mode)}
                aria-labelledby={labelId}
                aria-describedby={helpId}
                data-testid={`pi-message-mode-${mode}`}
              />
              <span className="min-w-0">
                <span
                  id={labelId}
                  className={cn(
                    "block text-sm text-gray-900",
                    selected ? "font-semibold" : "font-medium",
                  )}
                >
                  {PROSPECT_MESSAGE_CREATION_MODE_LABELS[mode]}
                  {selected ? (
                    <span className="sr-only"> (selected)</span>
                  ) : null}
                </span>
                <span id={helpId} className="mt-0.5 block text-xs text-gray-500">
                  {MODE_HELP[mode]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

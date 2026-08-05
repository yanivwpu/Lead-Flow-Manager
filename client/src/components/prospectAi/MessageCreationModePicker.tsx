import { Label } from "@/components/ui/label";
import {
  PROSPECT_MESSAGE_CREATION_MODE_LABELS,
  PROSPECT_MESSAGE_CREATION_MODES,
  type ProspectMessageCreationMode,
} from "@shared/prospectMessageCreation";
import { cn } from "@/lib/utils";

const MODE_HELP: Record<ProspectMessageCreationMode, string> = {
  ai_compose: "AI writes every outreach individually using your instructions and prospect context.",
  use_my_template: "You write the message. Only variables are replaced — AI never rewrites.",
  ai_assisted_template: "You write the template. AI fills only {{ai_…}} placeholders.",
};

type Props = {
  value: ProspectMessageCreationMode;
  onChange: (mode: ProspectMessageCreationMode) => void;
};

export function MessageCreationModePicker({ value, onChange }: Props) {
  return (
    <fieldset className="space-y-2" data-testid="pi-message-creation-mode-picker">
      <Label className="text-sm font-medium text-gray-900">
        How would you like to create your messages?
      </Label>
      <div className="space-y-1.5">
        {PROSPECT_MESSAGE_CREATION_MODES.map((mode) => {
          const selected = value === mode;
          return (
            <label
              key={mode}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                selected
                  ? "border-brand-green/40 bg-emerald-50/40"
                  : "border-gray-200 bg-white hover:bg-gray-50",
              )}
            >
              <input
                type="radio"
                name="pi-message-creation-mode"
                className="mt-1"
                checked={selected}
                onChange={() => onChange(mode)}
                data-testid={`pi-message-mode-${mode}`}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">
                  {PROSPECT_MESSAGE_CREATION_MODE_LABELS[mode]}
                </span>
                <span className="mt-0.5 block text-xs text-gray-500">{MODE_HELP[mode]}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

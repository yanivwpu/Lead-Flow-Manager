import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROSPECT_AI_PLACEHOLDER_PRESETS } from "@shared/prospectAiPlaceholders";

type Props = {
  onInsert: (token: string) => void;
};

export function ProspectAiPlaceholderPicker({ onInsert }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          data-testid="pi-insert-ai-placeholder"
        >
          ✨ Insert AI Personalization
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PROSPECT_AI_PLACEHOLDER_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.key}
            onClick={() => onInsert(`{{${preset.key}}}`)}
            data-testid={`pi-ai-placeholder-${preset.key}`}
          >
            <span className="flex flex-col">
              <span>{preset.label}</span>
              <span className="font-mono text-[10px] text-gray-400">{`{{${preset.key}}}`}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PROSPECT_MESSAGE_VARIABLE_LABELS,
  PROSPECT_MESSAGE_VARIABLES,
  type ProspectMessageVariableKey,
} from "@shared/prospectMessageVariables";

type Props = {
  onInsert: (token: string) => void;
};

export function ProspectVariablePicker({ onInsert }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          data-testid="pi-insert-variable"
        >
          Insert Variable
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
        {PROSPECT_MESSAGE_VARIABLES.map((key: ProspectMessageVariableKey) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onInsert(`{{${key}}}`)}
            data-testid={`pi-variable-${key}`}
          >
            <span className="flex flex-col">
              <span>{PROSPECT_MESSAGE_VARIABLE_LABELS[key]}</span>
              <span className="font-mono text-[10px] text-gray-400">{`{{${key}}}`}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

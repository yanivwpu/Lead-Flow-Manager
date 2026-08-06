import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PROSPECT_MESSAGE_VARIABLE_GROUPS,
  PROSPECT_MESSAGE_VARIABLE_LABELS,
  type ProspectMessageVariableKey,
} from "@shared/prospectMessageVariables";

type Props = {
  onInsert: (token: string) => void;
  /** Optional override for future surfaces that need a different group set. */
  groups?: typeof PROSPECT_MESSAGE_VARIABLE_GROUPS;
  triggerLabel?: string;
};

export function ProspectVariablePicker({
  onInsert,
  groups = PROSPECT_MESSAGE_VARIABLE_GROUPS,
  triggerLabel = "Insert Variable",
}: Props) {
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
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {group.label}
            </DropdownMenuLabel>
            {group.keys.map((key: ProspectMessageVariableKey) => (
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
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function InboxDetailChoice({
  value, label, options, onChange, dir, testId, className,
}: {
  value: string;
  label: string;
  options: readonly { value: string; label: string; textClass?: string }[];
  onChange: (value: string) => void;
  dir: "ltr" | "rtl";
  testId: string;
  className?: string;
}) {
  const selected = options.find(option => option.value === value);

  return (
    // Select locks document scrolling. This anchored menu leaves the Inbox panes and the mobile sheet in control of their own scroll.
    <DropdownMenu dir={dir} modal={false}>
      <DropdownMenuTrigger
        type="button"
        data-testid={testId}
        className={cn("flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-start text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring", className)}
      >
        <span className="min-w-0 truncate">
          {selected && <span className="sr-only">{label}: </span>}
          <bdi>{selected?.label ?? label}</bdi>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        className="z-[60] min-w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-1rem)]"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map(option => (
            <DropdownMenuRadioItem key={option.value} value={option.value} textValue={option.label} className={cn("text-[11px]", option.textClass)}>
              <bdi className="break-words">{option.label}</bdi>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function parseAgentPageMarketAreas(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function serializeAgentPageMarketAreas(areas: string[]): string | null {
  const unique = [...new Set(areas.map((a) => a.trim()).filter(Boolean))];
  return unique.length > 0 ? unique.join(", ") : null;
}

type Props = {
  value: string | null;
  disabled?: boolean;
  onSave: (serialized: string | null) => void;
  className?: string;
};

export function AgentPageMarketAreaChips({ value, disabled, onSave, className }: Props) {
  const [areas, setAreas] = useState<string[]>(() => parseAgentPageMarketAreas(value));
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setAreas(parseAgentPageMarketAreas(value));
  }, [value]);

  const commitAreas = (next: string[]) => {
    setAreas(next);
    onSave(serializeAgentPageMarketAreas(next));
  };

  const addArea = (raw: string) => {
    const parts = raw
      .split(/[,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...areas];
    for (const part of parts) {
      const exists = next.some((a) => a.toLowerCase() === part.toLowerCase());
      if (!exists) next.push(part);
    }
    commitAreas(next);
    setDraft("");
  };

  return (
    <div className={cn("space-y-2", className)} data-testid="agent-page-market-chips">
      {areas.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {areas.map((area) => (
            <Badge
              key={area}
              variant="secondary"
              className="text-xs font-normal gap-1 pr-1 max-w-full"
            >
              <span className="truncate">{area}</span>
              {!disabled ? (
                <button
                  type="button"
                  className="rounded-sm hover:bg-gray-300/60 p-0.5"
                  aria-label={`Remove ${area}`}
                  onClick={() => commitAreas(areas.filter((a) => a !== area))}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Add cities or neighborhoods you serve.</p>
      )}
      <Input
        id="agent-page-market"
        value={draft}
        disabled={disabled}
        placeholder="e.g. Fort Lauderdale — press Enter to add"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addArea(draft);
          }
        }}
        onBlur={() => {
          if (draft.trim()) addArea(draft);
        }}
      />
    </div>
  );
}

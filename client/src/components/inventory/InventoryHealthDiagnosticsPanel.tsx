import { useState } from "react";
import { ChevronRight, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { InventoryMatchDiagnostics } from "@shared/inventory/inventoryMatchTypes";
import { formatInventoryMatchRunTime } from "@shared/inventory/inventoryMatchDiagnostics";

type InventoryHealthDiagnosticsPanelProps = {
  diagnostics?: InventoryMatchDiagnostics | null;
  /** When the matches query failed before server diagnostics were returned */
  clientError?: string | null;
  /** Client-side fetch completion time when API diagnostics omit lastMatchRunAt */
  lastClientFetchAt?: string | null;
  reason?: string;
  compact?: boolean;
  rateLimitWarning?: boolean;
};

function DiagnosticRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-3 text-[10px] leading-snug">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-800 font-mono text-right break-all">{value}</span>
    </div>
  );
}

export function InventoryHealthDiagnosticsPanel({
  diagnostics,
  clientError,
  lastClientFetchAt,
  reason,
  compact = true,
  rateLimitWarning = false,
}: InventoryHealthDiagnosticsPanelProps) {
  const [open, setOpen] = useState(import.meta.env.DEV || rateLimitWarning);
  const lastRun = diagnostics?.lastMatchRunAt ?? lastClientFetchAt;
  const lastError =
    diagnostics?.lastMatchingError ??
    clientError ??
    null;

  const activeCount = diagnostics?.activeInventoryCount;
  const scored = diagnostics?.listingsScored;
  const returned = diagnostics?.matchesReturned;

  const hasAnomaly =
    rateLimitWarning ||
    (typeof activeCount === "number" && activeCount > 0 && (scored ?? 0) === 0) ||
    (typeof scored === "number" && scored > 0 && (returned ?? 0) === 0 && reason === "listing_fetch_failed") ||
    (!!lastError && !rateLimitWarning);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left transition-colors",
          hasAnomaly
            ? "border-amber-200 bg-amber-50/80 hover:bg-amber-50"
            : "border-slate-200 bg-slate-50/80 hover:bg-slate-50",
          compact ? "text-[9px]" : "text-[10px]",
        )}
        data-testid="inventory-health-diagnostics-trigger"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <Stethoscope className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
        <span className="font-semibold uppercase tracking-wide text-slate-600">
          Inventory health
        </span>
        {hasAnomaly && (
          <span className="ml-auto text-amber-700 font-medium normal-case">
            {rateLimitWarning ? "rate limit" : "check"}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-1 rounded-md border border-slate-200 bg-slate-50/50 px-2 py-2 space-y-1"
        data-testid="inventory-health-diagnostics-panel"
      >
        {rateLimitWarning && (
          <p className="text-[10px] text-amber-800 leading-snug pb-1">
            Refresh paused briefly — showing your last successful matches.
          </p>
        )}
        <DiagnosticRow
          label="Active inventory"
          value={activeCount ?? "—"}
        />
        <DiagnosticRow label="Listings scored" value={scored ?? "—"} />
        <DiagnosticRow label="Matches returned" value={returned ?? "—"} />
        <DiagnosticRow label="Last match run" value={formatInventoryMatchRunTime(lastRun)} />
        <DiagnosticRow
          label="Last matching error"
          value={lastError?.trim() || "—"}
        />
        {reason && (
          <DiagnosticRow label="API reason" value={reason} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

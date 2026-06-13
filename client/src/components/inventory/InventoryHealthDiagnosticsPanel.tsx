import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { InventoryMatchDiagnostics } from "@shared/inventory/inventoryMatchTypes";
import {
  formatFunnelExcludedSampleLine,
  formatInventoryMatchRunTime,
} from "@shared/inventory/inventoryMatchDiagnostics";
import { formatListingExclusionLine } from "@shared/inventory/inventoryMatchScoring";

type InventoryHealthDiagnosticsPanelProps = {
  diagnostics?: InventoryMatchDiagnostics | null;
  clientError?: string | null;
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
  const lastRun = diagnostics?.lastMatchRunAt ?? lastClientFetchAt;
  const lastError = diagnostics?.lastMatchingError ?? clientError ?? null;

  const activeCount = diagnostics?.activeInventoryCount;
  const scored = diagnostics?.listingsScored;
  const returned = diagnostics?.matchesReturned;
  const totalQualifying = diagnostics?.totalQualifyingMatches;
  const capTruncated = diagnostics?.inventoryCapTruncated;

  const hasAnomaly = useMemo(
    () =>
      rateLimitWarning ||
      capTruncated === true ||
      (typeof activeCount === "number" && activeCount > 0 && (scored ?? 0) === 0) ||
      (typeof scored === "number" &&
        scored > 0 &&
        (totalQualifying ?? returned ?? 0) === 0) ||
      (typeof totalQualifying === "number" &&
        totalQualifying >= 10 &&
        typeof returned === "number" &&
        totalQualifying > returned) ||
      (!!lastError && !rateLimitWarning),
    [rateLimitWarning, capTruncated, activeCount, scored, returned, totalQualifying, lastError],
  );

  const [open, setOpen] = useState(import.meta.env.DEV || rateLimitWarning || hasAnomaly);

  useEffect(() => {
    if (hasAnomaly) setOpen(true);
  }, [hasAnomaly]);

  const profile = diagnostics?.persistedProfileSnapshot;
  const richSamples = diagnostics?.funnelExcludedSamples ?? [];
  const legacySamples = diagnostics?.excludedSamples ?? [];

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
          Inventory health (live DB)
        </span>
        {hasAnomaly && (
          <span className="ml-auto text-amber-700 font-medium normal-case">
            {rateLimitWarning ? "rate limit" : capTruncated ? "cap hit" : "review funnel"}
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
        {capTruncated && (
          <p className="text-[10px] text-amber-800 leading-snug pb-1">
            Matching cap reached — only {scored} of {activeCount} active listings were scored.
            Increase matching limit or sync may be incomplete.
          </p>
        )}
        <DiagnosticRow label="Active inventory (DB)" value={activeCount ?? "—"} />
        <DiagnosticRow label="Rows loaded for scoring" value={scored ?? "—"} />
        <DiagnosticRow
          label="Fetch limit"
          value={diagnostics?.matchingFetchLimit ?? "—"}
        />
        <DiagnosticRow
          label="Qualifying matches (DB funnel)"
          value={totalQualifying ?? returned ?? "—"}
        />
        <DiagnosticRow label="Returned (top 10)" value={returned ?? "—"} />
        <DiagnosticRow label="Last match run" value={formatInventoryMatchRunTime(lastRun)} />
        <DiagnosticRow label="Last matching error" value={lastError?.trim() || "—"} />
        {reason && <DiagnosticRow label="API reason" value={reason} />}
        {diagnostics?.debugBuildMarker && (
          <DiagnosticRow label="debugBuildMarker" value={diagnostics.debugBuildMarker} />
        )}
        {diagnostics?.activeFilterSummary && (
          <DiagnosticRow label="Active filters" value={diagnostics.activeFilterSummary} />
        )}
        {profile && (
          <div className="pt-1 space-y-0.5">
            <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400">
              Persisted profile (source of truth)
            </p>
            <DiagnosticRow label="priceMax" value={profile.priceMax ?? "—"} />
            <DiagnosticRow label="bedsMin" value={profile.bedsMin ?? "—"} />
            <DiagnosticRow
              label="pool"
              value={profile.pool == null ? "(none)" : profile.pool ? "required" : "optional"}
            />
            <DiagnosticRow
              label="hardRequirePool"
              value={profile.hardRequirePool ? "yes" : "no"}
            />
            <DiagnosticRow label="propertyTypes" value={profile.propertyTypes.join(", ") || "—"} />
            <DiagnosticRow label="areas" value={profile.areas.join(", ") || "—"} />
          </div>
        )}
        {diagnostics?.funnelSteps && diagnostics.funnelSteps.length > 0 && (
          <div className="pt-1 space-y-0.5">
            <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400">
              DB match funnel
            </p>
            {diagnostics.funnelSteps.map((step) => (
              <DiagnosticRow key={step.label} label={step.label} value={step.count} />
            ))}
          </div>
        )}
        {diagnostics?.dataQuality && Object.keys(diagnostics.dataQuality).length > 0 && (
          <div className="pt-1 space-y-0.5">
            <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400">
              Data quality (loaded rows)
            </p>
            {Object.entries(diagnostics.dataQuality).map(([key, value]) => (
              <DiagnosticRow key={key} label={key} value={value} />
            ))}
          </div>
        )}
        {diagnostics?.exclusionByReason &&
          Object.keys(diagnostics.exclusionByReason).length > 0 && (
            <div className="pt-1 space-y-0.5">
              <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400">
                Exclusion counts (full DB scan)
              </p>
              {Object.entries(diagnostics.exclusionByReason)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([label, count]) => (
                  <DiagnosticRow key={label} label={label} value={count} />
                ))}
            </div>
          )}
        {diagnostics?.noMatchSummary && (
          <p className="text-[10px] text-gray-600 leading-snug pt-1">{diagnostics.noMatchSummary}</p>
        )}
        {diagnostics?.exclusionSummary && (
          <DiagnosticRow label="Exclusion summary" value={diagnostics.exclusionSummary} />
        )}
        {richSamples.length > 0 && (
          <div className="pt-1 space-y-1">
            <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400">
              Excluded samples (DB, up to 20)
            </p>
            {richSamples.slice(0, 20).map((sample) => (
              <p
                key={sample.listingId}
                className="text-[10px] text-gray-600 leading-snug font-mono break-all"
              >
                {formatFunnelExcludedSampleLine(sample)}
              </p>
            ))}
          </div>
        )}
        {richSamples.length === 0 && legacySamples.length > 0 && (
          <div className="pt-1 space-y-1">
            <p className="text-[9px] uppercase tracking-wide font-medium text-gray-400">
              Excluded samples
            </p>
            {legacySamples.slice(0, 20).map((sample) => (
              <p
                key={sample.listingId}
                className="text-[10px] text-gray-600 leading-snug font-mono break-all"
              >
                {formatListingExclusionLine(sample)}
              </p>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

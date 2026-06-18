import { useQuery } from "@tanstack/react-query";
import { Home, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchInventorySources, fetchInventoryStatus } from "@/lib/inventoryApi";
import { isWorkspaceInventoryConnected } from "@shared/inventory/inventoryWorkspaceConnected";
import { RGE_INVENTORY_SETTINGS_HASH } from "@shared/rgePaths";

export function InventorySidebarSummary() {
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 30_000,
  });

  const { data: sources = [], isLoading: sourcesLoading } = useQuery({
    queryKey: ["/api/inventory/sources"],
    queryFn: fetchInventorySources,
    enabled: !!status?.canUse,
    staleTime: 5_000,
  });

  const isLoading = statusLoading || (status?.canUse && sourcesLoading);
  const connected = isWorkspaceInventoryConnected(sources);
  const connectedSources = sources.filter((s) => s.connectionStatus === "connected");
  const primary = connectedSources[0] ?? sources[0];
  const listingCount = primary?.inventoryStats?.totalSynced ?? primary?.listingCount ?? 0;

  const statusLabel = !status?.canUse
    ? "Unavailable"
    : connected
      ? "Connected"
      : sources.length > 0
        ? "Setup"
        : "Not connected";

  const statusClass = connected
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : sources.length > 0
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <Card data-testid="inventory-sidebar-summary">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="w-4 h-4 text-brand-green" />
          Inventory Sources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <div className="flex items-center text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">Status</span>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                  statusClass,
                )}
              >
                {statusLabel}
              </span>
            </div>
            {primary ? (
              <p className="text-xs text-gray-700 truncate" title={primary.displayName}>
                {primary.displayName}
                {connected && listingCount > 0 ? ` · ${listingCount.toLocaleString()} listings` : ""}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No inventory source connected</p>
            )}
            <Button asChild variant="outline" size="sm" className="h-8 w-full text-xs">
              <a href={`#${RGE_INVENTORY_SETTINGS_HASH}`}>Open inventory settings</a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

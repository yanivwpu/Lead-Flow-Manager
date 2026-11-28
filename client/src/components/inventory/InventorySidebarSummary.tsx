import { useTranslation } from "react-i18next";
import { RGE_INVENTORY_SETTINGS_HASH } from "@shared/rgePaths";
import { useQuery } from "@tanstack/react-query";
import { Home, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { fetchInventorySourcesBundle, fetchInventoryStatus } from "@/lib/inventoryApi";
import { inventorySourcesQueryKey, normalizeInventorySourcesQueryData } from "@/lib/inventorySourceFormState";
import { isWorkspaceInventoryConnected } from "@shared/inventory/inventoryWorkspaceConnected";

export function InventorySidebarSummary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: status, isLoading: statusLoading, isError: statusError } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 30_000,
  });

  const { data: sources = [], isLoading: sourcesLoading, isError: sourcesError } = useQuery({
    queryKey: inventorySourcesQueryKey(user?.id),
    queryFn: fetchInventorySourcesBundle,
    select: (bundle) => normalizeInventorySourcesQueryData(bundle).sources,
    enabled: !!status?.canUse,
    staleTime: 5_000,
  });

  const isLoading = statusLoading || (status?.canUse && sourcesLoading);
  const connected = isWorkspaceInventoryConnected(sources);

  const statusLabel = !status?.canUse
    ? t("rgeApp.inventoryUnavailable")
    : connected
      ? t("rgeApp.connected")
      : sources.length > 0
        ? t("rgeApp.setup")
        : t("rgeApp.notConnected");

  const statusClass = connected
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : sources.length > 0
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <Card data-testid="inventory-sidebar-summary">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Home className="w-4 h-4 text-brand-green" />
          {t("rgeApp.inventorySources")}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 text-sm">
        {statusError || sourcesError ? <p role="alert" className="text-slate-700">{t("rgeApp.statusUnavailable")}</p> : isLoading ? (
          <div className="flex items-center text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />
            {t("common.loading")}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {status?.featureEnabled ? (
              <a href={`#${RGE_INVENTORY_SETTINGS_HASH}`} className="font-medium text-slate-700 underline-offset-4 hover:underline">{t("rgeApp.manageSources")}</a>
            ) : <span className="text-slate-700">{t("rgeApp.listingFeeds")}</span>}
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusClass)}>{statusLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

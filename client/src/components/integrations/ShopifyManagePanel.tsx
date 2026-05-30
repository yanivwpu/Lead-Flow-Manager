import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ShopifyWebhookAdvancedTools } from "./ShopifyWebhookDiagnostics";

export type ShopifyConnectionStatus = {
  connected: boolean;
  shop: string | null;
  syncEnabled: boolean;
  integrationId: string | null;
  uninstalled?: boolean;
};

type Props = {
  onConnect: () => void;
  onDisconnect: (integrationId: string) => void;
  disconnectPending?: boolean;
  onToggleSync: (integrationId: string, isActive: boolean) => void;
  toggleSyncPending?: boolean;
};

export function ShopifyManagePanel({
  onConnect,
  onDisconnect,
  disconnectPending,
  onToggleSync,
  toggleSyncPending,
}: Props) {
  const queryClient = useQueryClient();

  const { data: status, isLoading, isFetching, error } = useQuery<ShopifyConnectionStatus>({
    queryKey: ["/api/shopify/connection-status"],
    queryFn: async () => {
      const res = await fetch("/api/shopify/connection-status", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as ShopifyConnectionStatus & { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Could not load Shopify status");
      }
      return body;
    },
    staleTime: 30_000,
  });

  const connected = !!status?.connected;
  const integrationId = status?.integrationId ?? null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-2">Loading Shopify status…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-gray-600" role="status">
        Could not load Shopify status. Refresh the page and try again.
      </p>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-4" data-testid="shopify-manage-not-connected">
        <div
          className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-sm space-y-2"
          role="status"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-900">Not connected</p>
            <Badge variant="outline" className="text-[10px] border-gray-300 text-gray-700">
              Disconnected
            </Badge>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            {status?.uninstalled
              ? "This workspace is no longer linked to Shopify. Reinstall the app from Shopify Admin to restore order and customer sync."
              : "Install WhachatCRM on your Shopify store to sync customers and orders into your inbox."}
          </p>
          {status?.shop && (
            <p className="text-xs text-gray-500">
              Last known shop: <span className="font-medium text-gray-700">{status.shop}</span>
            </p>
          )}
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto bg-brand-green hover:bg-brand-green/90"
          onClick={onConnect}
          data-testid="button-shopify-reconnect"
        >
          {status?.uninstalled ? "Reconnect Shopify" : "Connect Shopify"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="shopify-manage-connected">
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-4 text-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-emerald-950">Connected</p>
          <Badge className="text-[10px] bg-emerald-600 text-white">Active</Badge>
        </div>
        {status?.shop && (
          <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start text-xs sm:text-sm">
            <span className="text-emerald-800">Shop</span>
            <span className="font-medium text-emerald-950 break-all sm:text-right">{status.shop}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-sm font-medium text-emerald-950">Sync</p>
            <p className="text-xs text-emerald-900/80 mt-0.5">
              {status.syncEnabled
                ? "New Shopify customers and orders sync to WhachatCRM."
                : "Sync is paused — turn on to receive new Shopify events."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={!!status.syncEnabled}
              disabled={!integrationId || toggleSyncPending}
              onCheckedChange={(checked) => {
                if (integrationId) onToggleSync(integrationId, checked);
              }}
              data-testid="switch-shopify-sync"
            />
            <span className={cn("text-xs font-medium", status.syncEnabled ? "text-emerald-900" : "text-gray-500")}>
              {status.syncEnabled ? "On" : "Off"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-600"
          disabled={!integrationId || disconnectPending}
          onClick={() => {
            if (integrationId) onDisconnect(integrationId);
          }}
          data-testid="button-disconnect-shopify"
        >
          Disconnect
        </Button>
        {isFetching && (
          <span className="text-xs text-muted-foreground">Updating status…</span>
        )}
      </div>

      <ShopifyWebhookAdvancedTools
        enabled={connected}
        onReregisterComplete={() => {
          void queryClient.invalidateQueries({ queryKey: ["/api/shopify/connection-status"] });
        }}
      />
    </div>
  );
}

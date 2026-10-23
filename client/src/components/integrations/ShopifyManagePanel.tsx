import { ShopifySupportContact } from "@/components/ShopifySupportContact";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ShopifyWebhookAdvancedTools } from "./ShopifyWebhookDiagnostics";
import { ShopifyEcommerceInboxPreview } from "./ShopifyEcommerceInboxPreview";
import { ShopifySimpleSetup } from "./ShopifySimpleSetup";
import { ShopifyRecoveryConsentDisclosure } from "./ShopifyRecoveryConsentDisclosure";

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
  const { user } = useAuth();

  const { data: status, isLoading, isFetching, error } = useQuery<ShopifyConnectionStatus>({
    queryKey: withUserQueryScope(["/api/shopify/connection-status"], user?.id),
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
              ? "This workspace is no longer linked to Shopify. Reinstall WhachatCRM from the Shopify App Store to restore order and customer sync."
              : "Install WhachatCRM from the Shopify App Store to sync customers and orders into your inbox."}
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-900">Shopify connected</p>
          {status?.shop && <p className="text-xs text-emerald-800 break-all">{status.shop}</p>}
        </div>
        <Badge className="bg-emerald-600 text-white">Connected</Badge>
      </div>

      <ShopifySimpleSetup syncEnabled={!!status.syncEnabled} />
      <ShopifyRecoveryConsentDisclosure shop={status.shop} />

      <details className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
        data-testid="shopify-advanced-settings">
        <summary className="cursor-pointer font-medium text-slate-700">Settings & advanced</summary>
        <div className="mt-4 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-900">Order & customer sync</p>
              <p className="text-xs text-slate-500">{status.syncEnabled ? "On" : "Paused"}</p>
            </div>
            <Switch checked={!!status.syncEnabled}
              disabled={!integrationId || toggleSyncPending}
              onCheckedChange={checked => {
                if (integrationId) onToggleSync(integrationId, checked);
              }}
              data-testid="switch-shopify-sync"/>
          </div>
          <ShopifySupportContact manage />
          <details className="border-t border-slate-200 pt-3">
            <summary className="cursor-pointer text-slate-600">Technical details</summary>
            <div className="mt-3 space-y-4">
              <ShopifyEcommerceInboxPreview />
              <ShopifyWebhookAdvancedTools enabled={connected}
                onReregisterComplete={() => {
                  void queryClient.invalidateQueries({queryKey:["/api/shopify/connection-status"]});
                }}/>
            </div>
          </details>
          <div className="border-t border-slate-200 pt-3">
            <Button type="button" variant="outline" size="sm"
              className="text-red-600 hover:bg-red-50"
              disabled={!integrationId || disconnectPending}
              onClick={() => {if (integrationId) onDisconnect(integrationId);}}
              data-testid="button-disconnect-shopify">Disconnect Shopify</Button>
          </div>
          {isFetching && <p className="text-xs text-slate-500">Updating…</p>}
        </div>
      </details>
    </div>
  );
}

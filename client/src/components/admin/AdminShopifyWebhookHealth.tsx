import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ShopifyShopWebhookSummary } from "@shared/shopifyWebhookHealth";
import { ShopifyWebhookHealthSummary } from "../integrations/ShopifyWebhookHealthSummary";

/** Compact read-only section in the existing Users tab, fetched only when opened. */
export function AdminShopifyWebhookHealth({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const query = useQuery<{ shops: ShopifyShopWebhookSummary[] }>({
    queryKey: ["/api/shopify/webhooks/health/all"], enabled: enabled && open, retry: false,
    queryFn: async () => {
      const token = localStorage.getItem("whachat_admin_token");
      const response = await fetch("/api/shopify/webhooks/health/all", { credentials: "include", headers: token ? { "x-admin-token": token } : {} });
      if (!response.ok) throw new Error("Verification Unavailable — could not audit Shopify shops");
      return response.json();
    },
  });
  return <details className="mb-4 rounded border p-3" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Shopify webhook health (read-only)</summary>
    <button type="button" className="my-2 underline text-xs" onClick={() => query.refetch()} disabled={query.isFetching}>Refresh verification</button>
    {query.isFetching && <p>Verifying Shopify registrations…</p>}
    {query.error && <p role="status">{query.error.message}</p>}
    {query.data?.shops.length === 0 && <p>No connected Shopify shops.</p>}
    {query.data?.shops.map(shop => <details key={shop.userId} className="border-t py-2">
      <summary>{shop.shop}: {shop.status ?? "Verification Unavailable"}</summary>
      {shop.report ? <ShopifyWebhookHealthSummary report={shop.report} /> : <p>{shop.error ?? "Verification unavailable"}</p>}
    </details>)}
  </details>;
}

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { Button } from "@/components/ui/button";

type InboxPreview = {
  ok: true;
  mode: "recording" | "paused";
  total: number;
  pending: number;
  lastEventAt: string | null;
  messagingEnabled: false;
  checkoutEnabled: false;
  journeys: { orderSupport: number; fulfillmentSupport: number; orderCancelled: number };
};

/** Read-only and staging-only. Does not install, activate, or send anything. */
export function ShopifyEcommerceInboxPreview() {
  const { user } = useAuth();
  const visible = window.location.hostname === "whachatcrm-staging-app-staging.up.railway.app";
  const { data, error, isLoading, isFetching, refetch } = useQuery<InboxPreview>({
    queryKey: withUserQueryScope(["/api/shopify/ecommerce/event-inbox-preview"], user?.id),
    enabled: visible && !!user?.id,
    queryFn: async () => {
      const response = await fetch("/api/shopify/ecommerce/event-inbox-preview", { credentials: "include" });
      if (!response.ok) throw Error("Preview temporarily unavailable");
      return response.json() as Promise<InboxPreview>;
    },
    staleTime: 30_000,
    retry: false,
  });
  if (!visible || !user?.id) return null;
  return (
    <section className="rounded-lg border border-slate-200 p-4 space-y-3 text-sm" data-testid="ecommerce-event-inbox-preview">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">E-commerce Growth Engine · staging preview</p>
          <p className="text-xs text-muted-foreground">Order-event recording only. No automatic messages or checkout actions.</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          Refresh
        </Button>
      </div>
      {isLoading && <p className="text-xs">Reading staging event inbox…</p>}
      {error && <p className="text-xs text-muted-foreground">Could not read preview. Existing order sync is unaffected.</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-xs">
            <div><p className="text-muted-foreground">Recording mode</p><p className="font-medium">{data.mode === "recording" ? "Enabled (staging)" : "Paused"}</p></div>
            <div><p className="text-muted-foreground">Recorded events</p><p className="font-medium tabular-nums">{data.total}</p></div>
            <div><p className="text-muted-foreground">Pending review</p><p className="font-medium tabular-nums">{data.pending}</p></div>
            <div className="col-span-2 sm:col-span-3 text-muted-foreground">
              {data.lastEventAt ? `Last recorded: ${new Date(data.lastEventAt).toLocaleString()}` : "No verified order event has been recorded yet."}
            </div>
          </div>
          <details className="border-t border-slate-200 pt-3" data-testid="ecommerce-journey-review-preview">
            <summary className="cursor-pointer text-xs font-medium">Workflow previews · review only</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                {
                  key: "orderSupport" as const,
                  name: "New order support",
                  trigger: "orders/create",
                  description: "Review order questions and plan customer support follow-up.",
                  integrated: true,
                },
                {
                  key: "fulfillmentSupport" as const,
                  name: "Fulfillment assistance",
                  trigger: "orders/fulfilled",
                  description: "Help with delivery questions after a confirmed fulfillment event.",
                  integrated: false,
                },
                {
                  key: "orderCancelled" as const,
                  name: "Cancellation assistance",
                  trigger: "orders/cancelled",
                  description: "Review cancellations and prepare help options when appropriate.",
                  integrated: false,
                },
              ].map(journey => (
                <div key={journey.key} className="rounded-md border border-slate-200 bg-white p-3 text-xs space-y-1">
                  <p className="font-medium">{journey.name}</p>
                  <p className="text-muted-foreground">{journey.description}</p>
                  <p>Events recorded: <strong className="tabular-nums">{data.journeys?.[journey.key] ?? 0}</strong></p>
                  <p className="text-muted-foreground">Trigger: {journey.trigger}</p>
                  <p className="text-muted-foreground">{journey.integrated ? "Staging event capture connected" : "Not subscribed or wired yet"}</p>
                  <p className="text-muted-foreground">No messages queued or sent</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">No workflow is active. Before any future messaging: verify merchant opt-in, recipient consent, opt-outs, approved templates, channel rules and delivery deduplication.</p>
          </details>
        </>
      )}
    </section>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ArrowRight, ShoppingBag, RotateCcw } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";

type SupportStatus = {
  ok: true;
  internalTasks: {
    schemaReady: boolean;
    merchantEnabled: boolean;
    operatorEnabled: boolean;
    openCount: number;
    completedCount: number;
  };
};
const STAGING_HOST = "whachatcrm-staging-app-staging.up.railway.app";

/** Simple merchant surface. The server performs all prerequisites atomically.
 * No customer sends, checkout or unverified journeys are exposed.
 */
export function ShopifySimpleSetup({ syncEnabled }: { syncEnabled: boolean }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const visible = typeof window !== "undefined" && window.location.hostname === STAGING_HOST;
  const queryKey = withUserQueryScope(["/api/shopify/ecommerce/event-inbox-preview"],user?.id);
  const { data, isLoading, isFetching, isError, refetch } = useQuery<SupportStatus>({
    queryKey,
    enabled: visible && !!user?.id,
    retry:false,
    staleTime:15_000,
    queryFn:async () => {
      const response = await fetch("/api/shopify/ecommerce/event-inbox-preview",{credentials:"include"});
      if (!response.ok) throw Error("Could not load order support");
      return response.json() as Promise<SupportStatus>;
    }
  });
  const start = useMutation({
    mutationFn:async () => {
      const response = await fetch("/api/shopify/ecommerce/order-support-quick-start",{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"start_order_support"})
      });
      if (!response.ok) throw Error("Could not start order support");
    },
    onSuccess:async () => { await client.invalidateQueries({queryKey}); }
  });
  const pause = useMutation({
    mutationFn:async () => {
      const response = await fetch("/api/shopify/ecommerce/order-support-settings",{
        method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"set_internal_order_tasks",enabled:false})
      });
      if (!response.ok) throw Error("Could not pause order support");
    },
    onSuccess:async () => { await client.invalidateQueries({queryKey}); }
  });

  if (!visible || !user?.id) return null;
  const status = data?.internalTasks;
  const running = !!status?.merchantEnabled && !!status?.operatorEnabled && syncEnabled;
  const loading = isLoading || isFetching || start.isPending || pause.isPending;
  const ready = !!status?.schemaReady && !!status?.operatorEnabled && syncEnabled;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4" data-testid="shopify-simple-setup">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <ShoppingBag className="h-5 w-5 text-emerald-700" aria-hidden="true"/>
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">Order support</h3>
          <p className="text-sm text-slate-600">Get a task in WhachatCRM for every new Shopify order.</p>
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500" role="status">Checking setup…</p>
      ) : isError ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-600">Setup status unavailable.</p>
          <Button type="button" variant="outline" size="sm" onClick={()=>void refetch()}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true"/> Retry
          </Button>
        </div>
      ) : running ? (
        <div className="space-y-3" data-testid="shopify-order-support-on">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true"/> On — new orders create tasks
            </span>
            <span className="text-xs text-slate-500">
              {status?.openCount ?? 0} open · {status?.completedCount ?? 0} completed
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={()=>navigate("/app/followups")}
              data-testid="shopify-open-tasks">
              View tasks <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true"/>
            </Button>
            <Button type="button" variant="outline" disabled={loading}
              onClick={()=>pause.mutate()} data-testid="shopify-pause-order-support">Pause</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2" data-testid="shopify-order-support-off">
          <Button type="button" disabled={!ready || loading} onClick={()=>start.mutate()}
            data-testid="shopify-start-order-support">Turn on order support</Button>
          {!syncEnabled ? <p className="text-xs text-slate-500">Turn on Shopify sync in Settings first.</p> :
            !status?.schemaReady || !status?.operatorEnabled
              ? <p className="text-xs text-slate-500">Order support is being prepared.</p>
              : <p className="text-xs text-slate-500">Creates internal tasks only. No customer messages.</p>}
        </div>
      )}
      {(start.isError || pause.isError) &&
        <p className="text-xs text-red-700" role="alert">Couldn't save your change. Try again.</p>}
    </section>
  );
}

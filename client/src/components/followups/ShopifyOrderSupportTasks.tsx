import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ShoppingBag, CheckCircle2, ArrowUpRight, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { Button } from "@/components/ui/button";

type ShopifyTask = {
  id: string;
  state: "open" | "completed";
  createdAt: string;
  contactId: string;
  contactName: string;
};
type ShopifyTaskPreview = {
  ok: true;
  messagingEnabled: false;
  checkoutEnabled: false;
  internalTasks: {
    schemaReady: boolean;
    merchantEnabled: boolean;
    operatorEnabled: boolean;
    openCount: number;
    completedCount: number;
    items: ShopifyTask[];
  };
};
export const SHOPIFY_STAGING_HOST = "whachatcrm-staging-app-staging.up.railway.app";

/**
 * Bridge existing, separately persisted E-commerce order support tasks into the
 * normal Tasks list. No writes to contacts.followUp/contacts.followUpDate,
 * no separate task insertion, no automatic sends, and no Shopify API calls.
 *
 * Production is deliberately invisible until the E-commerce Growth Engine
 * release and merchant-tenant authorization are separately approved.
 */
export function ShopifyOrderSupportTasks() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const staging = typeof window !== "undefined" && window.location.hostname === SHOPIFY_STAGING_HOST;
  const queryKey = withUserQueryScope(["/api/shopify/ecommerce/event-inbox-preview"], user?.id);

  const { data, isLoading, error, isFetching, refetch } = useQuery<ShopifyTaskPreview | null>({
    queryKey,
    enabled: staging && !!user?.id,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const response = await fetch("/api/shopify/ecommerce/event-inbox-preview", { credentials: "include" });
      // Not connected or not a staging merchant: do not show E-commerce controls.
      if (response.status === 403 || response.status === 404) return null;
      if (!response.ok) throw new Error("Shopify task list temporarily unavailable");
      return response.json() as Promise<ShopifyTaskPreview>;
    },
  });
  const complete = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch("/api/shopify/ecommerce/order-support-task-complete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_internal_order_task", taskId: id }),
      });
      if (!response.ok) throw new Error("Could not complete the Shopify support task");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  if (!staging || !user?.id) return null;
  const tasks = data?.internalTasks;
  const openTasks = (tasks?.items ?? []).filter(task => task.state === "open");
  if (!isLoading && !error && (!data || !tasks?.schemaReady || (!tasks.openCount && !tasks.completedCount))) return null;

  return (
    <section className="max-w-3xl mb-6 rounded-xl border border-slate-200 bg-white p-4 md:p-5" data-testid="followups-shopify-order-support">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-slate-600" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-slate-900">Shopify order-support tasks</h2>
            <p className="text-xs text-slate-500">Internal merchant tasks · separate from contact follow-up reminders</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm"
          disabled={isFetching || complete.isPending}
          onClick={() => { void refetch(); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" /> Refresh
        </Button>
      </div>
      {isLoading && <p className="mt-3 text-sm text-slate-500">Loading Shopify tasks…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">Shopify task list unavailable. Existing contact follow-ups are unaffected.</p>}
      {tasks?.schemaReady && (
        <>
          <p className="text-xs text-slate-500 mt-3 mb-2" data-testid="shopify-task-counts">
            Open: {tasks.openCount} · Completed: {tasks.completedCount}
          </p>
          {openTasks.length === 0 && <p className="text-sm text-slate-500">No open Shopify support tasks.</p>}
          <div className="space-y-2">
            {openTasks.map(task => (
              <div key={task.id} className="flex flex-wrap justify-between items-center gap-3 rounded-lg border border-slate-200 p-3" data-testid={`shopify-followup-task-${task.id}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">New order support</p>
                  <p className="text-xs text-slate-500">{task.contactName || "Shopify customer"} · {new Date(task.createdAt).toLocaleString()}</p>
                  {task.contactId && (
                    <button type="button" className="text-xs text-blue-700 hover:underline inline-flex items-center gap-1 mt-1"
                      onClick={() => setLocation(`/app/contacts/${task.contactId}`)}
                      data-testid={`shopify-task-contact-${task.id}`}>
                      View CRM contact <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm"
                  disabled={complete.isPending || isFetching}
                  onClick={() => complete.mutate(task.id)}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Complete
                </Button>
              </div>
            ))}
          </div>
          {complete.isError && <p role="alert" className="mt-2 text-sm text-red-700">Could not complete this task. Refresh and try again.</p>}
          <p className="text-xs text-slate-500 mt-3">Completing a task does not review the Shopify event, change the Shopify order or send a message.</p>
        </>
      )}
    </section>
  );
}

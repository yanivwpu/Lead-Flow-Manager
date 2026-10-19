import { useMutation, useQuery } from "@tanstack/react-query";
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
  reviewQueue: Array<{ id: string; topic: string; journey: string; receivedAt: string }>;
  workflowDrafts: Record<"orderSupport" | "fulfillmentSupport" | "orderCancelled" | "abandonedCart", boolean>;
  internalTasks: {
    schemaReady: boolean;
    merchantEnabled: boolean;
    operatorEnabled: boolean;
    openCount: number;
    completedCount: number;
    items: Array<{id:string;state:string;createdAt:string}>;
  };
};

/** Staging-only internal triage. Never installs workflows or sends to customers. */
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
  const review = useMutation({
    mutationFn: async (eventId: string) => {
      const response = await fetch("/api/shopify/ecommerce/event-review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_reviewed", eventId }),
      });
      if (!response.ok) throw new Error("Review could not be saved. Refresh and try again.");
    },
    onSuccess: async () => { await refetch(); },
  });
  const drafts = useMutation({
    mutationFn: async (input: { journey: "orderSupport" | "fulfillmentSupport" | "orderCancelled" | "abandonedCart"; prepared: boolean }) => {
      const response = await fetch("/api/shopify/ecommerce/workflow-draft", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({action:"save_draft", ...input}),
      });
      if (!response.ok) throw Error("Draft could not be saved. Refresh and try again.");
    },
    onSuccess: async () => { await refetch(); },
  });
  const orderTasks = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch("/api/shopify/ecommerce/order-support-settings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({action:"set_internal_order_tasks",enabled}),
      });
      if (!response.ok) throw Error("Task setting could not be saved. Refresh and try again.");
    },
    onSuccess: async () => { await refetch(); },
  });
  const completeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch("/api/shopify/ecommerce/order-support-task-complete", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({action:"complete_internal_order_task",taskId}),
      });
      if (!response.ok) throw Error("Task could not be completed. Refresh and try again.");
    },
    onSuccess: async () => { await refetch(); },
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
          <div className="border-t border-slate-200 pt-3 space-y-2" data-testid="ecommerce-manual-triage">
            <p className="text-xs font-medium">Order-event review queue · manual only</p>
            <p className="text-xs text-muted-foreground">Acknowledging an event closes this staging review item. It does not contact the customer, fulfill orders or run an automation.</p>
            {(data.reviewQueue ?? []).length === 0 && <p className="text-xs text-muted-foreground">No events waiting for review.</p>}
            {(data.reviewQueue ?? []).map(event => (
              <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                <div className="text-xs">
                  <p className="font-medium">{event.journey === "order_support" ? "New order support" : event.journey === "fulfillment_support" ? "Fulfillment assistance" : "Cancellation assistance"}</p>
                  <p className="text-muted-foreground">{event.topic} · {new Date(event.receivedAt).toLocaleString()}</p>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={review.isPending || isFetching}
                  onClick={() => review.mutate(event.id)}>Mark reviewed</Button>
              </div>
            ))}
            {review.isError && <p role="alert" className="text-xs text-red-700">Review could not be saved. Refresh and try again.</p>}
          </div>
          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs" data-testid="ecommerce-internal-order-support-tasks">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-sm">Internal order-support tasks</p>
                <p className="text-muted-foreground">Create merchant tasks from future verified orders only. No customer messages or order changes.</p>
              </div>
              {data.internalTasks?.schemaReady && (
                <Button type="button" size="sm" variant="outline"
                  disabled={orderTasks.isPending || isFetching ||
                    (!data.internalTasks.merchantEnabled && !data.workflowDrafts?.orderSupport)}
                  onClick={() => orderTasks.mutate(!data.internalTasks.merchantEnabled)}>
                  {data.internalTasks.merchantEnabled ? "Pause internal tasks" : "Opt in to internal tasks"}
                </Button>
              )}
            </div>
            {!data.internalTasks?.schemaReady ? (
              <p className="text-muted-foreground">Staging database setup pending. Internal tasks are unavailable and cannot be enabled.</p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {data.internalTasks.merchantEnabled ?
                    (data.internalTasks.operatorEnabled ? "Merchant opt-in active · staging execution gate open" :
                    "Merchant opt-in saved · execution still paused by operator") :
                    "Internal tasks paused. Prepare the new order support draft before opting in."}
                </p>
                <p className="text-muted-foreground">Open tasks: {data.internalTasks.openCount} · Completed: {data.internalTasks.completedCount}</p>
                {data.internalTasks.items.length === 0 && <p className="text-muted-foreground">No internal tasks yet. Earlier order events are not automatically backfilled.</p>}
                {data.internalTasks.items.map(task => (
                  <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                    <div>
                      <p className="font-medium">Shopify order support · {task.state === "open" ? "Open" : "Completed"}</p>
                      <p className="text-muted-foreground">Created {new Date(task.createdAt).toLocaleString()}</p>
                    </div>
                    {task.state === "open" && (
                      <Button type="button" size="sm" variant="outline" disabled={completeTask.isPending || isFetching}
                        onClick={() => completeTask.mutate(task.id)}>Mark task completed</Button>
                    )}
                  </div>
                ))}
              </>
            )}
            {(orderTasks.isError || completeTask.isError) &&
              <p role="alert" className="text-red-700">Task change could not be saved. Refresh and try again.</p>}
            <p className="text-muted-foreground">Task opt-in does not activate messaging, checkout, fulfillment or cancellation workflows.</p>
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
                {
                  key: "abandonedCart" as const,
                  name: "Abandoned-cart recovery",
                  trigger: "no subscribed cart/checkout event",
                  description: "Future consent-safe recovery journey; checkout abandonment is not wired.",
                  integrated: false,
                },
              ].map(journey => (
                <div key={journey.key} className="rounded-md border border-slate-200 bg-white p-3 text-xs space-y-1">
                  <p className="font-medium">{journey.name}</p>
                  <p className="text-muted-foreground">{journey.description}</p>
                  <p>Events recorded: <strong className="tabular-nums">{journey.key === "abandonedCart" ? 0 : (data.journeys?.[journey.key] ?? 0)}</strong></p>
                  <p className="text-muted-foreground">Trigger: {journey.trigger}</p>
                  <p className="text-muted-foreground">{journey.integrated ? "Staging event capture connected" : "Not subscribed or wired yet"}</p>
                  <p className="text-muted-foreground">No messages queued or sent</p>
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <span className="text-muted-foreground">{data.workflowDrafts?.[journey.key] ? "Draft prepared · inactive" : "Not prepared"}</span>
                    <Button type="button" size="sm" variant="outline"
                      disabled={drafts.isPending || isFetching}
                      onClick={() => drafts.mutate({journey:journey.key,prepared:!data.workflowDrafts?.[journey.key]})}>
                      {data.workflowDrafts?.[journey.key] ? "Remove draft" : "Prepare draft"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">No workflow is active. Saving a draft does not enable any workflow or message. Before any future messaging: verify merchant opt-in, recipient consent, opt-outs, approved templates, channel rules and delivery deduplication.</p>
            {drafts.isError && <p role="alert" className="mt-2 text-xs text-red-700">Draft could not be saved. Refresh and try again.</p>}
          </details>
        </>
      )}
    </section>
  );
}

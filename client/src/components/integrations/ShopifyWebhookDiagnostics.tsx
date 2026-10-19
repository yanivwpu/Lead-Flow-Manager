import { ShopifyWebhookHealthSummary } from "./ShopifyWebhookHealthSummary";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type {
  ShopifyWebhookHealthReport,
} from "@shared/shopifyWebhookHealth";

type HealthResponse = {
  ok: boolean;
  report?: ShopifyWebhookHealthReport;
  error?: string;
};

type ReregisterResponse = {
  ok: boolean;
  report: ShopifyWebhookHealthReport;
  attempts: Array<{ topic: string; status: string; message?: string }>;
};

type DiagnosticsBodyProps = {
  enabled: boolean;
  onReregisterComplete?: () => void;
};

function ShopifyWebhookDiagnosticsBody({ enabled, onReregisterComplete }: DiagnosticsBodyProps) {
  const queryClient = useQueryClient();
  const [lastAttempts, setLastAttempts] = useState<ReregisterResponse["attempts"] | null>(null);

  const { data, isLoading, isFetching, refetch, error } = useQuery<HealthResponse>({
    queryKey: ["/api/shopify/webhooks/health"],
    enabled,
    queryFn: async () => {
      const res = await fetch("/api/shopify/webhooks/health", { credentials: "include" });
      const body = (await res.json().catch(() => ({}))) as HealthResponse;
      if (!res.ok) {
        return {
          ok: false,
          error: body.error || "Could not load webhook health",
          report: undefined,
        };
      }
      return body;
    },
    staleTime: 30_000,
    retry: false,
  });

  const reregisterMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/webhooks/reregister", {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as ReregisterResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error || "Re-registration failed");
      }
      return body;
    },
    onSuccess: (result) => {
      setLastAttempts(result.attempts);
      queryClient.setQueryData(["/api/shopify/webhooks/health"], {
        ok: true,
        report: result.report,
      });
      onReregisterComplete?.();
      const blocked = result.attempts.filter(
        (a) =>
          a.status === "failed" ||
          a.status === "skipped_verification" ||
          a.status === "skipped_scope" ||
          a.status === "skipped_protected_data",
      ).length;
      toast({
        title: blocked > 0 ? "Webhooks partially registered" : "Webhooks updated",
        description:
          blocked > 0
            ? "Some topics could not be registered. Review scope and protected data notes below."
            : "Shopify webhook subscriptions were refreshed.",
        variant: blocked > 0 ? "destructive" : "default",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not re-register webhooks",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const report = data?.report;
  const panelHealthy = report?.summary.healthy ?? false;
  // A configured app-level commerce webhook cannot be repaired with a per-shop mutation.
  const perShopActionable = report?.webhooks.some(item => item.registrationMethod === "graphql" &&
    ["missing", "wrong_url", "blocked_shopify"].includes(item.status)) ?? false;
  const inlineError = data?.error || (error as Error | null)?.message;

  return (
    <div
      className={cn(
        "rounded-md border p-3 text-sm space-y-3",
        !report
          ? "border-gray-200 bg-gray-50/80"
          : panelHealthy
            ? "border-emerald-100 bg-emerald-50/80"
            : "border-amber-200 bg-amber-50/80",
      )}
      data-testid="shopify-webhook-diagnostics"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className={cn(
              "font-medium",
              !report ? "text-gray-900" : panelHealthy ? "text-emerald-900" : "text-amber-950",
            )}
          >
            Webhook registration
          </p>
          {report?.shop && (
            <p
              className={cn(
                "text-xs mt-0.5",
                panelHealthy ? "text-emerald-800/90" : "text-amber-900/90",
              )}
            >
              {report.shop}
            </p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={isFetching || reregisterMutation.isPending}
            onClick={() => refetch()}
            data-testid="button-shopify-webhook-refresh"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={reregisterMutation.isPending || isLoading || !report || report.permissionVerification === "unknown" || !perShopActionable}
            onClick={() => reregisterMutation.mutate()}
            data-testid="button-shopify-webhook-reregister"
          >
            {reregisterMutation.isPending ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Registering…
              </>
            ) : (
              "Re-register webhooks"
            )}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Checking Shopify webhooks…</p>}

      {inlineError && !isLoading && (
        <p className="text-xs text-gray-700" role="status">
          {inlineError}
        </p>
      )}

      {report && !perShopActionable && <p className="text-xs text-muted-foreground">No per-shop registration change is indicated. App-managed subscriptions must be checked in the active Shopify app version and delivery logs.</p>}
      {report && <ShopifyWebhookHealthSummary report={report} />}
      {lastAttempts && <div className="text-xs">Last registration attempts: {lastAttempts.map(a => `${a.topic}: ${a.status}${a.message ? ` — ${a.message}` : ""}`).join("; ")}</div>}

    </div>
  );
}

type AdvancedToolsProps = {
  enabled: boolean;
  onReregisterComplete?: () => void;
};

/** Collapsed by default; auto-expanded in local dev. Only mount when Shopify is linked. */
export function ShopifyWebhookAdvancedTools({ enabled, onReregisterComplete }: AdvancedToolsProps) {
  const [open, setOpen] = useState(import.meta.env.DEV);

  if (!enabled) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pt-2 border-t border-gray-100">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-gray-600 hover:text-gray-900 -ml-2"
          data-testid="button-shopify-advanced-toggle"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 mr-1 transition-transform", open && "rotate-90")} />
          Advanced — webhook health &amp; registration
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <ShopifyWebhookDiagnosticsBody enabled={enabled} onReregisterComplete={onReregisterComplete} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** @deprecated Use ShopifyWebhookAdvancedTools inside ShopifyManagePanel */
export function ShopifyWebhookDiagnostics() {
  return <ShopifyWebhookDiagnosticsBody enabled={true} />;
}

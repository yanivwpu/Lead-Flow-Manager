import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type {
  ShopifyWebhookHealthItem,
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

function statusBadge(item: ShopifyWebhookHealthItem) {
  switch (item.status) {
    case "registered":
      return (
        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-200">
          Registered
        </Badge>
      );
    case "app_config":
      return (
        <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-800 border-blue-200">
          App config
        </Badge>
      );
    case "blocked_scope":
      return (
        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-900 border-amber-200">
          Scope required
        </Badge>
      );
    case "wrong_url":
      return (
        <Badge variant="outline" className="text-[10px] bg-red-50 text-red-800 border-red-200">
          Wrong URL
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-900 border-amber-200">
          Missing
        </Badge>
      );
  }
}

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
  const graphqlWebhooks = report?.webhooks.filter((w) => w.registrationMethod === "graphql") ?? [];
  const appConfigWebhooks = report?.webhooks.filter((w) => w.registrationMethod === "app_toml") ?? [];
  const panelHealthy = report?.summary.healthy ?? false;
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
            disabled={reregisterMutation.isPending || isLoading}
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

      {report && (
        <>
          <div className="rounded border border-white/60 bg-white/50 px-2 py-2 text-xs space-y-1">
            <p className="font-medium text-gray-900">OAuth scopes</p>
            <p className="text-muted-foreground">
              Requested: {(report.oauthScopesRequested ?? report.ordersCreateAudit.oauthScopesRequested).join(", ")}
            </p>
            <p className="text-muted-foreground">
              Granted on shop: {report.grantedScopes.join(", ") || "unknown"}
            </p>
            {report.ordersCreateAudit.missingGrantedScopes.length > 0 && (
              <p className="text-amber-900" role="status">
                Missing on shop: {report.ordersCreateAudit.missingGrantedScopes.join(", ")} — reinstall or approve
                scopes in Shopify Admin.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Per-shop webhooks</p>
            {graphqlWebhooks.map((item) => (
              <div key={item.topic} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium min-w-[120px]">{item.label}</span>
                {statusBadge(item)}
                {item.scopeNotes && <span className="text-muted-foreground">{item.scopeNotes}</span>}
              </div>
            ))}
          </div>

          {report.ordersCreateAudit && (
            <div className="rounded border border-amber-200/80 bg-white/60 px-2 py-2 text-xs space-y-1">
              <p className="font-medium text-gray-900">Orders webhook (ORDERS_CREATE)</p>
              <p className="text-gray-700 leading-snug">{report.ordersCreateAudit.note}</p>
              {report.ordersCreateAudit.protectedCustomerDataApprovalRequired && (
                <p className="text-muted-foreground leading-snug">
                  Protected Customer Data approval is required for order webhooks in Partner Dashboard.
                </p>
              )}
              {report.ordersCreateAudit.registrationBlockedReason !== "none" && (
                <p className="text-amber-900 capitalize">
                  Blocked: {report.ordersCreateAudit.registrationBlockedReason.replace(/_/g, " ")}
                </p>
              )}
            </div>
          )}

          {lastAttempts && lastAttempts.length > 0 && (
            <div className="rounded border border-gray-200 bg-white/60 px-2 py-2 text-xs space-y-1">
              <p className="font-medium text-gray-900">Last registration attempt</p>
              {lastAttempts.map((attempt) => (
                <div key={attempt.topic} className="flex flex-wrap gap-2">
                  <span className="font-medium">{attempt.topic}</span>
                  <span className="text-muted-foreground">{attempt.status.replace(/_/g, " ")}</span>
                  {attempt.message && <span className="text-muted-foreground">{attempt.message}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">App config (deploy + GDPR)</p>
            {appConfigWebhooks.map((item) => (
              <div key={item.topic} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium min-w-[120px]">{item.label}</span>
                {statusBadge(item)}
              </div>
            ))}
          </div>

          {!panelHealthy && (
            <p className="text-xs text-amber-900 leading-snug">
              Required webhooks are missing or misconfigured. Use Re-register webhooks after confirming your shop is
              linked.
            </p>
          )}
        </>
      )}
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

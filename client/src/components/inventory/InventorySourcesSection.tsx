import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildMlsSourcePayload,
  fetchInventorySources,
  fetchInventoryStatus,
  formatInventorySyncStatus,
  type PublicInventorySource,
} from "@/lib/inventoryApi";
import { Home, RefreshCw, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { RGE_TEMPLATE_DETAIL_PATH } from "@shared/rgePaths";

type Props = {
  variant?: "section" | "compact";
  className?: string;
};

const EMPTY_FORM = {
  displayName: "MLS inventory",
  originatingSystemName: "",
  accessToken: "",
};

function connectionBadgeClass(status: string): string {
  if (status === "connected") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "error") return "bg-red-50 text-red-800 border-red-200";
  if (status === "running" || status === "configuring") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-gray-50 text-gray-700 border-gray-200";
}

function loadFormFromSource(source: PublicInventorySource | undefined) {
  if (!source) return { ...EMPTY_FORM, accessToken: "" };
  const cfg = source.config || {};
  return {
    displayName: source.displayName || "MLS inventory",
    originatingSystemName:
      typeof cfg.originatingSystemName === "string" ? cfg.originatingSystemName : "",
    accessToken: "",
  };
}

export function InventorySourcesSection({ variant = "section", className }: Props) {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 30_000,
  });

  const sourcesEnabled = !!status?.canUse;

  const {
    data: sources = [],
    isLoading: sourcesLoading,
    refetch: refetchSources,
  } = useQuery({
    queryKey: ["/api/inventory/sources"],
    queryFn: fetchInventorySources,
    enabled: sourcesEnabled,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const list = query.state.data as PublicInventorySource[] | undefined;
      const mls = list?.find((s) => s.provider === "mls_grid");
      return mls?.lastSyncStatus === "running" ? 4_000 : false;
    },
  });

  const mlsSource = useMemo(
    () => sources.find((s) => s.provider === "mls_grid"),
    [sources],
  );

  useEffect(() => {
    if (mlsSource) {
      setForm(loadFormFromSource(mlsSource));
    }
  }, [mlsSource?.id, mlsSource?.updatedAt]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isUpdate = !!mlsSource;
      const payload = buildMlsSourcePayload(form, isUpdate);
      if (!payload.config.originatingSystemName) {
        throw new Error("MLS / originating system name is required");
      }
      if (!isUpdate && !payload.credentials?.accessToken) {
        throw new Error("Access token is required");
      }
      if (isUpdate) {
        const res = await apiRequest("PATCH", `/api/inventory/sources/${mlsSource!.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/inventory/sources", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      setForm((f) => ({ ...f, accessToken: "" }));
      toast({ title: "Inventory source saved", description: "Your MLS inventory connection settings were updated." });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save inventory source",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!mlsSource) throw new Error("Save your inventory source before validating");
      const res = await apiRequest("POST", `/api/inventory/sources/${mlsSource.id}/validate`);
      return res.json() as Promise<{ ok: boolean; message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      toast({
        title: data.ok ? "Connection verified" : "Validation failed",
        description: data.message || (data.ok ? "MLS inventory connection is ready." : "Check your credentials."),
        variant: data.ok ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Validation failed",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!mlsSource) throw new Error("Save your inventory source before syncing");
      const res = await fetch(`/api/inventory/sources/${mlsSource.id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        throw new Error(body.error || "Sync already in progress");
      }
      if (!res.ok) {
        throw new Error(body.error || `Sync failed (${res.status})`);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      toast({
        title: "Sync started",
        description: "Listing inventory is syncing in the background. Refresh status in a moment.",
      });
      void refetchSources();
    },
    onError: (err: Error) => {
      toast({
        title: "Could not start sync",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!mlsSource) return;
      await apiRequest("DELETE", `/api/inventory/sources/${mlsSource.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      setForm(EMPTY_FORM);
      toast({ title: "Inventory source removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not remove source",
        description: err.message.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  if (statusLoading) {
    return null;
  }

  if (!status?.featureEnabled) {
    return null;
  }

  const isCompact = variant === "compact";
  const syncRunning = mlsSource?.lastSyncStatus === "running";
  const lastSyncAt = mlsSource?.lastSyncAt ? new Date(mlsSource.lastSyncAt).toLocaleString() : null;
  const seenInLastSync =
    typeof mlsSource?.lastSyncStats?.seenCount === "number"
      ? (mlsSource.lastSyncStats.seenCount as number)
      : null;

  const inner = (
    <div className={cn("space-y-4", className)}>
      {!status.rgeInstalled && (
        <Alert className="border-amber-200 bg-amber-50/80">
          <AlertCircle className="h-4 w-4 text-amber-800" />
          <AlertTitle className="text-amber-950">Realtor Growth Engine required</AlertTitle>
          <AlertDescription className="text-amber-900/90 text-sm">
            Install the Realtor Growth Engine to connect MLS listing inventory.{" "}
            <Link href={RGE_TEMPLATE_DETAIL_PATH} className="font-medium underline underline-offset-2">
              Open Growth Engine
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {status.canUse && (
        <>
          <p className={cn("text-sm text-muted-foreground", isCompact && "text-xs")}>
            Sync active listings from your MLS feed for buyer matching and inventory intelligence (coming soon).
            Showcase IDX remains for leads and activity only.
          </p>

          {sourcesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading inventory source…
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2 sm:max-w-md">
                  <Label htmlFor="inventory-display-name">Display name</Label>
                  <Input
                    id="inventory-display-name"
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    placeholder="MLS inventory"
                    data-testid="input-inventory-display-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inventory-originating-system">MLS / originating system name</Label>
                  <Input
                    id="inventory-originating-system"
                    value={form.originatingSystemName}
                    onChange={(e) => setForm((f) => ({ ...f, originatingSystemName: e.target.value }))}
                    placeholder="e.g. miamire"
                    autoComplete="off"
                    data-testid="input-inventory-originating-system"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Provided by your MLS or data vendor — identifies which feed to pull.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inventory-access-token">Access token</Label>
                  <div className="relative">
                    <Input
                      id="inventory-access-token"
                      type={showToken ? "text" : "password"}
                      value={form.accessToken}
                      onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                      placeholder={mlsSource?.hasCredentials ? "••••••••  (leave blank to keep)" : "Paste access token"}
                      autoComplete="off"
                      className="pr-10"
                      data-testid="input-inventory-access-token"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowToken((v) => !v)}
                      aria-label={showToken ? "Hide token" : "Show token"}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mlsSource?.hasCredentials && (
                    <p className="text-[11px] text-muted-foreground">Token is stored securely and never shown again.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-brand-green hover:bg-brand-green/90"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                  data-testid="button-inventory-save"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : mlsSource ? (
                    "Save changes"
                  ) : (
                    "Connect MLS inventory"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mlsSource || validateMutation.isPending}
                  onClick={() => validateMutation.mutate()}
                  data-testid="button-inventory-validate"
                >
                  {validateMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    "Validate connection"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!mlsSource || syncMutation.isPending || syncRunning}
                  onClick={() => syncMutation.mutate()}
                  data-testid="button-inventory-sync"
                >
                  <RefreshCw className={cn("h-4 w-4 mr-1", syncRunning && "animate-spin")} />
                  {syncRunning ? "Syncing…" : "Sync now"}
                </Button>
                {mlsSource && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Remove this inventory source? Synced listings will be deleted.")) {
                        deleteMutation.mutate();
                      }
                    }}
                    data-testid="button-inventory-remove"
                  >
                    Remove
                  </Button>
                )}
              </div>

              {mlsSource && (
                <div
                  className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-sm space-y-3"
                  data-testid="inventory-source-status"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">Inventory source status</span>
                    <Badge variant="outline" className={connectionBadgeClass(mlsSource.connectionStatus)}>
                      {mlsSource.connectionStatus.replace(/_/g, " ")}
                    </Badge>
                    {syncRunning && (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-800">
                        Sync in progress
                      </Badge>
                    )}
                  </div>
                  <dl className="grid gap-2 sm:grid-cols-2 text-xs sm:text-sm">
                    <div>
                      <dt className="text-muted-foreground">Last sync</dt>
                      <dd className="font-medium">{lastSyncAt ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Sync status</dt>
                      <dd className="font-medium flex items-center gap-1">
                        {mlsSource.lastSyncStatus === "success" && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        )}
                        {formatInventorySyncStatus(mlsSource.lastSyncStatus)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Listings in workspace</dt>
                      <dd className="font-medium" data-testid="inventory-listing-count">
                        {mlsSource.listingCount.toLocaleString()}
                        {seenInLastSync != null && mlsSource.lastSyncStatus === "success" && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            ({seenInLastSync.toLocaleString()} in last sync)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Originating system</dt>
                      <dd className="font-medium font-mono text-xs">
                        {String((mlsSource.config as Record<string, unknown>)?.originatingSystemName ?? "—")}
                      </dd>
                    </div>
                  </dl>
                  {mlsSource.lastSyncError && (
                    <p className="text-xs text-red-700 leading-relaxed" role="alert" data-testid="inventory-sync-error">
                      {mlsSource.lastSyncError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  if (isCompact) {
    return (
      <Card className={cn("border-gray-200", className)} data-testid="card-inventory-sources-compact">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-brand-green" />
            MLS inventory
          </CardTitle>
          <CardDescription>Connect your MLS inventory for listing sync.</CardDescription>
        </CardHeader>
        <CardContent>{inner}</CardContent>
      </Card>
    );
  }

  return (
    <section className={cn("space-y-4", className)} data-testid="section-inventory-sources">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Inventory sources</h2>
        <p className="mt-1 text-sm text-gray-600">Connect your MLS inventory to sync listings into your workspace.</p>
      </div>
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Home className="h-5 w-5 text-brand-green" />
            Connect your MLS inventory
          </CardTitle>
          <CardDescription>
            Pull active listings from your MLS feed. Tokens are encrypted and never returned to the browser after save.
          </CardDescription>
        </CardHeader>
        <CardContent>{inner}</CardContent>
      </Card>
    </section>
  );
}

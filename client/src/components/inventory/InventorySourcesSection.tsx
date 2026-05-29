import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildMlsSourcePayload,
  fetchInventorySources,
  fetchInventoryStatus,
  friendlyInventoryErrorMessage,
  formatInventorySyncStatRows,
  type PublicInventorySource,
} from "@/lib/inventoryApi";
import {
  INVENTORY_PROVIDER_UI_OPTIONS,
  inventoryProviderUserLabel,
  sanitizeInventoryDisplayNameForUi,
  sanitizeOriginatingSystemForUi,
  getInventoryStatusHighlights,
  formatInventorySourceStatusRows,
} from "@shared/inventory/inventoryProviderDisplay";
import {
  deriveInventorySourcePhase,
  inventorySourcePhaseBadgeClass,
} from "@shared/inventory/inventorySourcePhase";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { Home, RefreshCw, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, XCircle } from "lucide-react";
import { RGE_TEMPLATE_DETAIL_PATH } from "@shared/rgePaths";

type Props = {
  variant?: "section" | "compact";
  className?: string;
};

const EMPTY_FORM = {
  displayName: "",
  originatingSystemName: "",
  accessToken: "",
};

const PRODUCTION_UI = import.meta.env.PROD;
const DISPLAY_NAME_PLACEHOLDER = PRODUCTION_UI ? "My MLS inventory" : "Primary inventory source";
const ORIGINATING_SYSTEM_PLACEHOLDER = PRODUCTION_UI
  ? "Provided by your MLS data provider"
  : "e.g. miamire";

function phaseStatusIcon(phase: string, syncRunning: boolean) {
  if (syncRunning) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />;
  }
  if (phase === "sync_failed") {
    return <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />;
  }
  if (phase === "needs_validation" || phase === "ready_for_import") {
    return <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
  }
  if (phase === "initial_import_complete" || phase === "up_to_date") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
  }
  return null;
}

function loadFormFromSource(source: PublicInventorySource | undefined) {
  if (!source) return { ...EMPTY_FORM, accessToken: "" };
  const cfg = source.config || {};
  const rawDisplayName = source.displayName || "";
  const rawOrigin =
    typeof cfg.originatingSystemName === "string" ? cfg.originatingSystemName : "";
  return {
    displayName: sanitizeInventoryDisplayNameForUi(rawDisplayName, PRODUCTION_UI),
    originatingSystemName: sanitizeOriginatingSystemForUi(rawOrigin, PRODUCTION_UI),
    accessToken: "",
  };
}

export function InventorySourcesSection({ variant = "section", className }: Props) {
  const queryClient = useQueryClient();
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedProvider, setSelectedProvider] = useState<InventoryProvider>("mls_grid");

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
      const active = list?.find((s) => s.provider === selectedProvider);
      return active?.lastSyncStatus === "running" ? 4_000 : false;
    },
  });

  const activeSource = useMemo(
    () => sources.find((s) => s.provider === selectedProvider),
    [sources, selectedProvider],
  );

  const providerOption = INVENTORY_PROVIDER_UI_OPTIONS.find((o) => o.id === selectedProvider);
  const providerAvailable = providerOption?.available ?? false;

  useEffect(() => {
    if (activeSource) {
      setForm(loadFormFromSource(activeSource));
      setSelectedProvider(activeSource.provider as InventoryProvider);
    } else if (sources.length > 0) {
      const first = sources[0];
      setSelectedProvider(first.provider as InventoryProvider);
      setForm(loadFormFromSource(first));
    }
  }, [activeSource?.id, activeSource?.updatedAt, sources.length]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!providerAvailable) {
        throw new Error(`${providerOption?.label ?? "This provider"} is not available yet.`);
      }
      if (selectedProvider !== "mls_grid") {
        throw new Error("This provider is not available yet.");
      }
      const isUpdate = !!activeSource;
      const payload = buildMlsSourcePayload(form, isUpdate);
      if (!payload.config.originatingSystemName) {
        throw new Error("Originating system name is required.");
      }
      if (!isUpdate && !payload.credentials?.accessToken) {
        throw new Error("Access token is required when connecting a new source.");
      }
      if (isUpdate) {
        const res = await apiRequest("PATCH", `/api/inventory/sources/${activeSource!.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/inventory/sources", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      setForm((f) => ({ ...f, accessToken: "" }));
      toast({
        title: "Inventory source saved",
        description: "Your connection settings were saved. Validate the connection, then sync your listings.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not save inventory source",
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!activeSource) throw new Error("Save your inventory source before validating.");
      const res = await apiRequest("POST", `/api/inventory/sources/${activeSource.id}/validate`);
      return res.json() as Promise<{ ok: boolean; message?: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      toast({
        title: data.ok ? "Connection verified" : "Validation failed",
        description: friendlyInventoryErrorMessage(
          data.message || (data.ok ? "Your inventory source is ready to sync." : "Check your credentials and try again."),
        ),
        variant: data.ok ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Validation failed",
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!activeSource) throw new Error("Save your inventory source before syncing.");
      const res = await fetch(`/api/inventory/sources/${activeSource.id}/sync`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 409) {
        throw new Error(body.error || "A sync is already in progress.");
      }
      if (!res.ok) {
        throw new Error(body.error || `Sync could not be started (${res.status}).`);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      toast({
        title: "Sync started",
        description: "Your listings are syncing in the background. Status updates below.",
      });
      void refetchSources();
    },
    onError: (err: Error) => {
      toast({
        title: "Could not start sync",
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!activeSource) return;
      await apiRequest("DELETE", `/api/inventory/sources/${activeSource.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/sources"] });
      setForm(EMPTY_FORM);
      toast({ title: "Inventory source removed" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not remove source",
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
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
  const syncRunning = activeSource?.lastSyncStatus === "running";
  const syncFailed = activeSource?.lastSyncStatus === "failed";
  const lastSyncAt = activeSource?.lastSyncAt ? new Date(activeSource.lastSyncAt).toLocaleString() : null;
  const sourcePhase = activeSource
    ? deriveInventorySourcePhase({
        connectionStatus: activeSource.connectionStatus,
        lastSyncStatus: activeSource.lastSyncStatus,
        lastSyncStats: activeSource.lastSyncStats,
        config: activeSource.config,
        listingCount: activeSource.listingCount,
      })
    : null;
  const syncStatRows = formatInventorySourceStatusRows(
    activeSource?.lastSyncStats,
    activeSource?.config as Record<string, unknown> | undefined,
  );
  const statusHighlights = getInventoryStatusHighlights(activeSource?.lastSyncStats);
  const devSyncRows = formatInventorySyncStatRows(activeSource?.lastSyncStats);
  const isMlsGrid = selectedProvider === "mls_grid";
  const showSyncMetrics =
    sourcePhase?.phase === "initial_import_running" ||
    sourcePhase?.phase === "initial_import_complete" ||
    sourcePhase?.phase === "up_to_date" ||
    sourcePhase?.phase === "sync_failed";

  const inner = (
    <div className={cn("space-y-4", className)}>
      {!status.rgeInstalled && (
        <Alert className="border-amber-200 bg-amber-50/80">
          <AlertCircle className="h-4 w-4 text-amber-800" />
          <AlertTitle className="text-amber-950">Realtor Growth Engine required</AlertTitle>
          <AlertDescription className="text-amber-900/90 text-sm">
            Install the Realtor Growth Engine to connect an inventory source.{" "}
            <Link href={RGE_TEMPLATE_DETAIL_PATH} className="font-medium underline underline-offset-2">
              Open Growth Engine
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {status.canUse && (
        <>
          <p className={cn("text-sm text-muted-foreground leading-relaxed", isCompact && "text-xs")}>
            Your inventory provider supplies the listing feed used by RGE to power buyer matching, new
            opportunities, price reduction alerts, and AI listing drafts.
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
                  <Label htmlFor="inventory-provider">Provider</Label>
                  <Select
                    value={selectedProvider}
                    onValueChange={(v) => setSelectedProvider(v as InventoryProvider)}
                    disabled={!!activeSource}
                  >
                    <SelectTrigger id="inventory-provider" data-testid="select-inventory-provider">
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVENTORY_PROVIDER_UI_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.id}
                          value={option.id}
                          disabled={!option.available && !activeSource}
                        >
                          {option.label}
                          {!option.available ? " — Coming soon" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Choose the service that supplies your listing inventory.
                  </p>
                  {!providerAvailable && (
                    <p className="text-[11px] text-muted-foreground">
                      {providerOption?.helper ?? "Coming soon"} — listing sync is not available for this provider
                      yet.
                    </p>
                  )}
                </div>

                {isMlsGrid && providerAvailable && (
                  <>
                    <div className="space-y-2 sm:col-span-2 sm:max-w-md">
                      <Label htmlFor="inventory-display-name">Display name</Label>
                      <Input
                        id="inventory-display-name"
                        value={form.displayName}
                        onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                        placeholder={DISPLAY_NAME_PLACEHOLDER}
                        data-testid="input-inventory-display-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inventory-originating-system">Originating system name</Label>
                      <Input
                        id="inventory-originating-system"
                        value={form.originatingSystemName}
                        onChange={(e) => setForm((f) => ({ ...f, originatingSystemName: e.target.value }))}
                        placeholder={ORIGINATING_SYSTEM_PLACEHOLDER}
                        autoComplete="off"
                        data-testid="input-inventory-originating-system"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Use the originating system name and access token provided by your MLS data provider.
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
                          placeholder={
                            activeSource?.hasCredentials
                              ? "••••••••  (leave blank to keep)"
                              : "Paste access token"
                          }
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
                      {activeSource?.hasCredentials && (
                        <p className="text-[11px] text-muted-foreground">
                          Token is stored securely and never shown again after save. If MLS Grid rotates your
                          token, paste the new one here and save — the previous token is replaced.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {isMlsGrid && providerAvailable && (
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
                    ) : activeSource ? (
                      "Save changes"
                    ) : (
                      "Connect inventory source"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!activeSource || validateMutation.isPending}
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
                    disabled={!activeSource || syncMutation.isPending || syncRunning}
                    onClick={() => syncMutation.mutate()}
                    data-testid="button-inventory-sync"
                  >
                    <RefreshCw className={cn("h-4 w-4 mr-1", syncRunning && "animate-spin")} />
                    {syncRunning ? "Syncing…" : "Sync now"}
                  </Button>
                </div>
              )}

              {activeSource && isMlsGrid && (
                <div
                  className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-sm space-y-4"
                  data-testid="inventory-source-status"
                >
                  <p className="font-medium text-gray-900">Inventory source status</p>

                  <dl className="grid gap-3 sm:grid-cols-2 text-xs sm:text-sm">
                    <div>
                      <dt className="text-muted-foreground">Provider</dt>
                      <dd className="font-medium">{inventoryProviderUserLabel(activeSource.provider)}</dd>
                    </div>
                    {sourcePhase && (
                      <div className="sm:col-span-2">
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="space-y-1.5">
                          <div className="flex items-center gap-1.5 font-medium">
                            {phaseStatusIcon(sourcePhase.phase, syncRunning)}
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-normal",
                                inventorySourcePhaseBadgeClass(sourcePhase.phase),
                              )}
                              data-testid="inventory-source-phase"
                            >
                              {sourcePhase.message}
                            </Badge>
                          </div>
                          {sourcePhase.detail && (
                            <p
                              className={cn(
                                "text-xs leading-relaxed",
                                sourcePhase.phase === "ready_for_import"
                                  ? "text-blue-900/90 bg-blue-50 border border-blue-200 rounded px-2 py-1"
                                  : sourcePhase.phase === "initial_import_running"
                                    ? "text-blue-900/90"
                                    : sourcePhase.phase === "sync_failed"
                                      ? "text-red-900/90"
                                      : "text-muted-foreground",
                              )}
                              data-testid="inventory-source-phase-detail"
                            >
                              {sourcePhase.detail}
                            </p>
                          )}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-muted-foreground">Listings in workspace</dt>
                      <dd className="font-medium" data-testid="inventory-listing-count">
                        {activeSource.listingCount.toLocaleString()}
                      </dd>
                    </div>
                    {lastSyncAt && (
                      <div>
                        <dt className="text-muted-foreground">Last sync</dt>
                        <dd className="font-medium">{lastSyncAt}</dd>
                      </div>
                    )}
                    {showSyncMetrics && statusHighlights.updatedListings != null && (
                      <div>
                        <dt className="text-muted-foreground">Updated listings</dt>
                        <dd className="font-medium tabular-nums">
                          {statusHighlights.updatedListings.toLocaleString()}
                        </dd>
                      </div>
                    )}
                    {showSyncMetrics && statusHighlights.newListings != null && statusHighlights.newListings > 0 && (
                      <div>
                        <dt className="text-muted-foreground">New listings</dt>
                        <dd className="font-medium tabular-nums">
                          {statusHighlights.newListings.toLocaleString()}
                        </dd>
                      </div>
                    )}
                    {showSyncMetrics && statusHighlights.priceChanges != null && statusHighlights.priceChanges > 0 && (
                      <div>
                        <dt className="text-muted-foreground">Price changes</dt>
                        <dd className="font-medium tabular-nums">
                          {statusHighlights.priceChanges.toLocaleString()}
                        </dd>
                      </div>
                    )}
                    {showSyncMetrics && statusHighlights.inactiveListings != null && (
                      <div>
                        <dt className="text-muted-foreground">Inactive listings</dt>
                        <dd className="font-medium tabular-nums">
                          {statusHighlights.inactiveListings.toLocaleString()}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {showSyncMetrics && syncStatRows.length > 0 && (
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                        Last sync summary
                      </p>
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {syncStatRows.map((row) => (
                          <div key={row.label} className="flex justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className="font-medium tabular-nums">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {syncFailed && activeSource.lastSyncError && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-sm">Sync failed</AlertTitle>
                      <AlertDescription
                        className="text-xs leading-relaxed"
                        data-testid="inventory-sync-error"
                      >
                        {friendlyInventoryErrorMessage(activeSource.lastSyncError)}
                      </AlertDescription>
                    </Alert>
                  )}

                  {!syncFailed && activeSource.connectionStatus === "error" && activeSource.lastSyncError && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-sm">Connection error</AlertTitle>
                      <AlertDescription className="text-xs leading-relaxed">
                        {friendlyInventoryErrorMessage(activeSource.lastSyncError)}
                      </AlertDescription>
                    </Alert>
                  )}

                  {import.meta.env.DEV && devSyncRows.length > 0 && (
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                        Sync diagnostics (dev)
                      </p>
                      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {devSyncRows.map((row) => (
                          <div key={row.label} className="flex justify-between gap-2 text-xs">
                            <span className="text-muted-foreground">{row.label}</span>
                            <span className="font-medium tabular-nums">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this inventory source? Synced listings will be deleted from your workspace.",
                          )
                        ) {
                          deleteMutation.mutate();
                        }
                      }}
                      data-testid="button-inventory-remove"
                    >
                      {deleteMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Removing…
                        </>
                      ) : (
                        "Remove source"
                      )}
                    </Button>
                  </div>
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
            Inventory Source
          </CardTitle>
          <CardDescription>Connect your inventory source and sync your listings.</CardDescription>
        </CardHeader>
        <CardContent>{inner}</CardContent>
      </Card>
    );
  }

  return (
    <section className={cn("space-y-4", className)} data-testid="section-inventory-sources">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Inventory Source</h2>
        <p className="mt-1 text-sm text-gray-600">
          Connect your inventory source to sync listings into your workspace.
        </p>
      </div>
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Home className="h-5 w-5 text-brand-green" />
            Connect your inventory source
          </CardTitle>
          <CardDescription>
            Sync your listings for buyer matching and inventory intelligence. Credentials are encrypted and never
            returned to the browser after save.
          </CardDescription>
        </CardHeader>
        <CardContent>{inner}</CardContent>
      </Card>
    </section>
  );
}

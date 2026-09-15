import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { useHideGrowthEngineForShopify } from "@/lib/shopifyMerchantExperience";
import { logRgeSelect } from "@/lib/rgeSelectDebug";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  buildInventorySourcePayload,
  bulkPublishEligibleListings,
  bulkUnpublishAllListings,
  fetchInventorySourcesBundle,
  fetchInventoryStatus,
  friendlyInventoryErrorMessage,
  formatInventorySyncStatRows,
  type InventorySourceForm,
  type ListingPublicationStats,
  type PublicInventorySource,
} from "@/lib/inventoryApi";
import {
  applyInventorySourcesCacheUpdate,
  clearInventorySourceSecrets,
  EMPTY_INVENTORY_SOURCE_FORM,
  inventoryFormHydrationIdentity,
  inventorySourcesQueryKey,
  inventorySourceSaveRequest,
  inventorySourceSyncUrl,
  loadInventorySourceForm,
  normalizeInventorySourcesQueryData,
  shouldResetInventoryForm,
} from "@/lib/inventorySourceFormState";
import {
  applySecretReplacementToForm,
  buildInventorySourceSummaryCard,
  canConnectInventoryProvider,
  inventoryConnectionStateBadgeClass,
  inventoryCredentialConfiguredLabel,
  inventoryReplaceSecretLabel,
  inventorySecretFieldMode,
  listInventoryConnectorAvailability,
  resolveInventoryFormPanel,
} from "@/lib/inventorySourceConnectionUi";
import {
  focusInventoryFormField,
  inventoryFieldHasError,
  validateInventorySourceForm,
  type InventoryFormField,
  type InventoryFormFieldErrors,
} from "@/lib/inventorySourceFormValidation";
import {
  INVENTORY_PROVIDER_UI_OPTIONS,
  inventoryProviderUserLabel,
  formatInventorySourceStatusRows,
} from "@shared/inventory/inventoryProviderDisplay";
import { deriveInventorySourcePhase } from "@shared/inventory/inventorySourcePhase";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { providerSupportsListingSync } from "@shared/inventory/inventoryProviderSchema";
import { Home, RefreshCw, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { INVENTORY_MAX_LISTINGS_OPTIONS, DEFAULT_MAX_LISTINGS } from "@shared/inventory/reso/resoSyncScope";
import { RGE_INVENTORY_SETTINGS_HASH, RGE_INVENTORY_SETTINGS_PATH } from "@shared/rgePaths";

type Props = {
  variant?: "section" | "compact";
  className?: string;
};

const PRODUCTION_UI = import.meta.env.PROD;

function defaultDisplayNamePlaceholder(provider: InventoryProvider): string {
  if (provider === "bridge_interactive") {
    return PRODUCTION_UI ? "My Bridge inventory" : "Bridge inventory source";
  }
  if (provider === "trestle") {
    return PRODUCTION_UI ? "My Trestle inventory" : "Trestle inventory source";
  }
  return PRODUCTION_UI ? "My MLS inventory" : "Primary inventory source";
}

function datasetIdPlaceholder(): string {
  return PRODUCTION_UI ? "From your Bridge Data Output account" : "e.g. abor_ref";
}

function originatingSystemPlaceholder(provider: InventoryProvider): string {
  if (provider === "trestle") {
    return PRODUCTION_UI ? "From your Trestle feed configuration" : "e.g. trestle";
  }
  return PRODUCTION_UI ? "Provided by your MLS data provider" : "e.g. miamire";
}

function inventoryInputClass(hasError: boolean, extra?: string): string {
  return cn(hasError && "border-red-500 focus-visible:ring-red-500", extra);
}

function normalizeProviderSelectValue(provider: string): InventoryProvider {
  const match = INVENTORY_PROVIDER_UI_OPTIONS.find((option) => option.id === provider);
  return match?.id ?? "mls_grid";
}

function normalizeMaxListingsSelectValue(value: number | undefined): string {
  const normalized = INVENTORY_MAX_LISTINGS_OPTIONS.includes(value as (typeof INVENTORY_MAX_LISTINGS_OPTIONS)[number])
    ? value
    : DEFAULT_MAX_LISTINGS;
  return String(normalized ?? DEFAULT_MAX_LISTINGS);
}

export function InventorySourcesSection({ variant = "section", className }: Props) {
  const hideGrowthEngine = useHideGrowthEngineForShopify();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showSecrets, setShowSecrets] = useState(false);
  const [form, setForm] = useState(EMPTY_INVENTORY_SOURCE_FORM);
  const [maxListingsDraft, setMaxListingsDraft] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<InventoryFormFieldErrors>({});
  const [formBannerError, setFormBannerError] = useState<string | null>(null);
  const [removeSourceConfirmOpen, setRemoveSourceConfirmOpen] = useState(false);
  const [bulkPublishConfirmOpen, setBulkPublishConfirmOpen] = useState(false);
  const [bulkUnpublishConfirmOpen, setBulkUnpublishConfirmOpen] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<InventoryProvider | null>(null);
  const [replacingSecret, setReplacingSecret] = useState(false);
  const [disconnectSourceId, setDisconnectSourceId] = useState<string | null>(null);
  const hydratedIdentityRef = useRef<string | null>(null);
  const lastWorkspaceIdRef = useRef<string | undefined>(user?.id);
  const sourcesQueryKey = inventorySourcesQueryKey(user?.id);

  const clearFieldError = (field: InventoryFormField) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const clearFormValidation = () => {
    setFieldErrors({});
    setFormBannerError(null);
  };

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/inventory/status"],
    queryFn: fetchInventoryStatus,
    staleTime: 30_000,
  });

  const sourcesEnabled = !!status?.canUse;

  const {
    data: sourcesBundle,
    isLoading: sourcesLoading,
    isError: sourcesError,
    refetch: refetchSources,
  } = useQuery({
    queryKey: sourcesQueryKey,
    queryFn: fetchInventorySourcesBundle,
    enabled: sourcesEnabled,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const list = normalizeInventorySourcesQueryData(query.state.data).sources;
      const hasRunning = list.some((s) => s.lastSyncStatus === "running");
      return hasRunning ? 3_000 : false;
    },
  });

  const { sources, publicationStats: loadedPublicationStats } = useMemo(
    () => normalizeInventorySourcesQueryData(sourcesBundle),
    [sourcesBundle],
  );
  const publicationStats: ListingPublicationStats | undefined = sourcesBundle
    ? loadedPublicationStats
    : undefined;

  useEffect(() => {
    if (lastWorkspaceIdRef.current === user?.id) return;
    lastWorkspaceIdRef.current = user?.id;
    hydratedIdentityRef.current = null;
    setEditingSourceId(null);
    setConnectingProvider(null);
    setReplacingSecret(false);
    setDisconnectSourceId(null);
    setForm({ ...EMPTY_INVENTORY_SOURCE_FORM });
    setMaxListingsDraft(null);
    setFieldErrors({});
    setFormBannerError(null);
  }, [user?.id]);

  const formTarget = useMemo(
    () => resolveInventoryFormPanel({ editingSourceId, connectingProvider, sources }),
    [editingSourceId, connectingProvider, sources],
  );
  const activeSource = formTarget.source;
  const selectedProvider = formTarget.provider ?? "mls_grid";
  const providerOption = INVENTORY_PROVIDER_UI_OPTIONS.find((o) => o.id === selectedProvider);
  const providerAvailable = providerOption?.available ?? false;
  const formOpen = formTarget.panel.kind !== "idle";
  const connectedSummaries = useMemo(() => sources.map(buildInventorySourceSummaryCard), [sources]);
  const connectorAvailability = useMemo(() => listInventoryConnectorAvailability(sources), [sources]);
  const disconnectSource = useMemo(
    () => sources.find((s) => s.id === disconnectSourceId) ?? activeSource,
    [sources, disconnectSourceId, activeSource],
  );

  useEffect(() => {
    if (sourcesLoading || sourcesError || !formOpen) return;
    const nextIdentity = inventoryFormHydrationIdentity({
      workspaceUserId: user?.id,
      selectedProvider,
      sourceId: activeSource?.id ?? null,
    });
    if (!shouldResetInventoryForm(hydratedIdentityRef.current, nextIdentity)) return;
    hydratedIdentityRef.current = nextIdentity;
    setForm(loadInventorySourceForm(activeSource, PRODUCTION_UI));
    setMaxListingsDraft(null);
    setFieldErrors({});
    setFormBannerError(null);
    if (formTarget.panel.kind === "connect") setReplacingSecret(false);
  }, [
    sourcesLoading,
    sourcesError,
    user?.id,
    selectedProvider,
    activeSource,
    formOpen,
    formTarget.panel.kind,
  ]);

  const serverMaxListings = normalizeMaxListingsSelectValue(form.maxListings);
  const maxListingsValue = maxListingsDraft ?? serverMaxListings;
  const providerSelectValue = normalizeProviderSelectValue(selectedProvider);

  useEffect(() => {
    logRgeSelect(
      "InventorySourcesSection",
      "provider",
      activeSource?.provider ?? null,
      selectedProvider,
      providerSelectValue,
      "value-prop",
    );
  }, [activeSource?.provider, providerSelectValue, selectedProvider]);

  useEffect(() => {
    logRgeSelect(
      "InventorySourcesSection",
      "maxListings",
      serverMaxListings,
      maxListingsDraft,
      maxListingsValue,
      "value-prop",
    );
  }, [maxListingsDraft, maxListingsValue, serverMaxListings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const isUpdate = !!activeSource;
      const payload = buildInventorySourcePayload(
        selectedProvider as "mls_grid" | "trestle" | "bridge_interactive",
        applySecretReplacementToForm(form, isUpdate ? replacingSecret : true),
        isUpdate,
      );
      const saveReq = inventorySourceSaveRequest(activeSource);
      const res = await apiRequest(saveReq.method, saveReq.url, payload);
      return res.json();
    },
    onSuccess: (payload: { source?: PublicInventorySource }) => {
      if (payload?.source) {
        queryClient.setQueryData(sourcesQueryKey, (prev: unknown) =>
          applyInventorySourcesCacheUpdate(prev, payload.source!),
        );
      }
      setForm((f) => clearInventorySourceSecrets(f));
      setMaxListingsDraft(null);
      setReplacingSecret(false);
      setConnectingProvider(null);
      setEditingSourceId(null);
      hydratedIdentityRef.current = null;
      clearFormValidation();
      toast({
        title: "Inventory source saved",
        description: "Your connection settings are saved. Automatic background sync stays on.",
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

  const syncMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await fetch(inventorySourceSyncUrl({ id: sourceId }), {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.status === 400 && body.code === "validation_failed") {
        const err = new Error(body.error || "Connection validation failed");
        (err as Error & { validationFailed?: boolean }).validationFailed = true;
        throw err;
      }
      if (res.status === 409) {
        throw new Error(body.error || "A sync is already in progress.");
      }
      if (!res.ok) {
        throw new Error(body.error || `Sync could not be started (${res.status}).`);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: "Sync started",
        description: "Your listings are syncing in the background.",
      });
      void refetchSources();
    },
    onError: (err: Error & { validationFailed?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: err.validationFailed ? "Connection failed" : "Could not start sync",
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const runFormValidation = () => {
    clearFormValidation();

    if (!formOpen || !providerAvailable || !providerSupportsListingSync(selectedProvider)) {
      toast({
        title: "Provider not available",
        description: `${providerOption?.label ?? "This provider"} is not available yet.`,
      });
      return false;
    }

    const validation = validateInventorySourceForm({
      provider: selectedProvider,
      form,
      isUpdate: !!activeSource,
      hasStoredCredentials: activeSource?.hasCredentials ?? false,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      focusInventoryFormField(validation.firstInvalidField);
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!runFormValidation()) return;
    saveMutation.mutate();
  };

  const handleSyncSource = (sourceId: string) => {
    syncMutation.mutate(sourceId);
  };

  const openEditSettings = (sourceId: string, reconnect = false) => {
    hydratedIdentityRef.current = null;
    setConnectingProvider(null);
    setEditingSourceId(sourceId);
    setReplacingSecret(reconnect);
    setShowDiagnostics(false);
  };

  const openConnectProvider = (provider: InventoryProvider) => {
    if (!canConnectInventoryProvider(provider, sources)) return;
    setEditingSourceId(null);
    setConnectingProvider(provider);
    setReplacingSecret(false);
    hydratedIdentityRef.current = null;
    setForm({ ...EMPTY_INVENTORY_SOURCE_FORM });
    setMaxListingsDraft(null);
    clearFormValidation();
  };

  const closeFormPanel = () => {
    setEditingSourceId(null);
    setConnectingProvider(null);
    setReplacingSecret(false);
    hydratedIdentityRef.current = null;
    setForm({ ...EMPTY_INVENTORY_SOURCE_FORM });
    setMaxListingsDraft(null);
    clearFormValidation();
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const sourceId = disconnectSource?.id;
      if (!sourceId) return;
      await apiRequest("DELETE", `/api/inventory/sources/${sourceId}`);
    },
    onSuccess: () => {
      setRemoveSourceConfirmOpen(false);
      setDisconnectSourceId(null);
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      closeFormPanel();
      toast({ title: "Inventory source disconnected" });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not remove source",
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const bulkPublishMutation = useMutation({
    mutationFn: bulkPublishEligibleListings,
    onSuccess: (result) => {
      setBulkPublishConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: "Listings published",
        description: `${result.published.toLocaleString()} listing${result.published === 1 ? "" : "s"} now appear on your Agent Page.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Bulk publish failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkUnpublishMutation = useMutation({
    mutationFn: bulkUnpublishAllListings,
    onSuccess: (result) => {
      setBulkUnpublishConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: "Listings unpublished",
        description: `${result.unpublished.toLocaleString()} listing${result.unpublished === 1 ? "" : "s"} removed from your Agent Page.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Bulk unpublish failed", description: err.message, variant: "destructive" });
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
        listingCount: activeSource.inventoryStats?.totalSynced ?? activeSource.listingCount,
      })
    : null;
  const syncStatRows = formatInventorySourceStatusRows(
    activeSource?.lastSyncStats,
    activeSource?.config as Record<string, unknown> | undefined,
  );
  const devSyncRows = formatInventorySyncStatRows(activeSource?.lastSyncStats);
  const importJustFinished =
    sourcePhase?.phase === "initial_import_complete" ||
    (sourcePhase?.phase === "up_to_date" && activeSource?.lastSyncStatus === "success");
  const connectionStatusLabel = syncRunning ? "Syncing" : "Connected";
  const technicalDetailRows = syncStatRows;
  const pagesProcessed =
    typeof activeSource?.lastSyncStats?.pagesFetched === "number"
      ? activeSource.lastSyncStats.pagesFetched
      : null;
  const apiRequests =
    typeof activeSource?.lastSyncStats?.requestsMade === "number"
      ? activeSource.lastSyncStats.requestsMade
      : null;
  const lastFailedSyncAt = (() => {
    const fromStats = activeSource?.lastSyncStats?.lastFailedSyncAt;
    if (typeof fromStats === "string" && fromStats.trim()) {
      return new Date(fromStats).toLocaleString();
    }
    const fromConfig = activeSource?.config?.lastFailedSyncAt;
    if (typeof fromConfig === "string" && fromConfig.trim()) {
      return new Date(fromConfig).toLocaleString();
    }
    return null;
  })();
  const lastSyncUpserted =
    typeof activeSource?.lastSyncStats?.listingsUpserted === "number"
      ? activeSource.lastSyncStats.listingsUpserted
      : typeof activeSource?.lastSyncStats?.listingsImported === "number"
        ? activeSource.lastSyncStats.listingsImported
        : null;
  const lastSyncFetched =
    typeof activeSource?.lastSyncStats?.listingsFetched === "number"
      ? activeSource.lastSyncStats.listingsFetched
      : null;
  const lastSyncSkippedCap =
    typeof activeSource?.lastSyncStats?.skippedDueToCap === "number"
      ? activeSource.lastSyncStats.skippedDueToCap
      : null;
  const inventoryStats = activeSource?.inventoryStats;
  const isListingSyncProvider = providerSupportsListingSync(selectedProvider);
  const isMlsGrid = selectedProvider === "mls_grid";
  const isTrestle = selectedProvider === "trestle";
  const isBridge = selectedProvider === "bridge_interactive";
  const secretMode = inventorySecretFieldMode({
    isUpdate: !!activeSource,
    hasStoredCredentials: activeSource?.hasCredentials ?? false,
    replacing: replacingSecret,
  });
  const datasetId =
    typeof activeSource?.config?.datasetId === "string" ? activeSource.config.datasetId : null;
  const originatingSystem =
    typeof activeSource?.config?.originatingSystemName === "string"
      ? activeSource.config.originatingSystemName
      : null;

  const inner = (
    <div className={cn("space-y-4", className)}>
      {!status.rgeInstalled && !hideGrowthEngine && (
        <Alert className="border-amber-200 bg-amber-50/80">
          <AlertCircle className="h-4 w-4 text-amber-800" />
          <AlertTitle className="text-amber-950">Realtor Growth Engine required</AlertTitle>
          <AlertDescription className="text-amber-900/90 text-sm">
            Install the Realtor Growth Engine to connect an inventory source.{" "}
            <Link href={RGE_INVENTORY_SETTINGS_PATH} className="font-medium underline underline-offset-2">
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

          {sourcesError ? (
            <Alert className="border-red-200 bg-red-50/80">
              <AlertCircle className="h-4 w-4 text-red-800" />
              <AlertTitle className="text-red-950">Could not load inventory source</AlertTitle>
              <AlertDescription className="text-red-900/90 text-sm flex flex-wrap items-center gap-2">
                Check your connection and try again.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchSources()}
                  data-testid="button-inventory-sources-retry"
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : sourcesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading inventory source…
            </div>
          ) : (
            <>
              {connectedSummaries.length > 0 && (
                <div className="space-y-3" data-testid="inventory-connected-sources">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Connected inventory sources</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Existing feeds stay here even if a sync or credential needs attention.
                    </p>
                  </div>
                  {connectedSummaries.map((card) => {
                    const source = sources.find((s) => s.id === card.sourceId);
                    const cardSyncing = source?.lastSyncStatus === "running";
                    return (
                      <div
                        key={card.sourceId}
                        className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
                        data-testid={`inventory-source-card-${card.sourceId}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{card.providerLabel}</p>
                            <p className="text-xs text-muted-foreground">{card.displayName}</p>
                          </div>
                          <span
                            className={cn(
                              "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                              inventoryConnectionStateBadgeClass(card.connectionState),
                            )}
                            data-testid="inventory-source-connection-state"
                          >
                            {card.connectionStateLabel}
                          </span>
                        </div>
                        <dl className="grid gap-2 sm:grid-cols-2 text-xs">
                          {card.datasetId ? (
                            <div>
                              <dt className="text-muted-foreground">Dataset ID</dt>
                              <dd className="font-medium font-mono">{card.datasetId}</dd>
                            </div>
                          ) : null}
                          {card.originatingSystemName ? (
                            <div>
                              <dt className="text-muted-foreground">Originating system</dt>
                              <dd className="font-medium font-mono">{card.originatingSystemName}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="text-muted-foreground">Market scope</dt>
                            <dd className="font-medium">{card.marketScope}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Listings / cap</dt>
                            <dd className="font-medium tabular-nums" data-testid="inventory-total-synced">
                              {card.listingCountLabel}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Automatic sync</dt>
                            <dd className="font-medium">{card.automaticSyncLabel}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Last successful sync</dt>
                            <dd className="font-medium">{card.lastSuccessfulSyncLabel}</dd>
                          </div>
                          {card.credentialConfiguredLabel ? (
                            <div className="sm:col-span-2">
                              <dt className="text-muted-foreground">Credentials</dt>
                              <dd className="font-medium" data-testid="inventory-credential-configured">
                                {card.credentialConfiguredLabel}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        {card.lastError ? (
                          <Alert variant="destructive" className="py-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-sm">Needs attention</AlertTitle>
                            <AlertDescription className="text-xs leading-relaxed" data-testid="inventory-sync-error">
                              {card.lastError}
                            </AlertDescription>
                          </Alert>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={syncMutation.isPending || cardSyncing || card.connectionState === "disconnected"}
                            onClick={() => handleSyncSource(card.sourceId)}
                            data-testid="button-inventory-sync"
                          >
                            {syncMutation.isPending || cardSyncing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Syncing…
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Sync now
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEditSettings(card.sourceId, false)}
                            data-testid="button-inventory-edit"
                          >
                            Edit settings
                          </Button>
                          {card.showReconnect ? (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-brand-green hover:bg-brand-green/90"
                              onClick={() => openEditSettings(card.sourceId, true)}
                              data-testid="button-inventory-reconnect"
                            >
                              Reconnect
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              setDisconnectSourceId(card.sourceId);
                              setRemoveSourceConfirmOpen(true);
                            }}
                            data-testid="button-inventory-remove"
                          >
                            Disconnect
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3" data-testid="inventory-available-connectors">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Available connectors</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Connect another listing feed, or see which providers are already in use.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {connectorAvailability.map((connector) => (
                    <div
                      key={connector.id}
                      className="rounded-lg border border-gray-200 bg-muted/20 p-3 space-y-2"
                      data-testid={`inventory-connector-${connector.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{connector.label}</p>
                          {connector.helper ? (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{connector.helper}</p>
                          ) : null}
                        </div>
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                          data-testid={`inventory-connector-status-${connector.id}`}
                        >
                          {connector.statusLabel}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={connector.status === "available" ? "default" : "outline"}
                        className={connector.status === "available" ? "bg-brand-green hover:bg-brand-green/90" : undefined}
                        disabled={connector.disabled}
                        onClick={() => openConnectProvider(connector.id)}
                        data-testid={`button-inventory-connect-${connector.id}`}
                      >
                        {connector.actionLabel}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {formOpen && isListingSyncProvider && providerAvailable && (
                <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-gray-200 bg-gray-50/70 p-4" data-testid="inventory-source-form">
                  <div className="sm:col-span-2 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        {activeSource ? "Edit settings" : `Connect ${providerOption?.label ?? "provider"}`}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {activeSource
                          ? "Saving updates this existing source. Credentials stay encrypted."
                          : "This creates a new inventory source for the current workspace."}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={closeFormPanel}>
                      Close
                    </Button>
                  </div>
                  <>
                    {formBannerError && (
                      <div
                        className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                        role="alert"
                        data-testid="inventory-form-banner"
                      >
                        {formBannerError}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="inventory-display-name">Display name</Label>
                      <Input
                        id="inventory-display-name"
                        value={form.displayName}
                        onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                        placeholder={defaultDisplayNamePlaceholder(selectedProvider)}
                        data-testid="input-inventory-display-name"
                      />
                    </div>
                    <div className="space-y-3 sm:col-span-2 rounded-md border border-border/60 bg-muted/20 p-4">
                      <div>
                        <p className="text-sm font-medium">Market scope</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Limit sync to your market with cities or ZIP codes.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="inventory-sync-cities">Cities</Label>
                          <Input
                            id="inventory-sync-cities"
                            value={form.syncCities}
                            onChange={(e) => setForm((f) => ({ ...f, syncCities: e.target.value }))}
                            placeholder="Fort Lauderdale, Miami"
                            autoComplete="off"
                            data-testid="input-inventory-sync-cities"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="inventory-sync-zips">ZIP codes</Label>
                          <Input
                            id="inventory-sync-zips"
                            value={form.syncZipCodes}
                            onChange={(e) => setForm((f) => ({ ...f, syncZipCodes: e.target.value }))}
                            placeholder="33301, 33304"
                            autoComplete="off"
                            data-testid="input-inventory-sync-zips"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="inventory-max-listings">Max listings</Label>
                          <Select
                            value={maxListingsValue}
                            onValueChange={(value) => {
                              logRgeSelect(
                                "InventorySourcesSection",
                                "maxListings",
                                serverMaxListings,
                                maxListingsDraft,
                                value,
                                "change",
                              );
                              if (value === maxListingsValue) return;
                              setMaxListingsDraft(value);
                              const next = Number(value) as InventorySourceForm["maxListings"];
                              setForm((f) =>
                                f.maxListings === next ? f : { ...f, maxListings: next },
                              );
                            }}
                          >
                            <SelectTrigger id="inventory-max-listings" data-testid="select-inventory-max-listings">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INVENTORY_MAX_LISTINGS_OPTIONS.map((limit) => (
                                <SelectItem key={limit} value={String(limit)}>
                                  {limit.toLocaleString()}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {isBridge ? (
                          <div className="space-y-2">
                            <Label htmlFor="inventory-dataset-id">Dataset ID</Label>
                            <Input
                              id="inventory-dataset-id"
                              value={form.datasetId}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, datasetId: e.target.value }));
                                clearFieldError("datasetId");
                              }}
                              placeholder={datasetIdPlaceholder()}
                              autoComplete="off"
                              aria-invalid={inventoryFieldHasError(fieldErrors, "datasetId")}
                              className={inventoryInputClass(inventoryFieldHasError(fieldErrors, "datasetId"))}
                              data-testid="input-inventory-dataset-id"
                            />
                            {fieldErrors.datasetId ? (
                              <p className="text-xs text-red-600" role="alert">
                                {fieldErrors.datasetId}
                              </p>
                            ) : null}
                          </div>
                        ) : (isMlsGrid || isTrestle) ? (
                          <div className="space-y-2">
                            <Label htmlFor="inventory-originating-system">Originating system name</Label>
                            <Input
                              id="inventory-originating-system"
                              value={form.originatingSystemName}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, originatingSystemName: e.target.value }));
                                clearFieldError("originatingSystemName");
                              }}
                              placeholder={originatingSystemPlaceholder(selectedProvider)}
                              autoComplete="off"
                              aria-invalid={inventoryFieldHasError(fieldErrors, "originatingSystemName")}
                              className={inventoryInputClass(
                                inventoryFieldHasError(fieldErrors, "originatingSystemName"),
                              )}
                              data-testid="input-inventory-originating-system"
                            />
                            {fieldErrors.originatingSystemName ? (
                              <p className="text-xs text-red-600" role="alert">
                                {fieldErrors.originatingSystemName}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {isMlsGrid && secretMode === "hidden_configured" && (
                      <div className="space-y-2 sm:col-span-2">
                        <p className="text-sm font-medium" data-testid="inventory-credential-configured">
                          {inventoryCredentialConfiguredLabel("mls_grid")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReplacingSecret(true)}
                          data-testid="button-inventory-replace-token"
                        >
                          {inventoryReplaceSecretLabel("mls_grid")}
                        </Button>
                      </div>
                    )}
                    {isMlsGrid && secretMode !== "hidden_configured" && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="inventory-access-token">Access token</Label>
                        <div className="relative">
                          <Input
                            id="inventory-access-token"
                            type={showSecrets ? "text" : "password"}
                            value={form.accessToken}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, accessToken: e.target.value }));
                              clearFieldError("accessToken");
                            }}
                            placeholder="Paste access token"
                            autoComplete="off"
                            aria-invalid={inventoryFieldHasError(fieldErrors, "accessToken")}
                            className={inventoryInputClass(
                              inventoryFieldHasError(fieldErrors, "accessToken"),
                              "pr-10",
                            )}
                            data-testid="input-inventory-access-token"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowSecrets((v) => !v)}
                            aria-label={showSecrets ? "Hide token" : "Show token"}
                          >
                            {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {fieldErrors.accessToken ? (
                          <p className="text-xs text-red-600" role="alert">
                            {fieldErrors.accessToken}
                          </p>
                        ) : (
                          activeSource?.hasCredentials && (
                            <p className="text-[11px] text-muted-foreground">
                              Token is stored securely and never shown again after save. If MLS Grid rotates your
                              token, paste the new one here and save — the previous token is replaced.
                            </p>
                          )
                        )}
                      </div>
                    )}
                    {isBridge && secretMode === "hidden_configured" && (
                      <div className="space-y-2 sm:col-span-2">
                        <p className="text-sm font-medium" data-testid="inventory-credential-configured">
                          {inventoryCredentialConfiguredLabel("bridge_interactive")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReplacingSecret(true)}
                          data-testid="button-inventory-replace-token"
                        >
                          {inventoryReplaceSecretLabel("bridge_interactive")}
                        </Button>
                      </div>
                    )}
                    {isBridge && secretMode !== "hidden_configured" && (
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="inventory-server-token">Server token</Label>
                        <div className="relative">
                          <Input
                            id="inventory-server-token"
                            type={showSecrets ? "text" : "password"}
                            value={form.serverToken}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, serverToken: e.target.value }));
                              clearFieldError("serverToken");
                            }}
                            placeholder="Paste Bridge server token"
                            autoComplete="off"
                            aria-invalid={inventoryFieldHasError(fieldErrors, "serverToken")}
                            className={inventoryInputClass(
                              inventoryFieldHasError(fieldErrors, "serverToken"),
                              "pr-10",
                            )}
                            data-testid="input-inventory-server-token"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowSecrets((v) => !v)}
                            aria-label={showSecrets ? "Hide token" : "Show token"}
                          >
                            {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {fieldErrors.serverToken ? (
                          <p className="text-xs text-red-600" role="alert">
                            {fieldErrors.serverToken}
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            The stored token is never shown. Leave this blank to keep it, or paste a new token to
                            replace it.
                          </p>
                        )}
                        {secretMode === "replace" && activeSource?.hasCredentials ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReplacingSecret(false);
                              setForm((f) => ({ ...f, serverToken: "" }));
                            }}
                          >
                            Cancel replace
                          </Button>
                        ) : null}
                      </div>
                    )}
                    {isTrestle && secretMode === "hidden_configured" && (
                      <div className="space-y-2 sm:col-span-2">
                        <p className="text-sm font-medium" data-testid="inventory-credential-configured">
                          {inventoryCredentialConfiguredLabel("trestle")}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setReplacingSecret(true)}
                          data-testid="button-inventory-replace-token"
                        >
                          {inventoryReplaceSecretLabel("trestle")}
                        </Button>
                      </div>
                    )}
                    {isTrestle && secretMode !== "hidden_configured" && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="inventory-client-id">Client ID</Label>
                          <Input
                            id="inventory-client-id"
                            value={form.clientId}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, clientId: e.target.value }));
                              clearFieldError("clientId");
                            }}
                            placeholder="Paste Trestle client ID"
                            autoComplete="off"
                            aria-invalid={inventoryFieldHasError(fieldErrors, "clientId")}
                            className={inventoryInputClass(inventoryFieldHasError(fieldErrors, "clientId"))}
                            data-testid="input-inventory-client-id"
                          />
                          {fieldErrors.clientId && (
                            <p className="text-xs text-red-600" role="alert">
                              {fieldErrors.clientId}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="inventory-client-secret">Client secret</Label>
                          <div className="relative">
                            <Input
                              id="inventory-client-secret"
                              type={showSecrets ? "text" : "password"}
                              value={form.clientSecret}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, clientSecret: e.target.value }));
                                clearFieldError("clientSecret");
                              }}
                              placeholder="Paste Trestle client secret"
                              autoComplete="off"
                              aria-invalid={inventoryFieldHasError(fieldErrors, "clientSecret")}
                              className={inventoryInputClass(
                                inventoryFieldHasError(fieldErrors, "clientSecret"),
                                "pr-10",
                              )}
                              data-testid="input-inventory-client-secret"
                            />
                            <button
                              type="button"
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              onClick={() => setShowSecrets((v) => !v)}
                              aria-label={showSecrets ? "Hide secret" : "Show secret"}
                            >
                              {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {fieldErrors.clientSecret ? (
                            <p className="text-xs text-red-600" role="alert">
                              {fieldErrors.clientSecret}
                            </p>
                          ) : (
                            activeSource?.hasCredentials && (
                              <p className="text-[11px] text-muted-foreground">
                                Credentials are stored securely and never shown again after save. Paste updated
                                values here to rotate your Trestle client secret.
                              </p>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </>
                </div>
              )}

              {formOpen && isListingSyncProvider && providerAvailable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-brand-green hover:bg-brand-green/90"
                    disabled={saveMutation.isPending}
                    onClick={handleSave}
                    data-testid="button-inventory-save"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving…
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={syncMutation.isPending || syncRunning || !activeSource}
                    onClick={() => activeSource && handleSyncSource(activeSource.id)}
                    data-testid="button-inventory-sync"
                  >
                    {syncMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Connecting…
                      </>
                    ) : (
                      <>
                        <RefreshCw className={cn("h-4 w-4 mr-1", syncRunning && "animate-spin")} />
                        {syncRunning ? "Syncing…" : "Sync now"}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {formOpen && activeSource && isListingSyncProvider && (
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
                    <div>
                      <dt className="text-muted-foreground">Connection status</dt>
                      <dd className="font-medium flex items-center gap-1.5">
                        {syncRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                        {!syncRunning && activeSource.connectionStatus === "connected" && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        {!syncRunning && activeSource.connectionStatus === "error" && (
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                        {connectionStatusLabel}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total synced</dt>
                      <dd className="font-medium tabular-nums" data-testid="inventory-total-synced">
                        {(inventoryStats?.totalSynced ?? activeSource.listingCount).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Active listings available</dt>
                      <dd className="font-medium tabular-nums" data-testid="inventory-active-for-matching">
                        {(inventoryStats?.activeForMatching ?? 0).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Listing cap</dt>
                      <dd className="font-medium tabular-nums" data-testid="inventory-configured-cap">
                        {(inventoryStats?.configuredCap ?? form.maxListings).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last sync</dt>
                      <dd className="font-medium">{lastSyncAt ?? "Never"}</dd>
                    </div>
                  </dl>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => setShowDiagnostics((open) => !open)}
                    data-testid="button-inventory-show-diagnostics"
                  >
                    {showDiagnostics ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5 mr-1" />
                        Hide diagnostics
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 mr-1" />
                        Show diagnostics
                      </>
                    )}
                  </Button>

                  {showDiagnostics && (
                    <div
                      className="rounded-md border border-gray-200 bg-white/80 p-3 space-y-3"
                      data-testid="inventory-source-diagnostics"
                    >
                      <dl className="grid gap-2 sm:grid-cols-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Inactive / off-market</dt>
                          <dd className="font-medium tabular-nums" data-testid="inventory-inactive-off-market">
                            {(inventoryStats?.inactiveOffMarket ?? 0).toLocaleString()}
                          </dd>
                        </div>
                        {datasetId && (
                          <div>
                            <dt className="text-muted-foreground">Dataset ID</dt>
                            <dd className="font-medium font-mono">{datasetId}</dd>
                          </div>
                        )}
                        {originatingSystem && (
                          <div>
                            <dt className="text-muted-foreground">Originating system</dt>
                            <dd className="font-medium font-mono">{originatingSystem}</dd>
                          </div>
                        )}
                        {pagesProcessed != null && (
                          <div>
                            <dt className="text-muted-foreground">Pages processed</dt>
                            <dd className="font-medium tabular-nums">{pagesProcessed.toLocaleString()}</dd>
                          </div>
                        )}
                        {apiRequests != null && apiRequests > 0 && (
                          <div>
                            <dt className="text-muted-foreground">API requests</dt>
                            <dd className="font-medium tabular-nums">{apiRequests.toLocaleString()}</dd>
                          </div>
                        )}
                        <div>
                          <dt className="text-muted-foreground">Last sync fetched</dt>
                          <dd className="font-medium tabular-nums">
                            {lastSyncFetched != null ? lastSyncFetched.toLocaleString() : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Last sync upserted</dt>
                          <dd className="font-medium tabular-nums">
                            {lastSyncUpserted != null ? lastSyncUpserted.toLocaleString() : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Skipped due to cap</dt>
                          <dd className="font-medium tabular-nums" data-testid="inventory-skipped-cap">
                            {lastSyncSkippedCap != null ? lastSyncSkippedCap.toLocaleString() : "—"}
                          </dd>
                        </div>
                        {syncFailed && lastFailedSyncAt && (
                          <div>
                            <dt className="text-muted-foreground">Failed sync</dt>
                            <dd className="font-medium">{lastFailedSyncAt}</dd>
                          </div>
                        )}
                        {technicalDetailRows.map((row) => (
                          <div key={row.label}>
                            <dt className="text-muted-foreground">{row.label}</dt>
                            <dd className="font-medium tabular-nums">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                      {devSyncRows.length > 0 && (
                        <div className="border-t border-gray-100 pt-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                            Sync diagnostics
                          </p>
                          <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                            {devSyncRows.map((row) => (
                              <div key={row.label} className="flex justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">{row.label}</span>
                                <span className="font-medium tabular-nums text-right">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {importJustFinished && !syncFailed && (
                    <Alert className="border-emerald-200 bg-emerald-50/80 py-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      <AlertTitle className="text-sm text-emerald-950">Import complete</AlertTitle>
                      <AlertDescription className="text-xs text-emerald-900/90">
                        {(inventoryStats?.totalSynced ?? activeSource.listingCount) > 0
                          ? `${(inventoryStats?.totalSynced ?? activeSource.listingCount).toLocaleString()} listings synced (${(inventoryStats?.activeForMatching ?? 0).toLocaleString()} active listings available).`
                          : "Sync finished. No listings were imported — verify your dataset ID and token with Bridge Data Output."}
                      </AlertDescription>
                    </Alert>
                  )}

                  {syncFailed && activeSource.lastSyncError && (
                    <Alert variant="destructive" className="py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-sm">
                        {activeSource.connectionStatus === "connected" ? "Import failed" : "Sync failed"}
                      </AlertTitle>
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

                  {publicationStats && (
                    <div
                      className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 space-y-3"
                      data-testid="inventory-agent-page-publication"
                    >
                      <p className="font-medium text-gray-900">Agent Page listings</p>
                      <dl className="grid gap-3 sm:grid-cols-2 text-xs sm:text-sm">
                        <div>
                          <dt className="text-muted-foreground">Synced listings</dt>
                          <dd className="font-medium tabular-nums" data-testid="publication-total-synced">
                            {publicationStats.totalSynced.toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">MLS eligible</dt>
                          <dd className="font-medium tabular-nums" data-testid="publication-mls-eligible">
                            {publicationStats.mlsEligible.toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Published to Agent Page</dt>
                          <dd className="font-medium tabular-nums" data-testid="publication-published">
                            {publicationStats.publishedOnAgentPage.toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Hidden / unpublished</dt>
                          <dd className="font-medium tabular-nums" data-testid="publication-hidden">
                            {publicationStats.hiddenUnpublished.toLocaleString()}
                          </dd>
                        </div>
                      </dl>

                      {!publicationStats.workspacePublishEnabled && (
                        <p className="text-xs text-amber-700 leading-snug">
                          Turn on &quot;Publish listings publicly&quot; in Agent Page settings before publishing to your
                          Agent Page.
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          disabled={
                            bulkPublishMutation.isPending ||
                            !publicationStats.workspacePublishEnabled ||
                            publicationStats.eligibleToPublish === 0
                          }
                          onClick={() => setBulkPublishConfirmOpen(true)}
                          data-testid="button-bulk-publish-agent-page"
                        >
                          {bulkPublishMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Publishing…
                            </>
                          ) : (
                            "Publish eligible listings to Agent Page"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            bulkUnpublishMutation.isPending || publicationStats.publishedOnAgentPage === 0
                          }
                          onClick={() => setBulkUnpublishConfirmOpen(true)}
                          data-testid="button-bulk-unpublish-agent-page"
                        >
                          {bulkUnpublishMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Unpublishing…
                            </>
                          ) : (
                            "Unpublish all from Agent Page"
                          )}
                        </Button>
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
                        if (activeSource) setDisconnectSourceId(activeSource.id);
                        setRemoveSourceConfirmOpen(true);
                      }}
                    >
                      {deleteMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Removing…
                        </>
                      ) : (
                        "Disconnect"
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

  const removeSourceDialog = (
    <AlertDialog open={removeSourceConfirmOpen} onOpenChange={setRemoveSourceConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect inventory source?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This will disconnect this MLS feed and remove all synced listings imported from this source. This
                action cannot be undone.
              </p>
              {disconnectSource != null && (
                <p>
                  This source currently has {(disconnectSource.inventoryStats?.totalSynced ?? disconnectSource.listingCount).toLocaleString()} synced listing
                  {(disconnectSource.inventoryStats?.totalSynced ?? disconnectSource.listingCount) === 1 ? "" : "s"}
                  {disconnectSource.inventoryStats
                    ? ` (${disconnectSource.inventoryStats.activeForMatching.toLocaleString()} active listings available, cap ${disconnectSource.inventoryStats.configuredCap.toLocaleString()}).`
                    : "."}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Removing…
              </>
            ) : (
              "Disconnect"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const bulkPublishDialog = (
    <AlertDialog open={bulkPublishConfirmOpen} onOpenChange={setBulkPublishConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish listings to Agent Page?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This will publish{" "}
                <span className="font-medium text-gray-900 tabular-nums">
                  {(publicationStats?.eligibleToPublish ?? 0).toLocaleString()}
                </span>{" "}
                MLS-eligible active/coming soon listings to your Agent Page.
              </p>
              <p>
                Only listings that pass MLS compliance will be published. Sold, expired, and off-market listings are
                excluded.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkPublishMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={bulkPublishMutation.isPending}
            onClick={() => bulkPublishMutation.mutate()}
          >
            {bulkPublishMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Publishing…
              </>
            ) : (
              "Publish listings"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const bulkUnpublishDialog = (
    <AlertDialog open={bulkUnpublishConfirmOpen} onOpenChange={setBulkUnpublishConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unpublish all from Agent Page?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                This will unpublish{" "}
                <span className="font-medium text-gray-900 tabular-nums">
                  {(publicationStats?.publishedOnAgentPage ?? 0).toLocaleString()}
                </span>{" "}
                listings from your Agent Page. Inventory data stays synced — nothing is deleted.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkUnpublishMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            disabled={bulkUnpublishMutation.isPending}
            onClick={() => bulkUnpublishMutation.mutate()}
          >
            {bulkUnpublishMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Unpublishing…
              </>
            ) : (
              "Unpublish all"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isCompact) {
    return (
      <>
        <Card
          id={RGE_INVENTORY_SETTINGS_HASH}
          className={cn("border-gray-200 scroll-mt-24", className)}
          data-testid="card-inventory-sources-compact"
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-brand-green" />
              Inventory sources
            </CardTitle>
            <CardDescription>Manage connected feeds or add another listing provider.</CardDescription>
          </CardHeader>
          <CardContent>{inner}</CardContent>
        </Card>
        {removeSourceDialog}
        {bulkPublishDialog}
        {bulkUnpublishDialog}
      </>
    );
  }

  return (
    <>
      <section
        id={RGE_INVENTORY_SETTINGS_HASH}
        className={cn("space-y-4 scroll-mt-24", className)}
        data-testid="section-inventory-sources"
      >
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Inventory sources</h2>
          <p className="mt-1 text-sm text-gray-600">
            Connected feeds stay configured. Add another provider only if this workspace does not already use it.
          </p>
        </div>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Home className="h-5 w-5 text-brand-green" />
              Inventory sources
            </CardTitle>
            <CardDescription>
              Review connected feeds, edit the existing source, or connect a provider that is still available.
              Credentials are encrypted and never returned to the browser after save.
            </CardDescription>
          </CardHeader>
          <CardContent>{inner}</CardContent>
        </Card>
      </section>
      {removeSourceDialog}
      {bulkPublishDialog}
      {bulkUnpublishDialog}
    </>
  );
}

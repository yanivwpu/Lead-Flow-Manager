import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  inventorySourcePauseUrl,
  inventorySourceResumeUrl,
  inventorySourceSyncUrl,
  loadInventorySourceForm,
  normalizeInventorySourcesQueryData,
  shouldResetInventoryForm,
  shouldSyncAfterInventoryCredentialSave,
} from "@/lib/inventorySourceFormState";
import {
  applySecretReplacementToForm,
  applyInventorySourceSyncAcceptedState,
  buildInventorySourceSummaryCard,
  canConnectInventoryProvider,
  inventoryConnectedSourceIdentityLine,
  inventoryConnectionStateBadgeClass,
  inventoryCredentialConfiguredLabel,
  inventoryReplaceSecretHelperText,
  inventoryReplaceSecretLabel,
  inventorySecretFieldMode,
  listInventoryConnectorAvailability,
  resolveInventoryFormPanel,
  shouldCloseInventorySourceEditorAfterSave,
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
} from "@shared/inventory/inventoryProviderDisplay";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { providerSupportsListingSync } from "@shared/inventory/inventoryProviderSchema";
import { Home, RefreshCw, Eye, EyeOff, AlertCircle, Loader2, MoreHorizontal, Pause, Play } from "lucide-react";
import { INVENTORY_MAX_LISTINGS_OPTIONS, DEFAULT_MAX_LISTINGS } from "@shared/inventory/reso/resoSyncScope";
import { RGE_INVENTORY_SETTINGS_HASH, RGE_INVENTORY_SETTINGS_PATH } from "@shared/rgePaths";

type Props = {
  variant?: "section" | "compact";
  className?: string;
};

const PRODUCTION_UI = import.meta.env.PROD;

function defaultDisplayNamePlaceholder(t: TFunction, provider: InventoryProvider): string {
  if (provider === "bridge_interactive") {
    return PRODUCTION_UI ? t("rgeInventory.myBridge") : t("rgeInventory.bridgeSource");
  }
  if (provider === "trestle") {
    return PRODUCTION_UI ? t("rgeInventory.myTrestle") : t("rgeInventory.trestleSource");
  }
  return PRODUCTION_UI ? t("rgeInventory.myMls") : t("rgeInventory.primarySource");
}

function datasetIdPlaceholder(t: TFunction): string {
  return PRODUCTION_UI ? t("rgeInventory.bridgeAccount") : "e.g. abor_ref";
}

function originatingSystemPlaceholder(t: TFunction, provider: InventoryProvider): string {
  if (provider === "trestle") {
    return PRODUCTION_UI ? t("rgeInventory.trestleConfig") : "e.g. trestle";
  }
  return PRODUCTION_UI ? t("rgeInventory.mlsProvider") : "e.g. miamire";
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
  const { t } = useTranslation();
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
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<InventoryProvider | null>(null);
  const [replacingSecret, setReplacingSecret] = useState(false);
  const [showConnectorPicker, setShowConnectorPicker] = useState(false);
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
      const replacing = !isUpdate || replacingSecret;
      const payload = buildInventorySourcePayload(
        selectedProvider as "mls_grid" | "trestle" | "bridge_interactive",
        applySecretReplacementToForm(form, replacing),
        isUpdate,
      );
      const saveReq = inventorySourceSaveRequest(activeSource);
      const res = await apiRequest(saveReq.method, saveReq.url, payload);
      const saved = (await res.json()) as { source?: PublicInventorySource };
      const sourceId = saved.source?.id;
      if (shouldSyncAfterInventoryCredentialSave(payload) && sourceId) {
        const syncRes = await fetch(inventorySourceSyncUrl({ id: sourceId }), {
          method: "POST",
          credentials: "include",
        });
        const body = (await syncRes.json().catch(() => ({}))) as { error?: string; code?: string };
        if (!syncRes.ok) {
          return {
            source: saved.source,
            syncStarted: false,
            syncError: body.error || `Connection could not be verified (${syncRes.status}).`,
          };
        }
        return { source: saved.source, syncStarted: true, syncError: null as string | null };
      }
      return { source: saved.source, syncStarted: false, syncError: null as string | null };
    },
    onSuccess: (payload: {
      source?: PublicInventorySource;
      syncStarted?: boolean;
      syncError?: string | null;
    }) => {
      if (payload?.source) {
        const nextSource =
          payload.syncStarted && !payload.syncError
            ? applyInventorySourceSyncAcceptedState(payload.source)
            : payload.source;
        queryClient.setQueryData(sourcesQueryKey, (prev: unknown) =>
          applyInventorySourcesCacheUpdate(prev, nextSource),
        );
      }
      setForm((f) => clearInventorySourceSecrets(f));
      setMaxListingsDraft(null);
      setReplacingSecret(false);
      if (!shouldCloseInventorySourceEditorAfterSave({ syncError: payload.syncError })) {
        setFormBannerError(friendlyInventoryErrorMessage((payload.syncError || "").replace(/^\d+:\s*/, "")));
        void refetchSources();
        toast({
          title: t("rgeInventory.savedFailed"),
          description: friendlyInventoryErrorMessage((payload.syncError || "").replace(/^\d+:\s*/, "")),
          variant: "destructive",
        });
        return;
      }
      setConnectingProvider(null);
      setEditingSourceId(null);
      hydratedIdentityRef.current = null;
      clearFormValidation();
      if (payload.syncStarted) {
        queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
        toast({
          title: t("rgeInventory.connectionUpdated"),
          description: t("rgeInventory.replacementSaved"),
        });
        return;
      }
      toast({
        title: t("rgeInventory.saved"),
        description: t("rgeInventory.backgroundEnabled"),
      });
    },
    onError: (err: Error) => {
      setFormBannerError(friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")));
      toast({
        title: t("rgeInventory.saveError"),
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
        title: t("rgeInventory.syncStarted"),
        description: t("rgeInventory.backgroundSync"),
      });
      void refetchSources();
    },
    onError: (err: Error & { validationFailed?: boolean }) => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: err.validationFailed ? t("rgeInventory.validationFailed") : t("rgeInventory.syncFailed"),
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const runFormValidation = () => {
    clearFormValidation();

    if (!formOpen || !providerAvailable || !providerSupportsListingSync(selectedProvider)) {
      toast({
        title: t("rgeInventory.providerUnavailable"),
      });
      return false;
    }

    const validation = validateInventorySourceForm({
      provider: selectedProvider,
      form,
      isUpdate: !!activeSource,
      hasStoredCredentials: activeSource?.hasCredentials ?? false,
      replacingSecret,
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

  const pauseMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await fetch(inventorySourcePauseUrl({ id: sourceId }), {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not pause sync.");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: t("rgeInventory.syncPaused"),
        description: "No new scheduled, retry, or manual syncs will run. Listings and credentials were kept.",
      });
      void refetchSources();
    },
    onError: (err: Error) => {
      toast({
        title: t("rgeInventory.pauseError"),
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const res = await fetch(inventorySourceResumeUrl({ id: sourceId }), {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Could not resume sync.");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: t("rgeInventory.syncResumed"),
        description: "Scheduled and manual syncs can run again. Use Sync now if you want an immediate run.",
      });
      void refetchSources();
    },
    onError: (err: Error) => {
      toast({
        title: t("rgeInventory.resumeError"),
        description: friendlyInventoryErrorMessage(err.message.replace(/^\d+:\s*/, "")),
        variant: "destructive",
      });
    },
  });

  const handleSyncSource = (sourceId: string) => {
    syncMutation.mutate(sourceId);
  };

  const openEditSettings = (sourceId: string, reconnect = false) => {
    hydratedIdentityRef.current = null;
    setConnectingProvider(null);
    setEditingSourceId(sourceId);
    setReplacingSecret(reconnect);
    setShowConnectorPicker(false);
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
      toast({ title: t("rgeInventory.disconnected") });
    },
    onError: (err: Error) => {
      toast({
        title: t("rgeInventory.removeError"),
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
        title: t("rgeInventory.published"),
        description: `${result.published.toLocaleString()} listing${result.published === 1 ? "" : "s"} now appear on your Agent Page.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: t("rgeInventory.publishError"), description: err.message, variant: "destructive" });
    },
  });

  const bulkUnpublishMutation = useMutation({
    mutationFn: bulkUnpublishAllListings,
    onSuccess: (result) => {
      setBulkUnpublishConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
      toast({
        title: t("rgeInventory.unpublished"),
        description: `${result.unpublished.toLocaleString()} listing${result.unpublished === 1 ? "" : "s"} removed from your Agent Page.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: t("rgeInventory.unpublishError"), description: err.message, variant: "destructive" });
    },
  });

  if (statusLoading) {
    return null;
  }

  if (!status?.featureEnabled) {
    return null;
  }

  const isCompact = variant === "compact";
  const isListingSyncProvider = providerSupportsListingSync(selectedProvider);
  const isMlsGrid = selectedProvider === "mls_grid";
  const isTrestle = selectedProvider === "trestle";
  const isBridge = selectedProvider === "bridge_interactive";
  const secretMode = inventorySecretFieldMode({
    isUpdate: !!activeSource,
    hasStoredCredentials: activeSource?.hasCredentials ?? false,
    replacing: replacingSecret,
  });
  const hasConnectedSource = connectedSummaries.length > 0;
  const showConnectors = !hasConnectedSource || showConnectorPicker;
  const editorOpen = formOpen && isListingSyncProvider && providerAvailable;

  const inner = (
    <div className={cn("space-y-4", className)}>
      {!status.rgeInstalled && !hideGrowthEngine && (
        <Alert className="border-amber-200 bg-amber-50/80">
          <AlertCircle className="h-4 w-4 text-amber-800" />
          <AlertTitle className="text-amber-950">{t("rgeInventory.engineRequired")}</AlertTitle>
          <AlertDescription className="text-amber-900/90 text-sm">
            {t("rgeInventory.installHint")}{" "}
            <Link href={RGE_INVENTORY_SETTINGS_PATH} className="font-medium underline underline-offset-2">
              {t("rgeApp.openEngine")}
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {status.canUse && (
        <>
          {!isCompact && <p className="text-sm text-muted-foreground">
            {t("rgeInventory.inventoryHelp")}
          </p>}

          {sourcesError ? (
            <Alert className="border-red-200 bg-red-50/80">
              <AlertCircle className="h-4 w-4 text-red-800" />
              <AlertTitle className="text-red-950">{t("rgeInventory.loadError")}</AlertTitle>
              <AlertDescription className="text-red-900/90 text-sm flex flex-wrap items-center gap-2">
                {t("rgeInventory.tryAgain")}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchSources()}
                  data-testid="button-inventory-sources-retry"
                >
                  {t("common.tryAgain")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : sourcesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("rgeInventory.loading")}
            </div>
          ) : (
            <>
              {hasConnectedSource && (
                <div className="space-y-2" data-testid="inventory-connected-sources">
                  <h3 className="sr-only">{t("rgeInventory.sources")}</h3>
                  {connectedSummaries.map((card) => {
                    const source = sources.find((s) => s.id === card.sourceId);
                    const cardSyncing = source?.lastSyncStatus === "running";
                    return (
                      <div
                        key={card.sourceId}
                        className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2"
                        data-testid={`inventory-source-card-${card.sourceId}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{card.providerLabel}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {inventoryConnectedSourceIdentityLine(card)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                                inventoryConnectionStateBadgeClass(card.connectionState),
                              )}
                              data-testid="inventory-source-connection-state"
                            >
                              {card.connectionStateLabel}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  aria-label={t("rgeInventory.more")}
                                  data-testid="button-inventory-source-more"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => openEditSettings(card.sourceId, false)}
                                  data-testid="button-inventory-edit"
                                >
                                  {t("rgeInventory.edit")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  disabled={deleteMutation.isPending}
                                  onClick={() => {
                                    setDisconnectSourceId(card.sourceId);
                                    setRemoveSourceConfirmOpen(true);
                                  }}
                                  data-testid="button-inventory-remove"
                                >
                                  {t("rgeInventory.disconnect")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-700">
                          <span className="font-semibold tabular-nums" data-testid="inventory-total-synced">{card.listingCountLabel}</span>
                          <span>{cardSyncing ? t("rgeInventory.syncing") : card.syncPaused ? "Sync paused" : `Last successful sync ${card.lastSuccessfulSyncLabel}`}</span>
                        </p>
                        {(card.listingsScanned > 0 || card.totalStoredRows > card.listingCount) && (
                          <details className="text-sm text-slate-700">
                            <summary className="cursor-pointer">{t("rgeInventory.syncDetails")}</summary>
                            <div className="mt-1 flex flex-wrap gap-3">
                              <span data-testid="inventory-listings-scanned">{t("rgeInventory.scanned")} {card.listingsScanned.toLocaleString()}</span>
                              <span data-testid="inventory-stored-rows">{card.totalStoredRows.toLocaleString()} stored rows</span>
                            </div>
                          </details>
                        )}
                        {card.lastError ? (
                          <p className="text-xs text-red-700 leading-snug" data-testid="inventory-sync-error">
                            {card.lastError}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {card.showReconnect ? (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-brand-green hover:bg-brand-green/90"
                              onClick={() => openEditSettings(card.sourceId, true)}
                              data-testid="button-inventory-fix-connection"
                            >
                              {t("rgeInventory.fix")}
                            </Button>
                          ) : null}
                          {card.syncPaused ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={resumeMutation.isPending}
                              onClick={() => resumeMutation.mutate(card.sourceId)}
                              data-testid="button-inventory-resume"
                            >
                              {resumeMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4 mr-1" />
                              )}
                              {t("rgeInventory.resume")}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={pauseMutation.isPending || card.connectionState === "disconnected"}
                              onClick={() => pauseMutation.mutate(card.sourceId)}
                              data-testid="button-inventory-pause"
                            >
                              {pauseMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Pause className="h-4 w-4 mr-1" />
                              )}
                              {t("rgeInventory.pause")}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={syncMutation.isPending || cardSyncing || card.connectionState === "disconnected" || card.syncPaused}
                            onClick={() => handleSyncSource(card.sourceId)}
                            data-testid="button-inventory-sync"
                          >
                            {syncMutation.isPending || cardSyncing ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                {t("rgeInventory.syncingPending")}
                              </>
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                {t("rgeInventory.syncNow")}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            {hasConnectedSource && publicationStats && (
              <div
                className="rounded-lg border border-gray-200 bg-white px-4 py-3 space-y-2"
                data-testid="inventory-agent-page-publication"
              >
                <p className="text-sm font-semibold text-gray-900">{t("rgeInventory.pageListings")}</p>
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">{t("rgeInventory.activeListings")}</dt>
                        <dd className="font-medium tabular-nums" data-testid="publication-total-synced">
                          {(publicationStats.activeStored ?? publicationStats.totalSynced).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("rgeInventory.pagePublished")}</dt>
                        <dd className="font-medium tabular-nums" data-testid="publication-published">
                          {publicationStats.publishedOnAgentPage.toLocaleString()}
                        </dd>
                      </div>
                </dl>
                <details className="text-sm text-slate-700">
                  <summary className="cursor-pointer">{t("rgeInventory.publication")}</summary>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">{t("rgeInventory.thisSync")}</dt>
                        <dd className="font-medium tabular-nums" data-testid="publication-listings-scanned">
                          {(publicationStats.listingsScanned ?? 0).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("rgeInventory.storedRows")}</dt>
                        <dd className="font-medium tabular-nums" data-testid="publication-stored-rows">
                          {(publicationStats.totalStoredRows ?? publicationStats.totalSynced).toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("rgeInventory.eligible")}</dt>
                        <dd className="font-medium tabular-nums" data-testid="publication-mls-eligible">
                          {publicationStats.mlsEligible.toLocaleString()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t("rgeInventory.hidden")}</dt>
                        <dd className="font-medium tabular-nums" data-testid="publication-hidden">
                          {publicationStats.hiddenUnpublished.toLocaleString()}
                        </dd>
                      </div>
                  </dl>
                </details>

                    {!publicationStats.workspacePublishEnabled && (
                      <p className="text-xs text-amber-700 leading-snug">
                        {t("rgeInventory.agentPagePublishHint")}
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
                            {t("rgeInventory.publishing")}
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
                            {t("rgeInventory.unpublishing")}
                          </>
                        ) : (
                          "Unpublish all from Agent Page"
                        )}
                      </Button>
                    </div>
                  </div>
                )}

              {hasConnectedSource && !showConnectors ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-0 h-8 text-muted-foreground"
                    onClick={() => setShowConnectorPicker(true)}
                    data-testid="button-inventory-add-another-source"
                  >
                    {t("rgeInventory.addSource")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2" data-testid="inventory-available-connectors">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {hasConnectedSource ? t("rgeInventory.addSource") : t("rgeInventory.connectors")}
                    </h3>
                    {hasConnectedSource ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowConnectorPicker(false)}
                      >
                        {t("rgeInventory.hide")}
                      </Button>
                    ) : null}
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
                            {connector.status === "connected"
                              ? t("rgeApp.connected")
                              : connector.status === "available"
                                ? t("rgeInventory.available")
                                : t("rgeInventory.comingSoon")}
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
                          {connector.status === "available"
                            ? t("settings.connect")
                            : connector.status === "connected" ? t("rgeApp.connected") : t("rgeInventory.comingSoon")}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Dialog
                open={editorOpen}
                onOpenChange={(open) => {
                  if (!open && !saveMutation.isPending) closeFormPanel();
                }}
              >
                <DialogContent
                  className="max-w-xl max-h-[85vh] overflow-y-auto"
                  data-testid="inventory-source-form"
                >
                  <DialogHeader>
                    <DialogTitle>
                      {activeSource
                        ? replacingSecret || activeSource.connectionStatus === "error" || activeSource.lastSyncStatus === "failed"
                          ? t("rgeInventory.fixConnection")
                          : t("rgeInventory.editConnection")
                        : t("rgeInventory.connectProvider", { name: providerOption?.label ?? t("rgeInventory.providerFallback") })}
                    </DialogTitle>
                    <DialogDescription>
                      {activeSource
                        ? t("rgeInventory.savedHint")
                        : t("rgeInventory.newSource")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                      <Label htmlFor="inventory-display-name">{t("rgeInventory.name")}</Label>
                      <Input
                        id="inventory-display-name"
                        value={form.displayName}
                        onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                        placeholder={defaultDisplayNamePlaceholder(t, selectedProvider)}
                        data-testid="input-inventory-display-name"
                      />
                    </div>
                    <div className="space-y-3 sm:col-span-2 rounded-md border border-border/60 bg-muted/20 p-4">
                      <div>
                        <p className="text-sm font-medium">{t("rgeInventory.scope")}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {t("rgeInventory.scopeHelp")}
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="inventory-sync-cities">{t("rgeInventory.cities")}</Label>
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
                          <Label htmlFor="inventory-sync-zips">{t("rgeInventory.zip")}</Label>
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
                          <Label htmlFor="inventory-max-listings">{t("rgeInventory.max")}</Label>
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
                            <Label htmlFor="inventory-dataset-id">{t("rgeInventory.dataset")}</Label>
                            <Input
                              id="inventory-dataset-id"
                              value={form.datasetId}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, datasetId: e.target.value }));
                                clearFieldError("datasetId");
                              }}
                              placeholder={datasetIdPlaceholder(t)}
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
                            <Label htmlFor="inventory-originating-system">{t("rgeInventory.origin")}</Label>
                            <Input
                              id="inventory-originating-system"
                              value={form.originatingSystemName}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, originatingSystemName: e.target.value }));
                                clearFieldError("originatingSystemName");
                              }}
                              placeholder={originatingSystemPlaceholder(t, selectedProvider)}
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
                        <Label htmlFor="inventory-access-token">{t("rgeInventory.accessToken")}</Label>
                        <div className="relative">
                          <Input
                            id="inventory-access-token"
                            type={showSecrets ? "text" : "password"}
                            value={form.accessToken}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, accessToken: e.target.value }));
                              clearFieldError("accessToken");
                            }}
                            placeholder={t("rgeInventory.pasteAccess")}
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
                              {t("rgeInventory.accessHelp")}
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
                        <Label htmlFor="inventory-server-token">{t("rgeInventory.serverToken")}</Label>
                        <div className="relative">
                          <Input
                            id="inventory-server-token"
                            type={showSecrets ? "text" : "password"}
                            value={form.serverToken}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, serverToken: e.target.value }));
                              clearFieldError("serverToken");
                            }}
                            placeholder={t("rgeInventory.bridgeToken")}
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
                            {inventoryReplaceSecretHelperText("bridge_interactive", secretMode === "replace")}
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
                            {t("rgeInventory.cancelReplace")}
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
                          <Label htmlFor="inventory-client-id">{t("rgeInventory.clientId")}</Label>
                          <Input
                            id="inventory-client-id"
                            value={form.clientId}
                            onChange={(e) => {
                              setForm((f) => ({ ...f, clientId: e.target.value }));
                              clearFieldError("clientId");
                            }}
                            placeholder={t("rgeInventory.pasteClient")}
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
                          <Label htmlFor="inventory-client-secret">{t("rgeInventory.clientSecret")}</Label>
                          <div className="relative">
                            <Input
                              id="inventory-client-secret"
                              type={showSecrets ? "text" : "password"}
                              value={form.clientSecret}
                              onChange={(e) => {
                                setForm((f) => ({ ...f, clientSecret: e.target.value }));
                                clearFieldError("clientSecret");
                              }}
                              placeholder={t("rgeInventory.pasteSecret")}
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
                                {t("rgeInventory.secretHelp")}
                              </p>
                            )
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saveMutation.isPending}
                      onClick={closeFormPanel}
                    >
                      {t("common.cancel")}
                    </Button>
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
                          {t("rgeInventory.saving")}
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
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
          <AlertDialogTitle>{t("rgeInventory.disconnectConfirm")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                {t("rgeInventory.disconnectHelp")}
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
          <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("rgeInventory.removing")}
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
          <AlertDialogTitle>{t("rgeInventory.publishConfirm")}</AlertDialogTitle>
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
                {t("rgeInventory.compliance")}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={bulkPublishMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            disabled={bulkPublishMutation.isPending}
            onClick={() => bulkPublishMutation.mutate()}
          >
            {bulkPublishMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("rgeInventory.publishing")}
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
          <AlertDialogTitle>{t("rgeInventory.unpublishConfirm")}</AlertDialogTitle>
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
          <AlertDialogCancel disabled={bulkUnpublishMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            disabled={bulkUnpublishMutation.isPending}
            onClick={() => bulkUnpublishMutation.mutate()}
          >
            {bulkUnpublishMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("rgeInventory.unpublishing")}
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
          <CardHeader className="p-4 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-brand-green" />
              {t("rgeInventory.section")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">{inner}</CardContent>
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
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("rgeInventory.section")}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("rgeInventory.addHint")}
          </p>
        </div>
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Home className="h-5 w-5 text-brand-green" />
              {t("rgeInventory.section")}
            </CardTitle>
            <CardDescription>
              {t("rgeInventory.reviewHint")}
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

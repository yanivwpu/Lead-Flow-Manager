import { normalizeInventorySecretValue } from "@shared/inventory/inventoryCredentialValue";
import {
  INVENTORY_PROVIDER_UI_OPTIONS,
  inventoryProviderUserLabel,
  friendlyInventoryErrorMessage,
} from "@shared/inventory/inventoryProviderDisplay";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { providerSupportsListingSync } from "@shared/inventory/inventoryProviderSchema";
import { formatCommaSeparatedList, readInventorySyncScope } from "@shared/inventory/reso/resoSyncScope";
import type { InventorySourceForm, PublicInventorySource } from "@/lib/inventoryApi";

export type InventoryConnectionUiState = "connected" | "syncing" | "needs_attention" | "disconnected";

export const INVENTORY_CONNECTION_STATE_LABELS: Record<InventoryConnectionUiState, string> = {
  connected: "Connected",
  syncing: "Syncing",
  needs_attention: "Needs attention",
  disconnected: "Disconnected",
};

export type InventoryConnectorAvailability = {
  id: InventoryProvider;
  label: string;
  helper?: string;
  available: boolean;
  exists: boolean;
  status: "available" | "connected" | "coming_soon";
  disabled: boolean;
  statusLabel: string;
  actionLabel: string;
};

export type InventorySourceSummaryCard = {
  sourceId: string;
  provider: InventoryProvider;
  providerLabel: string;
  connectionState: InventoryConnectionUiState;
  connectionStateLabel: string;
  displayName: string;
  datasetId: string | null;
  originatingSystemName: string | null;
  marketScope: string;
  listingCount: number;
  listingCap: number;
  listingCountLabel: string;
  automaticSyncLabel: string;
  lastSuccessfulSyncLabel: string;
  lastError: string | null;
  hasCredentials: boolean;
  credentialConfiguredLabel: string | null;
  showReconnect: boolean;
  isActive: boolean;
};

export type InventoryFormPanel =
  | { kind: "idle" }
  | { kind: "edit"; sourceId: string }
  | { kind: "connect"; provider: InventoryProvider };

export type InventorySecretFieldMode = "hidden_configured" | "replace" | "required_new";

export function deriveInventoryConnectionUiState(
  source: Pick<
    PublicInventorySource,
    "isActive" | "connectionStatus" | "lastSyncStatus" | "hasCredentials" | "lastSyncError"
  >,
): InventoryConnectionUiState {
  if (!source.isActive || source.connectionStatus === "disconnected" || source.connectionStatus === "disconnected_by_user") {
    return "disconnected";
  }
  if (source.lastSyncStatus === "running") {
    return "syncing";
  }
  if (
    !source.hasCredentials ||
    source.connectionStatus === "error" ||
    source.connectionStatus === "configuring" ||
    source.lastSyncStatus === "failed" ||
    Boolean(source.lastSyncError && source.connectionStatus !== "connected")
  ) {
    return "needs_attention";
  }
  return "connected";
}

export function inventoryConnectionStateBadgeClass(state: InventoryConnectionUiState): string {
  switch (state) {
    case "connected":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "syncing":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "needs_attention":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "disconnected":
      return "bg-slate-50 text-slate-600 border-slate-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

export function inventoryCredentialConfiguredLabel(provider: string): string {
  if (provider === "bridge_interactive") return "Server token configured.";
  if (provider === "trestle") return "Client credentials configured";
  if (provider === "mls_grid") return "Access token configured";
  return "Credentials configured";
}

export function inventoryReplaceSecretLabel(provider: string): string {
  if (provider === "trestle") return "Replace credentials";
  return "Replace token";
}

export function inventoryReplaceSecretHelperText(provider: string, replacing: boolean): string {
  if (replacing) {
    if (provider === "bridge_interactive") {
      return "Paste a new Bridge server token. Saving replaces the stored credential and retries the connection.";
    }
    return "Paste the new credential. Saving replaces the stored secret and retries the connection.";
  }
  if (provider === "bridge_interactive") {
    return "Paste your Bridge server token. It is stored encrypted and never shown again.";
  }
  return "Paste your credential. It is stored encrypted and never shown again.";
}

export function inventoryConnectedSourceIdentityLine(
  card: Pick<InventorySourceSummaryCard, "originatingSystemName" | "datasetId" | "providerLabel" | "displayName">,
): string {
  const org = card.originatingSystemName?.trim();
  const dataset = card.datasetId?.trim();
  if (org && dataset) return `${org} / ${dataset}`;
  const name = card.displayName?.trim();
  if (name && dataset && name !== card.providerLabel) return `${name} / ${dataset}`;
  return org || dataset || name || card.providerLabel;
}

export function inventorySecretFieldMode(input: {
  isUpdate: boolean;
  hasStoredCredentials: boolean;
  replacing: boolean;
}): InventorySecretFieldMode {
  if (!input.isUpdate) return "required_new";
  if (input.replacing || !input.hasStoredCredentials) return "replace";
  return "hidden_configured";
}

export function shouldSendInventorySecretOnSave(input: {
  isUpdate: boolean;
  replacing: boolean;
  secretValue: string;
}): boolean {
  if (!input.isUpdate) return true;
  if (!input.replacing) return false;
  return normalizeInventorySecretValue(input.secretValue).length > 0;
}

export function formatInventoryMarketScope(config: Record<string, unknown> | undefined): string {
  const scope = readInventorySyncScope(config ?? {});
  const cities = formatCommaSeparatedList(scope.cities);
  const zips = formatCommaSeparatedList(scope.zipCodes);
  if (!cities && !zips) return "All markets";
  if (cities && zips) return `${cities} · ${zips}`;
  return cities || zips;
}

const LISTING_SYNC_PROVIDERS = new Set(["mls_grid", "trestle", "bridge_interactive"]);

/** Matches `listListingSyncSourcesForReconciliation` — not inferred from row existence. */
export function isInventorySourceEnrolledInBackgroundSync(
  source: Pick<
    PublicInventorySource,
    "isActive" | "connectionStatus" | "listingSyncSupported" | "provider" | "config"
  >,
): boolean {
  if (!source.isActive) return false;
  if (source.connectionStatus !== "connected") return false;
  if (source.listingSyncSupported === false) return false;
  if (!LISTING_SYNC_PROVIDERS.has(source.provider)) return false;
  return source.config?.initialImportComplete === true;
}

function lastSuccessfulSyncIso(source: PublicInventorySource): string | null {
  const fromStats = source.lastSyncStats?.lastSuccessfulSyncAt;
  if (typeof fromStats === "string" && fromStats.trim()) return fromStats;
  const fromConfig = source.config?.lastSuccessfulSyncAt;
  if (typeof fromConfig === "string" && fromConfig.trim()) return fromConfig;
  if (source.lastSyncStatus === "success" && typeof source.lastSyncAt === "string" && source.lastSyncAt.trim()) {
    return source.lastSyncAt;
  }
  return null;
}

export function automaticInventorySyncLabel(
  source: PublicInventorySource,
  connectionState: InventoryConnectionUiState,
): string {
  if (connectionState === "syncing" || source.lastSyncStatus === "running") {
    return "Sync in progress";
  }
  if (connectionState === "disconnected" || !source.isActive) {
    return "Automatic sync off";
  }
  if (isInventorySourceEnrolledInBackgroundSync(source)) {
    return "Automatic background sync is on";
  }
  const listingSyncProvider =
    source.listingSyncSupported !== false && LISTING_SYNC_PROVIDERS.has(source.provider);
  if (
    listingSyncProvider &&
    (source.connectionStatus === "connected" || source.connectionStatus === "configuring") &&
    source.config?.initialImportComplete !== true
  ) {
    return "Automatic background sync starts after the first completed import";
  }
  if (listingSyncProvider) {
    return "Automatic sync paused until this is resolved";
  }
  return "Automatic listing sync is not available for this provider";
}

export function formatInventorySyncTimestamp(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleString();
}

export function buildInventorySourceSummaryCard(source: PublicInventorySource): InventorySourceSummaryCard {
  const provider = source.provider as InventoryProvider;
  const connectionState = deriveInventoryConnectionUiState(source);
  const listingCount = source.inventoryStats?.totalSynced ?? source.listingCount ?? 0;
  const listingCap = source.inventoryStats?.configuredCap ?? readInventorySyncScope(source.config || {}).maxListings;
  const datasetId = typeof source.config?.datasetId === "string" ? source.config.datasetId : null;
  const originatingSystemName =
    typeof source.config?.originatingSystemName === "string" ? source.config.originatingSystemName : null;
  const lastError = source.lastSyncError
    ? friendlyInventoryErrorMessage(source.lastSyncError)
    : null;

  return {
    sourceId: source.id,
    provider,
    providerLabel: inventoryProviderUserLabel(source.provider),
    connectionState,
    connectionStateLabel: INVENTORY_CONNECTION_STATE_LABELS[connectionState],
    displayName: source.displayName || inventoryProviderUserLabel(source.provider),
    datasetId,
    originatingSystemName,
    marketScope: formatInventoryMarketScope(source.config),
    listingCount,
    listingCap,
    listingCountLabel: `${listingCount.toLocaleString()} / ${listingCap.toLocaleString()} cap`,
    automaticSyncLabel: automaticInventorySyncLabel(source, connectionState),
    lastSuccessfulSyncLabel: formatInventorySyncTimestamp(lastSuccessfulSyncIso(source)),
    lastError,
    hasCredentials: Boolean(source.hasCredentials),
    credentialConfiguredLabel: source.hasCredentials ? inventoryCredentialConfiguredLabel(source.provider) : null,
    showReconnect: connectionState === "needs_attention",
    isActive: source.isActive,
  };
}

export function listInventoryConnectorAvailability(
  sources: Array<Pick<PublicInventorySource, "provider">>,
): InventoryConnectorAvailability[] {
  return INVENTORY_PROVIDER_UI_OPTIONS.map((option) => {
    const exists = sources.some((s) => s.provider === option.id);
    if (exists) {
      return {
        id: option.id,
        label: option.label,
        helper: option.helper,
        available: option.available,
        exists: true,
        status: "connected",
        disabled: true,
        statusLabel: "Connected",
        actionLabel: "Connected",
      };
    }
    if (!option.available) {
      return {
        id: option.id,
        label: option.label,
        helper: option.helper,
        available: false,
        exists: false,
        status: "coming_soon",
        disabled: true,
        statusLabel: "Coming soon",
        actionLabel: "Coming soon",
      };
    }
    return {
      id: option.id,
      label: option.label,
      helper: option.helper,
      available: true,
      exists: false,
      status: "available",
      disabled: false,
      statusLabel: "Available",
      actionLabel: "Connect",
    };
  });
}

export function canConnectInventoryProvider(
  provider: InventoryProvider,
  sources: Array<Pick<PublicInventorySource, "provider">>,
): boolean {
  const option = INVENTORY_PROVIDER_UI_OPTIONS.find((o) => o.id === provider);
  if (!option?.available || !providerSupportsListingSync(provider)) return false;
  return !sources.some((s) => s.provider === provider);
}

export function resolveInventoryFormPanel(input: {
  editingSourceId: string | null;
  connectingProvider: InventoryProvider | null;
  sources: PublicInventorySource[];
}): {
  panel: InventoryFormPanel;
  source: PublicInventorySource | undefined;
  provider: InventoryProvider | null;
  isUpdate: boolean;
} {
  if (input.editingSourceId) {
    const source = input.sources.find((s) => s.id === input.editingSourceId);
    if (source) {
      return {
        panel: { kind: "edit", sourceId: source.id },
        source,
        provider: source.provider as InventoryProvider,
        isUpdate: true,
      };
    }
  }
  if (input.connectingProvider && canConnectInventoryProvider(input.connectingProvider, input.sources)) {
    return {
      panel: { kind: "connect", provider: input.connectingProvider },
      source: undefined,
      provider: input.connectingProvider,
      isUpdate: false,
    };
  }
  return { panel: { kind: "idle" }, source: undefined, provider: null, isUpdate: false };
}

/** Existing sources with errors stay in the connected list — never as a new connector. */
export function existingSourceShouldStayInConnectedList(source: PublicInventorySource): boolean {
  return Boolean(source.id);
}

export function applyInventorySourceSyncAcceptedState(source: PublicInventorySource): PublicInventorySource {
  return {
    ...source,
    connectionStatus: "connected",
    lastSyncStatus: "running",
    lastSyncError: null,
  };
}

export function applyInventorySourceReconnectSuccessState(
  source: PublicInventorySource,
  successfulSyncAt: string,
): PublicInventorySource {
  return {
    ...source,
    connectionStatus: "connected",
    lastSyncStatus: "success",
    lastSyncError: null,
    lastSyncAt: successfulSyncAt,
    lastSyncStats: {
      ...source.lastSyncStats,
      lastSuccessfulSyncAt: successfulSyncAt,
    },
    config: {
      ...source.config,
      initialImportComplete: true,
      lastSuccessfulSyncAt: successfulSyncAt,
    },
  };
}

/** Replacement-token save closes the editor only when persist succeeded and immediate validate/sync did not fail. */
export function shouldCloseInventorySourceEditorAfterSave(outcome: {
  syncError?: string | null;
}): boolean {
  return !outcome.syncError;
}

export function inventoryReconnectFailureMessageIsSafe(message: string, secretValue: string): boolean {
  const secret = secretValue.trim();
  if (!secret) return true;
  return !message.includes(secret);
}

export function applySecretReplacementToForm(
  form: InventorySourceForm,
  replacing: boolean,
): InventorySourceForm {
  if (replacing) return form;
  return {
    ...form,
    accessToken: "",
    clientId: "",
    clientSecret: "",
    serverToken: "",
  };
}

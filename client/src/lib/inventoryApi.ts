import { apiRequest } from "@/lib/queryClient";
import {
  DEFAULT_MAX_LISTINGS,
  INVENTORY_MAX_LISTINGS_OPTIONS,
  buildSyncScopeConfigPatch,
  formatCommaSeparatedList,
  type InventoryMaxListings,
} from "@shared/inventory/reso/resoSyncScope";

import {
  friendlyInventoryErrorMessage,
  formatInventorySyncStatRows,
} from "@shared/inventory/inventoryProviderDisplay";

export type InventoryConnectorStatus = {
  featureEnabled: boolean;
  rgeInstalled: boolean;
  canUse: boolean;
  reason: "feature_disabled" | "rge_not_installed" | "ok";
};

export type PublicInventoryListingStats = {
  activeForMatching: number;
  configuredCap: number;
  totalSynced: number;
  inactiveOffMarket: number;
};

export type PublicInventorySource = {
  id: string;
  provider: string;
  displayName: string;
  connectionStatus: string;
  config: Record<string, unknown>;
  integrationId: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  lastSyncStats: Record<string, unknown>;
  isActive: boolean;
  listingSyncSupported: boolean;
  hasCredentials: boolean;
  /** @deprecated Prefer inventoryStats.totalSynced */
  listingCount: number;
  inventoryStats: PublicInventoryListingStats;
  createdAt: string | null;
  updatedAt: string | null;
};

export async function fetchInventoryStatus(): Promise<InventoryConnectorStatus> {
  const res = await fetch("/api/inventory/status", { credentials: "include", cache: "no-store" });
  if (res.status === 401) throw new Error("401: Unauthorized");
  if (!res.ok) {
    return {
      featureEnabled: false,
      rgeInstalled: false,
      canUse: false,
      reason: "feature_disabled",
    };
  }
  return res.json() as Promise<InventoryConnectorStatus>;
}

export async function fetchInventorySources(): Promise<PublicInventorySource[]> {
  const res = await apiRequest("GET", "/api/inventory/sources");
  const data = (await res.json()) as { sources: PublicInventorySource[] };
  return data.sources ?? [];
}

export type MlsInventorySourceForm = {
  displayName: string;
  originatingSystemName: string;
  accessToken: string;
};

export type TrestleInventorySourceForm = {
  displayName: string;
  originatingSystemName: string;
  clientId: string;
  clientSecret: string;
};

export type InventorySourceForm = MlsInventorySourceForm &
  TrestleInventorySourceForm & {
    datasetId: string;
    serverToken: string;
    syncCities: string;
    syncZipCodes: string;
    maxListings: InventoryMaxListings;
  };

function syncScopeFromForm(form: Pick<InventorySourceForm, "syncCities" | "syncZipCodes" | "maxListings">) {
  return buildSyncScopeConfigPatch(form);
}

export function readSyncScopeFromConfig(config: Record<string, unknown>): Pick<
  InventorySourceForm,
  "syncCities" | "syncZipCodes" | "maxListings"
> {
  const cities = Array.isArray(config.syncCities)
    ? config.syncCities.filter((v): v is string => typeof v === "string")
    : [];
  const zipCodes = Array.isArray(config.syncZipCodes)
    ? config.syncZipCodes.filter((v): v is string => typeof v === "string")
    : [];
  const maxRaw = config.maxListings;
  const maxListings = INVENTORY_MAX_LISTINGS_OPTIONS.includes(maxRaw as InventoryMaxListings)
    ? (maxRaw as InventoryMaxListings)
    : DEFAULT_MAX_LISTINGS;
  return {
    syncCities: formatCommaSeparatedList(cities),
    syncZipCodes: formatCommaSeparatedList(zipCodes),
    maxListings,
  };
}

export function buildMlsSourcePayload(form: InventorySourceForm, isUpdate: boolean) {
  const defaultName = typeof import.meta !== "undefined" && import.meta.env?.PROD
    ? "My MLS inventory"
    : "Primary inventory source";
  const payload: {
    provider: "mls_grid";
    displayName: string;
    config: Record<string, unknown>;
    credentials?: { accessToken: string };
  } = {
    provider: "mls_grid",
    displayName: form.displayName.trim() || defaultName,
    config: {
      originatingSystemName: form.originatingSystemName.trim(),
      expandMedia: true,
      ...syncScopeFromForm(form),
    },
  };
  const token = form.accessToken.trim();
  if (token || !isUpdate) {
    payload.credentials = { accessToken: token };
  }
  return payload;
}

export function buildTrestleSourcePayload(form: InventorySourceForm, isUpdate: boolean) {
  const defaultName =
    typeof import.meta !== "undefined" && import.meta.env?.PROD
      ? "My Trestle inventory"
      : "Trestle inventory source";
  const payload: {
    provider: "trestle";
    displayName: string;
    config: Record<string, unknown>;
    credentials?: { clientId: string; clientSecret: string };
  } = {
    provider: "trestle",
    displayName: form.displayName.trim() || defaultName,
    config: {
      originatingSystemName: form.originatingSystemName.trim(),
      expandMedia: true,
      ...syncScopeFromForm(form),
    },
  };
  const clientId = form.clientId.trim();
  const clientSecret = form.clientSecret.trim();
  if (!isUpdate || clientId || clientSecret) {
    payload.credentials = { clientId, clientSecret };
  }
  return payload;
}

export function buildBridgeSourcePayload(form: InventorySourceForm, isUpdate: boolean) {
  const defaultName =
    typeof import.meta !== "undefined" && import.meta.env?.PROD
      ? "My Bridge inventory"
      : "Bridge inventory source";
  const payload: {
    provider: "bridge_interactive";
    displayName: string;
    config: Record<string, unknown>;
    credentials?: { serverToken: string };
  } = {
    provider: "bridge_interactive",
    displayName: form.displayName.trim() || defaultName,
    config: {
      datasetId: form.datasetId.trim(),
      expandMedia: true,
      ...syncScopeFromForm(form),
    },
  };
  const serverToken = form.serverToken.trim();
  if (serverToken || !isUpdate) {
    payload.credentials = { serverToken };
  }
  return payload;
}

export function buildInventorySourcePayload(
  provider: "mls_grid" | "trestle" | "bridge_interactive",
  form: InventorySourceForm,
  isUpdate: boolean,
) {
  if (provider === "trestle") {
    return buildTrestleSourcePayload(form, isUpdate);
  }
  if (provider === "bridge_interactive") {
    return buildBridgeSourcePayload(form, isUpdate);
  }
  return buildMlsSourcePayload(form, isUpdate);
}

export function formatInventorySyncStatus(status: string | null | undefined): string {
  if (!status) return "Never synced";
  switch (status) {
    case "running":
      return "Sync in progress";
    case "success":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "partial":
      return "Partially completed";
    case "idle":
      return "Ready to sync";
    default:
      return status.replace(/_/g, " ");
  }
}

export function formatInventoryConnectionStatus(status: string | null | undefined): string {
  if (!status) return "Not connected";
  switch (status) {
    case "connected":
      return "Connected";
    case "error":
      return "Connection error";
    case "configuring":
      return "Needs validation";
    case "running":
      return "Syncing";
    default:
      return status.replace(/_/g, " ");
  }
}

/** True when an active listing-sync source has passed validation or sync. */
export function isInventorySourceConnected(sources: PublicInventorySource[]): boolean {
  return sources.some(
    (s) => s.isActive && s.listingSyncSupported && s.connectionStatus === "connected",
  );
}

export { formatInventorySyncStatRows, friendlyInventoryErrorMessage, getInventoryStatusHighlights, formatInventorySourceStatusRows };
export { deriveInventorySourcePhase, inventorySourcePhaseBadgeClass } from "@shared/inventory/inventorySourcePhase";
export type { InventorySourcePhase, InventorySourcePhaseDetails } from "@shared/inventory/inventorySourcePhase";

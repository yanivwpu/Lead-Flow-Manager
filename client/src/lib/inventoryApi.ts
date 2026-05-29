import { apiRequest } from "@/lib/queryClient";

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
  listingCount: number;
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

export function buildMlsSourcePayload(form: MlsInventorySourceForm, isUpdate: boolean) {
  const defaultName = typeof import.meta !== "undefined" && import.meta.env?.PROD
    ? "My MLS inventory"
    : "Primary inventory source";
  const payload: {
    provider: "mls_grid";
    displayName: string;
    config: { originatingSystemName: string; expandMedia: boolean };
    credentials?: { accessToken: string };
  } = {
    provider: "mls_grid",
    displayName: form.displayName.trim() || defaultName,
    config: {
      originatingSystemName: form.originatingSystemName.trim(),
      expandMedia: true,
    },
  };
  const token = form.accessToken.trim();
  if (token || !isUpdate) {
    payload.credentials = { accessToken: token };
  }
  return payload;
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

import { apiRequest } from "@/lib/queryClient";

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
  const payload: {
    provider: "mls_grid";
    displayName: string;
    config: { originatingSystemName: string; expandMedia: boolean };
    credentials?: { accessToken: string };
  } = {
    provider: "mls_grid",
    displayName: form.displayName.trim() || "MLS inventory",
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
      return "Syncing…";
    case "success":
      return "Last sync succeeded";
    case "failed":
      return "Last sync failed";
    case "partial":
      return "Last sync partial";
    case "idle":
      return "Idle";
    default:
      return status.replace(/_/g, " ");
  }
}

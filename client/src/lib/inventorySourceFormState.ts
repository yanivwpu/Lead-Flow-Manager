import { withUserQueryScope } from "@/lib/accountQueryScope";
import {
  EMPTY_LISTING_PUBLICATION_STATS,
  readSyncScopeFromConfig,
  type InventorySourceForm,
  type ListingPublicationStats,
  type PublicInventorySource,
} from "@/lib/inventoryApi";
import {
  sanitizeInventoryDisplayNameForUi,
  sanitizeOriginatingSystemForUi,
} from "@shared/inventory/inventoryProviderDisplay";
import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import { DEFAULT_MAX_LISTINGS } from "@shared/inventory/reso/resoSyncScope";

export const INVENTORY_SOURCES_QUERY_PATH = "/api/inventory/sources";

/** Discriminator so this key never shares cache with a bare sources array. */
export const INVENTORY_SOURCES_BUNDLE_MARKER = { shape: "inventory-sources-bundle" } as const;

export function inventorySourcesQueryKey(userId: string | null | undefined) {
  return withUserQueryScope(
    [INVENTORY_SOURCES_QUERY_PATH, INVENTORY_SOURCES_BUNDLE_MARKER],
    userId,
  );
}

export function inventorySourcesListQueryKey(userId: string | null | undefined) {
  return withUserQueryScope(
    [INVENTORY_SOURCES_QUERY_PATH, { shape: "inventory-sources-list" }],
    userId,
  );
}

export function inventoryProviderStorageKey(userId: string | null | undefined): string {
  const id = userId?.trim();
  return id ? `inventory-selected-provider:${id}` : "inventory-selected-provider";
}

export const EMPTY_INVENTORY_SOURCE_FORM: InventorySourceForm = {
  displayName: "",
  originatingSystemName: "",
  accessToken: "",
  clientId: "",
  clientSecret: "",
  datasetId: "",
  serverToken: "",
  syncCities: "",
  syncZipCodes: "",
  maxListings: DEFAULT_MAX_LISTINGS,
};

export type InventorySourcesQueryBundle = {
  sources: PublicInventorySource[];
  publicationStats: ListingPublicationStats;
};

/**
 * Canonical cache for `inventorySourcesQueryKey` is always
 * `{ sources, publicationStats }`. A bare array belongs on
 * `inventorySourcesListQueryKey` only — never this key.
 */
export function normalizeInventorySourcesQueryData(data: unknown): InventorySourcesQueryBundle {
  if (Array.isArray(data)) {
    return { sources: [], publicationStats: EMPTY_LISTING_PUBLICATION_STATS };
  }
  if (data && typeof data === "object") {
    const obj = data as {
      sources?: unknown;
      publicationStats?: ListingPublicationStats;
    };
    if (Array.isArray(obj.sources)) {
      return {
        sources: obj.sources as PublicInventorySource[],
        publicationStats: obj.publicationStats ?? EMPTY_LISTING_PUBLICATION_STATS,
      };
    }
  }
  return { sources: [], publicationStats: EMPTY_LISTING_PUBLICATION_STATS };
}

export function resolveActiveInventorySource(
  sources: PublicInventorySource[],
  selectedProvider: string,
): PublicInventorySource | undefined {
  return sources.find((s) => s.provider === selectedProvider);
}

export function inventoryFormHydrationIdentity(input: {
  workspaceUserId?: string | null;
  selectedProvider: string;
  sourceId?: string | null;
}): string {
  return `${input.workspaceUserId?.trim() || "anon"}:${input.selectedProvider}:${input.sourceId ?? ""}`;
}

/** Reset only on first load or when workspace / provider / source identity changes. */
export function shouldResetInventoryForm(
  previousIdentity: string | null,
  nextIdentity: string,
): boolean {
  if (!previousIdentity) return true;
  return previousIdentity !== nextIdentity;
}

export function loadInventorySourceForm(
  source: PublicInventorySource | undefined,
  isProductionUi: boolean,
): InventorySourceForm {
  if (!source) return { ...EMPTY_INVENTORY_SOURCE_FORM };
  const cfg = source.config || {};
  const rawDisplayName = source.displayName || "";
  const rawOrigin =
    typeof cfg.originatingSystemName === "string" ? cfg.originatingSystemName : "";
  return {
    displayName: sanitizeInventoryDisplayNameForUi(rawDisplayName, isProductionUi),
    originatingSystemName: sanitizeOriginatingSystemForUi(rawOrigin, isProductionUi),
    accessToken: "",
    clientId: "",
    clientSecret: "",
    datasetId: typeof cfg.datasetId === "string" ? cfg.datasetId : "",
    serverToken: "",
    ...readSyncScopeFromConfig(cfg),
  };
}

export function inventorySourceSaveRequest(activeSource: { id: string } | null | undefined): {
  method: "PATCH" | "POST";
  url: string;
} {
  if (activeSource?.id) {
    return { method: "PATCH", url: `/api/inventory/sources/${activeSource.id}` };
  }
  return { method: "POST", url: "/api/inventory/sources" };
}

export function inventorySourceSyncUrl(activeSource: { id: string }): string {
  return `/api/inventory/sources/${activeSource.id}/sync`;
}

export function inventorySourcePauseUrl(activeSource: { id: string }): string {
  return `/api/inventory/sources/${activeSource.id}/pause`;
}

export function inventorySourceResumeUrl(activeSource: { id: string }): string {
  return `/api/inventory/sources/${activeSource.id}/resume`;
}

/** After a replacement token is saved, immediately validate+sync using the persisted row. */
export function shouldSyncAfterInventoryCredentialSave(payload: { credentials?: unknown }): boolean {
  if (!payload.credentials || typeof payload.credentials !== "object") return false;
  return Object.values(payload.credentials as Record<string, unknown>).some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

export function applyInventorySourcesCacheUpdate(
  prev: unknown,
  saved: PublicInventorySource,
): InventorySourcesQueryBundle {
  const normalized = normalizeInventorySourcesQueryData(prev);
  const idx = normalized.sources.findIndex((s) => s.id === saved.id);
  const sources =
    idx >= 0
      ? normalized.sources.map((s, i) => (i === idx ? saved : s))
      : [...normalized.sources, saved];
  return { ...normalized, sources };
}

export function clearInventorySourceSecrets(form: InventorySourceForm): InventorySourceForm {
  return { ...form, accessToken: "", clientId: "", clientSecret: "", serverToken: "" };
}

export function pickInitialInventoryProvider(
  sources: PublicInventorySource[],
  savedProvider: string | null,
  fallback: InventoryProvider = "mls_grid",
): InventoryProvider {
  if (savedProvider && sources.some((s) => s.provider === savedProvider)) {
    return savedProvider as InventoryProvider;
  }
  if (sources.length === 0) {
    return (savedProvider as InventoryProvider) || fallback;
  }
  const running = sources.find((s) => s.lastSyncStatus === "running");
  const connected = sources.find((s) => s.connectionStatus === "connected");
  const preferred = running ?? connected ?? sources[0];
  return (preferred?.provider as InventoryProvider) || fallback;
}

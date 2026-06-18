/**
 * Whether a workspace has inventory connected for Copilot matching.
 * Not the same as "has matches" — zero matches can still be connected.
 */

export type InventoryConnectedSourceInput = {
  isActive?: boolean;
  listingSyncSupported?: boolean;
  connectionStatus?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  hasCredentials?: boolean;
  listingCount?: number;
  inventoryStats?: {
    totalSynced?: number;
    activeForMatching?: number;
  };
};

/** True when workspace inventory is set up enough for Copilot matching UI. */
export function isWorkspaceInventoryConnected(sources: InventoryConnectedSourceInput[]): boolean {
  if (!Array.isArray(sources) || sources.length === 0) return false;

  return sources.some((source) => {
    if (!source.isActive || source.listingSyncSupported === false) return false;

    if (source.connectionStatus === "connected") return true;

    const totalSynced =
      source.inventoryStats?.totalSynced ?? source.listingCount ?? 0;
    if (totalSynced > 0) return true;

    if (source.lastSyncAt) return true;

    if (source.hasCredentials && source.connectionStatus !== "disconnected_by_user") {
      return true;
    }

    return false;
  });
}

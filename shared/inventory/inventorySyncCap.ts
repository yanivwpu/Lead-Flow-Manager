/**
 * Source-wide inventory persist cap and pause/abort decisions.
 * Scanned provider rows are not the same as stored/synced listings.
 */

import { isMatchableInventoryStatus, type InventoryListingStatus } from "./inventoryListingSchema";
import { isComplianceEligibleForPublicPublish } from "./publicListingPublication";
import type { InventoryListingCompliance } from "./inventoryListingCompliance";

export const INVENTORY_SYNC_PAUSE_MESSAGE =
  "Sync paused. Existing listings and credentials were kept.";

export type InventoryPersistSkipReason =
  | "out_of_scope"
  | "over_cap"
  | "ineligible"
  | "paused"
  | "not_matchable";

export type InventoryPersistDecision =
  | { action: "update_existing" }
  | { action: "insert" }
  | { action: "skip"; reason: InventoryPersistSkipReason };

export type InventoryListingPersistInput = {
  exists: boolean;
  inScope: boolean;
  incomingStatus: InventoryListingStatus;
  activeStoredCount: number;
  maxListings: number;
  syncPaused: boolean;
  listingCompliance?: InventoryListingCompliance | null;
};

export function isInventorySyncPaused(config: Record<string, unknown> | null | undefined): boolean {
  return (config || {}).syncPaused === true;
}

export function withInventorySyncPaused(
  config: Record<string, unknown>,
  paused: boolean,
): Record<string, unknown> {
  const next = { ...config, syncPaused: paused };
  if (!paused) delete next.syncPaused;
  return next;
}

export function listingIsMlsEligibleForCappedSet(input: {
  status: InventoryListingStatus;
  listingCompliance?: InventoryListingCompliance | null;
}): boolean {
  if (!isMatchableInventoryStatus(input.status)) return false;
  return isComplianceEligibleForPublicPublish(input.listingCompliance);
}

/**
 * Persistence-boundary decision. Existing rows are always updated so published
 * Agent Page listings keep receiving feed changes. New rows must pass market
 * scope, MLS eligibility, and the source-wide active-stored cap.
 */
export function decideInventoryListingPersist(input: InventoryListingPersistInput): InventoryPersistDecision {
  if (input.syncPaused) return { action: "skip", reason: "paused" };
  if (input.exists) return { action: "update_existing" };
  if (!input.inScope) return { action: "skip", reason: "out_of_scope" };
  if (!isMatchableInventoryStatus(input.incomingStatus)) {
    return { action: "skip", reason: "not_matchable" };
  }
  if (!listingIsMlsEligibleForCappedSet({
    status: input.incomingStatus,
    listingCompliance: input.listingCompliance,
  })) {
    return { action: "skip", reason: "ineligible" };
  }
  if (input.activeStoredCount >= input.maxListings) {
    return { action: "skip", reason: "over_cap" };
  }
  return { action: "insert" };
}

export function shouldHaltInventoryFetch(input: {
  paused?: boolean;
  aborted?: boolean;
  activeStoredCount: number;
  maxListings: number;
}): boolean {
  if (input.paused || input.aborted) return true;
  return input.activeStoredCount >= input.maxListings;
}

export function inventorySyncedListingCount(stats: {
  activeForMatching?: number;
  totalSynced?: number;
  listingCount?: number;
}): number {
  if (typeof stats.activeForMatching === "number" && Number.isFinite(stats.activeForMatching)) {
    return stats.activeForMatching;
  }
  if (typeof stats.totalSynced === "number" && Number.isFinite(stats.totalSynced)) {
    return stats.totalSynced;
  }
  return stats.listingCount ?? 0;
}

export function readListingsScanned(stats: Record<string, unknown> | null | undefined): number {
  const raw = stats?.listingsFetched ?? stats?.listingsScanned;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

export function formatInventorySyncedCapLabel(activeStored: number, cap: number): string {
  return `${activeStored.toLocaleString()} / ${cap.toLocaleString()} cap`;
}

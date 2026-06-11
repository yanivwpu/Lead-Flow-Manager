import type { InventoryConnectorStatus } from "@/lib/inventoryApi";
import { normalizeBuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import { extractBuyerMatchCriteria } from "@shared/inventory/inventoryMatchScoring";

/** Aligns with server `isRealEstateIndustry` in buyerPreferenceService. */
export function isRealEstateWorkspaceIndustry(industry: string | null | undefined): boolean {
  const s = (industry || "").toLowerCase();
  return (
    s.includes("real estate") ||
    s.includes("realestate") ||
    s.includes("realtor") ||
    s.includes("property")
  );
}

export function isBuyerLeadContact(customFields?: Record<string, unknown> | null): boolean {
  const lt = String(customFields?.leadType ?? "").toLowerCase();
  return lt === "buyer";
}

/**
 * Buyer Preferences in Copilot — RGE installed OR real-estate workspace OR buyer lead type.
 * Waits for inventory status before using the RGE-installed path (avoids flash for general CRM).
 */
export function shouldShowCopilotBuyerPreferences(input: {
  inventoryStatus?: InventoryConnectorStatus | null;
  industry?: string | null;
  customFields?: Record<string, unknown> | null;
}): boolean {
  if (isRealEstateWorkspaceIndustry(input.industry)) return true;
  if (isBuyerLeadContact(input.customFields)) return true;
  if (input.inventoryStatus?.rgeInstalled) return true;
  return false;
}

/** Matching Listings — full inventory connector (RGE + env flag). */
export function shouldShowCopilotInventoryPanels(
  inventoryStatus?: InventoryConnectorStatus | null,
): boolean {
  return inventoryStatus?.canUse === true;
}

/** True when saved buyer prefs include fields that can drive inventory matching. */
export function contactHasInventoryMatchCriteria(buyerPreferenceProfile?: unknown): boolean {
  const profile = normalizeBuyerPreferenceProfile(buyerPreferenceProfile);
  if (profile.profileStatus === "empty") return false;
  return extractBuyerMatchCriteria(profile).hasAnyCriteria;
}

/**
 * Per-contact inventory UI — workspace connector must be on AND the contact must
 * be a buyer lead or have inventory-relevant saved preferences (hasAnyCriteria).
 * A non-empty profile alone is not enough (avoids health UI on automation leads).
 */
export function shouldShowCopilotInventoryForContact(input: {
  inventoryStatus?: InventoryConnectorStatus | null;
  customFields?: Record<string, unknown> | null;
  buyerPreferenceProfile?: unknown;
}): boolean {
  if (!shouldShowCopilotInventoryPanels(input.inventoryStatus)) return false;
  if (isBuyerLeadContact(input.customFields)) return true;
  return contactHasInventoryMatchCriteria(input.buyerPreferenceProfile);
}

/** Inventory match health panel — local dev or workspace owner/admin only. */
export function shouldShowInventoryHealthDiagnostics(input: {
  isDev?: boolean;
  isWorkspaceAdmin?: boolean;
}): boolean {
  return !!input.isDev || !!input.isWorkspaceAdmin;
}

import type { InventoryConnectorStatus } from "@/lib/inventoryApi";

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

/** Matching Listings + New Opportunities — full inventory connector (RGE + env flag). */
export function shouldShowCopilotInventoryPanels(
  inventoryStatus?: InventoryConnectorStatus | null,
): boolean {
  return inventoryStatus?.canUse === true;
}

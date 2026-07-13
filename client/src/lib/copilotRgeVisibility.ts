import type { InventoryConnectorStatus } from "@/lib/inventoryApi";
import { normalizeBuyerPreferenceProfile } from "@shared/buyerPreferenceSchema";
import { extractBuyerMatchCriteria } from "@shared/inventory/inventoryMatchScoring";
import {
  resolveAiDomainEligibility,
  type AiDomainEligibilityInput,
} from "@shared/aiDomainEligibility";
import type { SellerIntentClass } from "@shared/sellerIntent";
import {
  isInventoryOwnerDebugEnabled,
  isInventorySupportDebugEnabled,
} from "@/lib/inventoryMatchUi";

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
 * Buyer Preferences in Copilot — uses shared resolveAiDomainEligibility.
 * Visible only for real_estate_buyer / rental / mixed (injectBuyerContext).
 * Workspace RGE alone never shows an empty Buyer Preferences panel.
 */
export function shouldShowCopilotBuyerPreferences(input: {
  inventoryStatus?: InventoryConnectorStatus | null;
  industry?: string | null;
  customFields?: Record<string, unknown> | null;
  hideGrowthEngineForShopify?: boolean;
  inboundText?: string | null;
  conversationText?: string | null;
  contactEmail?: string | null;
  sellerIntent?: SellerIntentClass | null;
  buyerPreferenceProfile?: unknown;
}): boolean {
  if (input.hideGrowthEngineForShopify) return false;
  const domainInput: AiDomainEligibilityInput = {
    inboundText: input.inboundText,
    conversationText: input.conversationText,
    sellerIntent: input.sellerIntent ?? null,
    leadType: String(input.customFields?.leadType ?? ""),
    rgeInstalled: input.inventoryStatus?.rgeInstalled === true,
    industry: input.industry,
    buyerProfileHasCriteria: contactHasInventoryMatchCriteria(input.buyerPreferenceProfile),
    contactEmail: input.contactEmail,
  };
  return resolveAiDomainEligibility(domainInput).showBuyerPreferencesPanel;
}

/** Matching Listings — full inventory connector (RGE + env flag). */
export function shouldShowCopilotInventoryPanels(
  inventoryStatus?: InventoryConnectorStatus | null,
  hideGrowthEngineForShopify?: boolean,
): boolean {
  if (hideGrowthEngineForShopify) return false;
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
  hideGrowthEngineForShopify?: boolean;
}): boolean {
  if (!shouldShowCopilotInventoryPanels(input.inventoryStatus, input.hideGrowthEngineForShopify)) return false;
  if (isBuyerLeadContact(input.customFields)) return true;
  return contactHasInventoryMatchCriteria(input.buyerPreferenceProfile);
}

/**
 * Inventory Health diagnostics — QA only (not shown to normal agents).
 * Visible when: local dev, platform admin, support debug mode, or workspace owner with debug flag.
 */
export function shouldShowInventoryHealthDiagnostics(input: {
  isDev?: boolean;
  isPlatformAdmin?: boolean;
  isWorkspaceOwner?: boolean;
  isWorkspaceAdmin?: boolean;
}): boolean {
  if (input.isDev) return true;
  if (input.isPlatformAdmin) return true;
  if (isInventorySupportDebugEnabled()) return true;
  const isOwner = input.isWorkspaceOwner ?? input.isWorkspaceAdmin;
  if (isOwner && isInventoryOwnerDebugEnabled()) return true;
  return false;
}

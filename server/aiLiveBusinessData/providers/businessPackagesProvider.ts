/**
 * Business Packages / Offers & Payment Links — Live Business Data provider.
 *
 * Source of truth: workspace-owned structured offers (workspace_offers).
 * Does NOT derive prices, checkout URLs, or active status from scanned website facts.
 * Knowledge pricing_plan facts remain supplementary via the Knowledge Sources path only.
 */

import {
  extractPackageNameHint,
  LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT,
  type LiveBusinessDataRecord,
} from "@shared/aiLiveBusinessData";
import {
  findBestPackageByName,
  formatBusinessPackageSummary,
  type BusinessPackageRecord,
} from "@shared/businessPackages";
import {
  formatOfferLiveSummary,
  messageHasPurchaseIntent,
  offerToBusinessPackage,
  selectRelevantOffers,
} from "@shared/workspaceOffers";
import {
  countActiveWorkspaceOffers,
  listWorkspaceOffers,
} from "../../workspaceOffers/offerStore";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataProviderStatusResult,
  LiveBusinessDataQueryContext,
} from "../types";

export function listPackages(packages: BusinessPackageRecord[]): BusinessPackageRecord[] {
  return packages.filter((p) => p.status === "available" || p.status === "unknown");
}

export function lookupPackage(
  packages: BusinessPackageRecord[],
  packageId: string,
): BusinessPackageRecord | null {
  const id = String(packageId || "").trim();
  if (!id) return null;
  return packages.find((p) => p.packageId === id) ?? null;
}

export function findPackageByName(
  packages: BusinessPackageRecord[],
  name: string,
): BusinessPackageRecord | null {
  return findBestPackageByName(packages, name);
}

function toRecord(pkg: BusinessPackageRecord, extras?: {
  billingCadence?: string | null;
  aiGuidance?: string | null;
  purchaseIntent?: boolean;
}): LiveBusinessDataRecord {
  const summaryBase = extras
    ? formatOfferLiveSummary({
        id: pkg.packageId,
        displayName: pkg.displayName,
        priceDisplay: pkg.priceDisplay,
        benefits: pkg.benefits,
        checkoutUrl: pkg.checkoutUrl,
        followUpUrl: pkg.onboardingUrl,
        availability: pkg.availability || "available",
        active: pkg.status === "available",
        billingCadence: extras.billingCadence,
        aiGuidance: extras.aiGuidance,
      })
    : formatBusinessPackageSummary(pkg);

  const purchaseNote =
    extras?.purchaseIntent && pkg.checkoutUrl
      ? " | Purchase intent: include this exact checkout URL in the draft for human approval before send"
      : extras?.purchaseIntent && !pkg.checkoutUrl
        ? " | Purchase intent: no checkout URL stored — do not invent one; ask how they prefer to proceed"
        : "";

  return {
    providerId: "businessPackages",
    recordType: "offer",
    summary: `${summaryBase}${purchaseNote}`,
    data: { ...pkg },
  };
}

export const businessPackagesProvider: LiveBusinessDataProvider = {
  id: "businessPackages",

  async getStatus(userId: string): Promise<LiveBusinessDataProviderStatusResult> {
    try {
      const activeCount = await countActiveWorkspaceOffers(userId);
      if (activeCount === 0) {
        return { status: "disconnected", detail: "Not configured" };
      }
      return {
        status: "connected",
        detail:
          activeCount === 1
            ? "1 active offer · Connected"
            : `${activeCount.toLocaleString()} active offers · Connected`,
      };
    } catch (err) {
      console.warn(
        "[LiveBusinessData] businessPackages status failed",
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      );
      return { status: "error", detail: "Unable to load offers" };
    }
  },

  async query(ctx: LiveBusinessDataQueryContext): Promise<LiveBusinessDataRecord[]> {
    const limit = Math.min(
      Math.max(1, ctx.limit ?? LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT),
      LIVE_BUSINESS_DATA_PROMPT_RECORD_LIMIT,
    );

    const offers = await listWorkspaceOffers(ctx.userId, {
      includeArchived: false,
      activeOnly: false,
    });
    const active = offers.filter((o) => o.active && !o.archivedAt);
    if (active.length === 0) return [];

    const hint =
      (ctx.hint && String(ctx.hint).trim()) ||
      extractPackageNameHint(ctx.message) ||
      null;
    const purchaseIntent = messageHasPurchaseIntent(ctx.message);

    const relevant = selectRelevantOffers(active, ctx.message, hint, limit);
    return relevant.map((offer) => {
      const pkg = offerToBusinessPackage(offer);
      // Only surface the exact stored checkout URL — never invent when missing.
      if (!offer.checkoutUrl) {
        pkg.checkoutUrl = null;
      }
      return toRecord(pkg, {
        billingCadence: offer.billingCadence,
        aiGuidance: offer.aiGuidance,
        purchaseIntent,
      });
    });
  },
};

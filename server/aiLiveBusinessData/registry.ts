/**
 * AI Tool Registry / Live Business Data registry.
 * Future connectors register themselves via `registerLiveBusinessDataProvider`.
 */

import {
  LIVE_BUSINESS_DATA_REGISTRY,
  getLiveBusinessDataProviderDescriptor,
  type LiveBusinessDataProviderId,
  type LiveBusinessDataProviderView,
} from "@shared/aiLiveBusinessData";
import type { LiveBusinessDataProvider } from "./types";
import { businessPackagesProvider } from "./providers/businessPackagesProvider";
import { websiteKnowledgeProvider } from "./providers/websiteKnowledgeProvider";
import { shopifyProvider } from "./providers/shopifyProvider";
import { mlsProvider } from "./providers/mlsProvider";
import { calendarProvider } from "./providers/calendarProvider";
import { inventoryProvider } from "./providers/inventoryProvider";

const providers = new Map<LiveBusinessDataProviderId, LiveBusinessDataProvider>();

function seedDefaults(): void {
  if (providers.size > 0) return;
  for (const p of [
    websiteKnowledgeProvider,
    businessPackagesProvider,
    shopifyProvider,
    mlsProvider,
    calendarProvider,
    inventoryProvider,
  ]) {
    providers.set(p.id, p);
  }
}

seedDefaults();

/** Register or replace a provider (used by future connectors). */
export function registerLiveBusinessDataProvider(provider: LiveBusinessDataProvider): void {
  seedDefaults();
  providers.set(provider.id, provider);
}

export function getLiveBusinessDataProvider(
  id: LiveBusinessDataProviderId,
): LiveBusinessDataProvider | undefined {
  seedDefaults();
  return providers.get(id);
}

export function listRegisteredLiveBusinessDataProviders(): LiveBusinessDataProvider[] {
  seedDefaults();
  return LIVE_BUSINESS_DATA_REGISTRY.map((d) => providers.get(d.id)).filter(
    (p): p is LiveBusinessDataProvider => Boolean(p),
  );
}

/** Merchant-facing registry rows for AI Brain UI (no developer routing surface). */
export async function listLiveBusinessDataProviderViews(
  userId: string,
): Promise<LiveBusinessDataProviderView[]> {
  seedDefaults();
  const views: LiveBusinessDataProviderView[] = [];
  for (const descriptor of LIVE_BUSINESS_DATA_REGISTRY) {
    const provider = providers.get(descriptor.id);
    const statusResult = provider
      ? await provider.getStatus(userId)
      : { status: "coming_soon" as const, detail: "Coming Soon" };
    views.push({
      ...descriptor,
      status: statusResult.status,
      detail: statusResult.detail,
    });
  }
  return views;
}

export function assertProviderInRegistry(id: LiveBusinessDataProviderId): boolean {
  return Boolean(getLiveBusinessDataProviderDescriptor(id));
}

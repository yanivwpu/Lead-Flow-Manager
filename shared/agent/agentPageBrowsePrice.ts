/** Agent Page browse filters accept dollar amounts; listings store priceCents. */
export function agentPageBrowseFilterDollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * 100);
}

export function agentPageListingPriceDollars(priceCents: number | null): number | null {
  if (priceCents == null || !Number.isFinite(priceCents)) return null;
  return priceCents / 100;
}

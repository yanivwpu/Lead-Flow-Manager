/**
 * Business Packages — Live Business Data record shape (reference provider).
 * Queried via typed connectors; not indexed as Knowledge Source documents.
 */

export type BusinessPackageStatus = "available" | "unavailable" | "draft" | "unknown";

export type BusinessPackageRecord = {
  packageId: string;
  displayName: string;
  priceDisplay: string | null;
  benefits: string[];
  checkoutUrl: string | null;
  onboardingUrl: string | null;
  availability: string | null;
  status: BusinessPackageStatus;
};

const NORMALIZE_RE = /[^a-z0-9]+/g;

export function normalizePackageName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(NORMALIZE_RE, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Score how well a package matches a customer name hint (higher = better). */
export function scorePackageNameMatch(
  packageName: string,
  hint: string,
): number {
  const a = normalizePackageName(packageName);
  const b = normalizePackageName(hint);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 80;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = b.split(" ").filter(Boolean);
  if (!bTokens.length) return 0;
  const hit = bTokens.filter((t) => aTokens.has(t)).length;
  return Math.round((hit / bTokens.length) * 60);
}

export function findBestPackageByName(
  packages: BusinessPackageRecord[],
  hint: string,
): BusinessPackageRecord | null {
  let best: BusinessPackageRecord | null = null;
  let bestScore = 0;
  for (const pkg of packages) {
    const score = scorePackageNameMatch(pkg.displayName, hint);
    if (score > bestScore) {
      bestScore = score;
      best = pkg;
    }
  }
  return bestScore >= 40 ? best : null;
}

export function formatBusinessPackageSummary(pkg: BusinessPackageRecord): string {
  const parts = [
    pkg.displayName,
    pkg.priceDisplay ? `Price: ${pkg.priceDisplay}` : null,
    pkg.status !== "available" ? `Status: ${pkg.status}` : null,
    pkg.availability ? `Availability: ${pkg.availability}` : null,
    pkg.benefits.length
      ? `Benefits: ${pkg.benefits.slice(0, 6).join("; ")}`
      : null,
    pkg.checkoutUrl ? `Checkout: ${pkg.checkoutUrl}` : null,
    pkg.onboardingUrl ? `Onboarding: ${pkg.onboardingUrl}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

/** Pure, fail-closed attribution for merchant-scoped Shopping policies.
 *
 * A configured Shopify source URL alone is NOT enough: the website scanner can
 * follow redirects and stores the final URL on the published fact. Verify both
 * the final fact origin and every recorded provenance origin before retrieval.
 * This intentionally performs no HTTP requests.
 */
export function isStoreOwnedEvidenceUrl(urlText: unknown, allowedHosts: ReadonlySet<string>): boolean {
  if (typeof urlText !== "string" || !urlText || urlText.length > 2048) return false;
  try {
    const u = new URL(urlText);
    return u.protocol === "https:" && !u.username && !u.password &&
      (!u.port || u.port === "443") && allowedHosts.has(u.hostname.toLowerCase());
  } catch { return false; }
}

export function factBelongsToShopifyStore(
  fact: {
    sourceId: string | null;
    sourceUrl: string | null;
    provenance?: readonly { sourceId: string | null; url: string | null }[];
  },
  allowedSourceIds: ReadonlySet<string>,
  allowedHosts: ReadonlySet<string>,
): boolean {
  if (!fact.sourceId || !allowedSourceIds.has(fact.sourceId) ||
      !isStoreOwnedEvidenceUrl(fact.sourceUrl, allowedHosts)) return false;
  // Source metadata may aggregate multiple underlying facts; every source
  // in its provenance must be attributable to this same verified store.
  return (fact.provenance ?? []).every(p =>
    !!p?.sourceId && allowedSourceIds.has(p.sourceId) &&
    isStoreOwnedEvidenceUrl(p.url, allowedHosts));
}

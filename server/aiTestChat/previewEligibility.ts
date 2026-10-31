/**
 * An explicitly activated, eligible Shopify merchant may privately test their
 * catalog before enabling any live shopping channels.
 * A UI grant is not an authorization to send, checkout or grant access.
 */
export function privateMerchantCatalogPreviewAllowed(
  state: { activated?: boolean; connected?: boolean; eligible?: boolean; planEligible?: boolean } | null | undefined,
  source: { status?: string | null } | null | undefined,
): boolean {
  return state?.activated === true && state.connected === true &&
    state.eligible === true && state.planEligible === true &&
    source?.status === "ready";
}

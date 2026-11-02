/**
 * Shopify public-metadata release gate.
 *
 * The global switch alone must NEVER activate public-evidence ingestion for
 * every installed merchant. A verified workspace ID is required as a private
 * allowlist, and a second independent switch still controls customer sends.
 */
export function shopifyPublicEvidencePilotEnabled(userId: string): boolean {
  const workspaceId = process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_WORKSPACE_ID?.trim();
  return process.env.ECOMMERCE_SHOPIFY_PUBLIC_EVIDENCE_ENABLED === "true" &&
    typeof workspaceId === "string" && workspaceId.length > 0 &&
    userId === workspaceId;
}

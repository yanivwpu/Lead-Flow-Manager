/**
 * Tracks readiness of migrations 0045–0047 (public listing + agent page schema).
 * Public routes return 503 until required columns are present.
 */
export const REQUIRED_PUBLIC_LISTING_PATCH_TAGS = new Set([
  "0045_inventory_listing_compliance",
  "0046_inventory_publication_controls",
  "0047_agent_page",
]);

let publicListingSchemaReady = false;

export function setPublicListingSchemaReady(ready: boolean): void {
  publicListingSchemaReady = ready;
}

export function isPublicListingSchemaReady(): boolean {
  return publicListingSchemaReady;
}

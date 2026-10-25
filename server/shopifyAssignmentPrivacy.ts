import { sql } from "drizzle-orm";

export const assignmentPrivacyTablesQuery = sql`SELECT
  to_regclass('public.shopify_store_assignments') IS NOT NULL AS assignments,
  to_regclass('shopify_reassignment_private.manifest') IS NOT NULL AS manifest`;

/** Called only inside the signed store-redaction transaction and existing shop fence. */
export function assignmentPrivacyQueries(shop: string, ready: Record<string, unknown> | undefined) {
  const queries = [];
  if (ready?.manifest === true) {
    // This schema contains exactly one operation (forward CREATE TABLE is one-shot).
    // If its prior owner patch includes this shop, invalidate the whole inverse.
    // Never leave an inverse capable of restoring erased owner/charge metadata.
    queries.push(sql`DELETE FROM shopify_reassignment_private.manifest
      WHERE EXISTS (SELECT 1 FROM shopify_reassignment_private.manifest m,
        jsonb_array_elements(m.patches) p
        WHERE m.table_name='users' AND p->>'shopify_shop'=${shop})`);
  }
  if (ready?.assignments === true)
    queries.push(sql`DELETE FROM public.shopify_store_assignments WHERE shop=${shop}`);
  return queries;
}

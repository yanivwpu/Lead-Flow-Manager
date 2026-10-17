import { sql } from "drizzle-orm";
import type { CatalogDb } from "../../salesCatalog/commerceStore";
/** Runs under the existing uninstall/shop-redaction advisory lock. Tolerates pre-rollout schemas. */
export async function cleanupCheckout(tx:CatalogDb,shop:string) {
 const owners=sql`SELECT user_id FROM catalog_sources WHERE shop=${shop} UNION SELECT id FROM users WHERE shopify_shop=${shop}`;
 for(const table of ["checkout_preparation_attempts","checkout_provider_gates"] as const) {
  const found=await tx.execute(sql`SELECT to_regclass(${table}) AS name`);
  if(found.rows[0]?.name)await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE user_id IN (${owners})`);
 }
 const settings=await tx.execute(sql`SELECT 1 AS present FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='ai_settings' AND column_name='shopping_assistant'`);
 if(settings.rows.length)await tx.execute(sql`UPDATE ai_settings SET shopping_assistant=jsonb_set(COALESCE(shopping_assistant,'{}'::jsonb),'{checkoutEnabled}','false') WHERE user_id IN (${owners})`);
}

import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";

export async function assignedShopifyTarget(shop: string): Promise<string | undefined> {
  // The schema is deployed with the separately approved operation, not startup.
  const tables = await db.execute(sql`SELECT to_regclass('public.shopify_store_assignments') IS NOT NULL AS ready`);
  if (tables.rows[0]?.ready !== true) return undefined;
  const result = await db.execute(sql`SELECT target_user_id FROM public.shopify_store_assignments WHERE shop=${shop}`);
  return typeof result.rows[0]?.target_user_id === "string" ? result.rows[0].target_user_id : undefined;
}

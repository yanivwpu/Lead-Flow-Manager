import { eq } from "drizzle-orm";
import {
  catalogProducts,
  catalogVariants,
  catalogSources,
} from "../shared/schema";
import type { CatalogDb } from "../server/salesCatalog/commerceStore";
import type { CatalogRequest } from "../server/salesCatalog/shopify/api";
export function fixtureInventoryRequest(
  db: CatalogDb,
  modify: (node: any) => any = (n) => n,
): (shop: string, token: string) => CatalogRequest {
  return (shop, token) => async (query, variables) => {
    if (!query.includes("VerifyInventoryBatch"))
      throw Error("only inventory verification expected");
    // Shopify 2026-01: selectedOptions is [SelectedOption!]!, not a scalar.
    // Existing fixtures accepted invalid query text and therefore missed PR #90's defect.
    if (!/\bselectedOptions\s*\{\s*name\s+value\s*\}/.test(query))
      throw Error("fixture_inventory_selected_options_selection_required");
    const tenant = shop === "fixture-a.myshopify.com" ? "tenant-a" : "tenant-b";
    if (
      token !== (tenant === "tenant-a" ? "fixture-token-a" : "fixture-token-b")
    )
      throw Error("wrong installation token");
    const variants = await db
      .select()
      .from(catalogVariants)
      .where(eq(catalogVariants.userId, tenant));
    const products = await db
      .select()
      .from(catalogProducts)
      .where(eq(catalogProducts.userId, tenant));
    return {
      shop: { currencyCode: "USD", myshopifyDomain: shop },
      nodes: (variables!.ids as string[]).map((id) => {
        const v = variants.find((v) => v.externalId === id),
          p = products.find((p) => p.id === v?.productId);
        return v && p
          ? modify({
              ...v,
              id: v.externalId,
              selectedOptions: v.options,
              inventoryQuantity: v.quantity,
              inventoryItem: { id: v.inventoryItemId, tracked: v.tracked },
              product: {
                ...p,
                id: p.externalId,
                publishedAt: p.published
                  ? new Date(Date.now() - 1000).toISOString()
                  : null,
                onlineStoreUrl: p.productUrl,
                requiresSellingPlan: false,
              },
            })
          : null;
      }),
    };
  };
}
export async function inventoryDue(db: CatalogDb, sourceId: string) {
  const [s] = await db
    .select()
    .from(catalogSources)
    .where(eq(catalogSources.id, sourceId));
  await db
    .update(catalogSources)
    .set({
      nextAttemptAt: new Date(),
      checkpoint: {
        ...(s.checkpoint as any),
        inventory: {
          ...((s.checkpoint as any).inventory ?? {}),
          apiAfter: 0,
          nextAt: 0,
        },
      },
    })
    .where(eq(catalogSources.id, sourceId));
}


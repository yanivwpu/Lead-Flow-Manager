import { and,eq,inArray } from "drizzle-orm";
import { catalogProducts } from "@shared/schema";
import { createConnectedCommerceSearch } from "../salesCatalog/connectedCommerceSearch";
import type { CatalogDb,createCommerceStore } from "../salesCatalog/commerceStore";
import type { CommerceShoppingProvider } from "./service";
import { SHOPIFY_UCP_READ_ENABLED,type UcpBinding,type UcpCatalogClient,UcpReadError } from "../salesCatalog/shopify/ucpCatalog";

/** Prepared discovery adapter only. Not registered in either live or private
 * runtime. UCP supplies ranking/identity hints; all returned facts come from the
 * same owned catalog, and Shopping still calls its existing live verifier.
 */
export function createUcpShoppingProvider(deps:{
  database:CatalogDb;
  commerce:ReturnType<typeof createCommerceStore>;
  client:(binding:UcpBinding)=>UcpCatalogClient;
  /** Isolated tests only; activation requires a separate reviewed source change. */ enabled?:()=>boolean;
  diagnostic?:(reason:string)=>void;
}):CommerceShoppingProvider {
  const commerce=deps.commerce;
  const discovery=createConnectedCommerceSearch({async searchCandidates(ctx){
    const {userId,...request}=ctx;
    const fallback=()=>commerce.purchaseCandidates(userId,request);
    if(!(deps.enabled??(()=>SHOPIFY_UCP_READ_ENABLED))()) return fallback();
    try {
      const source=await commerce.source(ctx.userId,ctx.sourceId);
      if(!source || source.provider!=="shopify" || source.userId!==ctx.userId || !source.initialSyncCompletedAt || source.status!=="ready" || source.errorCode || !source.currency) return fallback();
      const binding:UcpBinding={userId:ctx.userId,sourceId:source.id,integrationId:source.integrationId,shop:source.shop,currency:source.currency};
      const refs=await deps.client(binding).search(ctx.query,Math.min(8,ctx.limit));
      if(!refs.length) return fallback();
      const rows=await deps.database.select({id:catalogProducts.id,externalId:catalogProducts.externalId}).from(catalogProducts).where(and(eq(catalogProducts.userId,ctx.userId),eq(catalogProducts.sourceId,source.id),inArray(catalogProducts.externalId,refs.map(r=>r.id))));
      if(rows.length!==refs.length) throw new UcpReadError("identity_not_in_owned_catalog");
      const ids=refs.map(r=>rows.find(p=>p.externalId===r.id)!.id);
      const products=await commerce.products(ctx.userId,source.id,ids,ctx.filters,true);
      const mapped=[];
      for(const ref of refs) {
        const row=rows.find(p=>p.externalId===ref.id)!;
        // Every advertised pair must belong to this merchant/product even when
        // filtering excludes it. Unknown pairs never become model-chosen IDs.
        for(const v of ref.variants) if(!await commerce.lookupVariant(ctx.userId,source.id,row.id,v.id)) throw new UcpReadError("variant_not_in_owned_product");
        const p=products.find(p=>p.id===row.id);
        if(p) mapped.push({...p,variants:p.variants.filter(v=>ref.variants.some(r=>r.id===v.externalId))});
      }
      const current=await commerce.source(ctx.userId,source.id);
      if(!current || current.integrationId!==binding.integrationId || current.shop!==binding.shop || current.currency!==binding.currency || current.status!=="ready" || current.errorCode) throw new UcpReadError("installation_changed");
      // No UCP titles, descriptions, prices, inventory, policies or checkout URLs
      // are surfaced. Normal Admin/Storefront fallback remains authoritative.
      const candidates=mapped.filter(p=>p.variants.length).slice(0,ctx.limit);
      return candidates.length?candidates:fallback();
    } catch(error) {
      deps.diagnostic?.(error instanceof UcpReadError?error.reason:"ucp_unavailable");
      return fallback();
    }
  }});
  return {
    source:commerce.source,lookupVariant:commerce.lookupVariant,verifyForPurchase:commerce.verifyForPurchase,
    purchaseCandidates:(userId,input)=>discovery.searchCandidates(userId,input),
  };
}

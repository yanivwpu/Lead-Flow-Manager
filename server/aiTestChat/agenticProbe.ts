import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { aiTestSessions, catalogProducts, catalogVariants, users } from "@shared/schema";
import { createCommerceStore, type CatalogDb } from "../salesCatalog/commerceStore";
import { resolveCatalogInstallation } from "../salesCatalog/shopify/installation";
import { shopifyCatalogRequest } from "../salesCatalog/shopify/api";
import { disabledAgenticProbe, runAgenticProbe, SHOPIFY_AGENTIC_PROBE_ENABLED } from "../salesCatalog/shopify/agenticProbe";
import { TestChatError, type TestOwner } from "./sessions";

export const PROBE_VARIANTS_QUERY = `query AgenticProbeVariants($ids:[ID!]!) { shop { myshopifyDomain currencyCode } nodes(ids:$ids) { ... on ProductVariant { id price availableForSale inventoryQuantity inventoryPolicy inventoryItem { tracked } product { id } } } }`;
/** Exact decimal comparison: UCP amount is integer minor units, Admin price is decimal major units. */
export function minorUnits(price:unknown,currency:string): bigint | null {
  if(typeof price!=="string"||!/^\d+(\.\d+)?$/.test(price))return null;
  try {
    const digits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits;
    if(digits===undefined)return null;
    const [whole,fraction=""]=price.split(".");
    if(fraction.slice(digits).replace(/0/g,""))return null;
    return BigInt(whole+fraction.slice(0,digits).padEnd(digits,"0"));
  }catch{return null;}
}
export function createAgenticCompatibilityProbe(deps:{db:CatalogDb;entitled:(id:string)=>Promise<boolean>;
  env?:NodeJS.ProcessEnv;requestFor?:typeof shopifyCatalogRequest;fetcher?:typeof fetch;
  /** Test seam only; production registration never supplies this override. */ enabled?:()=>boolean}) {
  const env=deps.env??process.env,commerce=createCommerceStore(deps.db,deps.requestFor);
  const active=new Set<string>(),last=new Map<string,number>();
  const enabled=deps.enabled??(()=>SHOPIFY_AGENTIC_PROBE_ENABLED);
  async function snapshot(auth:TestOwner,id:string) {
    if(auth.actorUserId!==auth.workspaceUserId)throw new TestChatError(404,"not_found");
    const [owner]=await deps.db.select({id:users.id,email:users.email}).from(users).where(eq(users.id,auth.workspaceUserId)).limit(1);
    // Independent server pins; neither browser fields nor administrator status select a merchant.
    if(!owner || !env.SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID || !env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL ||
      owner.id!==env.SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID || owner.email?.trim().toLowerCase()!==env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL.trim().toLowerCase())
      throw new TestChatError(404,"not_found");
    if(!await deps.entitled(owner.id))throw new TestChatError(403,"shopping_entitlement_required");
    const [session]=await deps.db.select().from(aiTestSessions).where(and(eq(aiTestSessions.id,id),
      eq(aiTestSessions.userId,owner.id),eq(aiTestSessions.actorId,auth.actorUserId),gt(aiTestSessions.expiresAt,new Date()))).limit(1);
    if(!session)throw new TestChatError(404,"session_expired");
    if(session.leaseUntil && session.leaseUntil>new Date())throw new TestChatError(409,"turn_processing");
    const state=session.shoppingState as any;
    if(!state?.selected || !state.sourceId)throw new TestChatError(409,"selected_variant_required");
    const install=await resolveCatalogInstallation(deps.db,owner.id);
    if(!install || install.shop!==env.SHOPIFY_AGENTIC_PROBE_SHOP)throw new TestChatError(409,"probe_installation_changed");
    const source=await commerce.source(owner.id,state.sourceId);
    if(!source || source.shop!==install.shop || source.integrationId!==install.integrationId || !source.initialSyncCompletedAt ||
      !["ready","syncing"].includes(source.status) || !source.currency)throw new TestChatError(409,"probe_catalog_unavailable");
    const [product]=await deps.db.select().from(catalogProducts).where(and(eq(catalogProducts.id,state.selected.productId),
      eq(catalogProducts.userId,owner.id),eq(catalogProducts.sourceId,source.id))).limit(1);
    const [variant]=await deps.db.select().from(catalogVariants).where(and(eq(catalogVariants.id,state.selected.variantId),
      eq(catalogVariants.userId,owner.id),eq(catalogVariants.sourceId,source.id),eq(catalogVariants.productId,state.selected.productId))).limit(1);
    const query=z.string().trim().min(1).max(200).safeParse(product?.title);
    if(!query.success || !variant || !product?.complete || !product.published || product.status!=="ACTIVE" || product.deletedAt)
      throw new TestChatError(409,"selected_variant_required");
    const binding=createHash("sha256").update(JSON.stringify([auth,session,install,source,product,variant,
      env.SHOPIFY_AGENTIC_PROBE_WORKSPACE_ID,env.SHOPIFY_AGENTIC_PROBE_OWNER_EMAIL,env.SHOPIFY_AGENTIC_PROBE_SHOP,env.SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE])).digest("hex");
    return {install,source,query:query.data,binding};
  }
  return async(auth:TestOwner,id:string,httpSessionId:string)=>{
    if(!httpSessionId)throw new TestChatError(403,"authenticated_session_required");
    if(!z.string().uuid().safeParse(id).success)throw new TestChatError(400,"invalid_test_session");
    // Fail closed before any database or provider work, independently of diagnostics/UI.
    if(!enabled())return disabledAgenticProbe();
    const key=auth.workspaceUserId;
    if(active.has(key)||(last.get(key)??0)>Date.now()-30_000)throw new TestChatError(429,"probe_cooldown");
    // Bounded in-memory cooldown; no journal, catalog write or consumed-cart claim.
    for(const [entry,time] of last)if(time<Date.now()-30_000 && !active.has(entry))last.delete(entry);
    if(last.size>=1000)throw new TestChatError(503,"probe_capacity");
    active.add(key);last.set(key,Date.now());
    try {
      const before=await snapshot(auth,id),{install,source}=before;
      const existing=await commerce.purchaseCandidates(auth.workspaceUserId,{sourceId:source.id,query:before.query,limit:5,filters:{currency:source.currency!}});
      const request=(deps.requestFor??shopifyCatalogRequest)(install.shop,install.token);
      const result=await runAgenticProbe({shop:install.shop,query:before.query,currency:source.currency!,profile:env.SHOPIFY_AGENTIC_PROBE_AGENT_PROFILE,
        request,fetcher:deps.fetcher,existing,
        owns:async products=>{
          if(products.reduce((n,p)=>n+p.variants.length,0)>20)return false;
          for(const product of products){
            const [owned]=await deps.db.select({id:catalogProducts.id}).from(catalogProducts).where(and(eq(catalogProducts.externalId,product.id),
              eq(catalogProducts.userId,auth.workspaceUserId),eq(catalogProducts.sourceId,source.id))).limit(1);
            if(!owned)return false;
            for(const variant of product.variants){
              const [ownedVariant]=await deps.db.select({id:catalogVariants.id}).from(catalogVariants).where(and(eq(catalogVariants.externalId,variant.id),
                eq(catalogVariants.userId,auth.workspaceUserId),eq(catalogVariants.sourceId,source.id),eq(catalogVariants.productId,owned.id))).limit(1);
              if(!ownedVariant)return false;
            }
          }return true;
        },
        verify:async products=>{
          const variants=products.flatMap(p=>p.variants.map(v=>({...v,productId:p.id})));
          if(!variants.length)return {price:false,availability:false};
          const live=await request(PROBE_VARIANTS_QUERY,{ids:variants.map(v=>v.id)});
          if(live.shop?.myshopifyDomain!==install.shop || live.shop?.currencyCode!==source.currency || !Array.isArray(live.nodes) || live.nodes.length!==variants.length)
            throw new Error("identity_unverified");
          let price=true,availability=true;
          variants.forEach((v,i)=>{
            const node=live.nodes[i];
            if(node?.id!==v.id || node.product?.id!==v.productId)throw new Error("identity_unverified");
            price &&= !!v.price && v.price.currency===source.currency && minorUnits(node.price,source.currency!)===BigInt(v.price.amount);
            availability &&= typeof node.availableForSale==="boolean" && typeof v.availability?.available==="boolean" &&
              node.availableForSale===v.availability.available && typeof node.inventoryItem?.tracked==="boolean" &&
              (!node.inventoryItem.tracked || node.inventoryPolicy==="CONTINUE" ||
                (node.inventoryPolicy==="DENY" && Number.isSafeInteger(node.inventoryQuantity) &&
                  v.availability.available===(node.availableForSale && node.inventoryQuantity>0)));
          });
          return {price,availability};
        }});
      const after=await snapshot(auth,id);
      if(!enabled() || after.binding!==before.binding)throw new TestChatError(409,"probe_context_changed");
      return result;
    }finally{active.delete(key);}
  };
}

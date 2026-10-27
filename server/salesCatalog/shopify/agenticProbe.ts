import { z } from "zod";
import type { ShopifyAgenticProbe, ProbeStatus } from "@shared/shopifyAgenticProbe";
import { CatalogApiError, type CatalogRequest } from "./api";

// Deliberate source gate. Environment variables, administrators and model output cannot activate it.
export const SHOPIFY_AGENTIC_PROBE_ENABLED = false;
export const AGENTIC_META_QUERY = `query AgenticProbeIdentity { shop { myshopifyDomain currencyCode plan { partnerDevelopment } } currentAppInstallation { accessScopes { handle } } }`;
const PRODUCT = /^gid:\/\/shopify\/Product\/\d+$/;
const VARIANT = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const money = z.object({ amount: z.number().int().nonnegative().safe(), currency: z.string().regex(/^[A-Z]{3}$/) });
const product = z.object({
  id: z.string().regex(PRODUCT),
  variants: z.array(z.object({ id: z.string().regex(VARIANT), price: money.optional(),
    availability: z.object({ available: z.boolean() }).optional() })).max(100),
});
const searchResult = z.object({ ucp: z.object({version: z.string(), capabilities: z.record(z.unknown())}), products: z.array(product).max(5) });
const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.number(), result: z.unknown().optional(), error: z.unknown().optional() });
class ProbeFailure extends Error {
  constructor(public status: ProbeStatus, public reason: string) { super(reason); }
}
export function disabledAgenticProbe(): ShopifyAgenticProbe {
  return {enabled:false,readOnly:true,cartCreationEnabled:false,checkoutEnabled:false,
    diagnostics:[{capability:"probe",status:"configuration_required",reason:"source_gate_disabled"}]};
}
/** HTTPS profile is server configuration only; no Shopify credential is ever sent to MCP. */
export function agentProfile(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && !url.search &&
      !url.port && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname) && url.hostname.includes(".") ? url.href : null;
  } catch { return null; }
}
/** Strict fixed-destination reader: no cookies, credentials, redirects, retries, URLs from discovery, or arbitrary tools. */
async function readJson(fetcher: typeof fetch, shop: string, path: "/.well-known/ucp" | "/api/ucp/mcp", body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`https://${shop}${path}`, {method: body ? "POST" : "GET",
      redirect:"manual",credentials:"omit",signal:controller.signal,
      headers:{Accept:"application/json",...(body ? {"Content-Type":"application/json"} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})});
    if (response.status>=300 && response.status<400) {
      const location = response.headers.get("location");
      let password = false;
      try { const url = new URL(location ?? "",`https://${shop}`); password = url.origin===`https://${shop}` && url.pathname==="/password"; } catch {}
      throw new ProbeFailure(password ? "configuration_required" : "unavailable",password ? "password_protected" : "redirect_refused");
    }
    if ([401,403].includes(response.status)) throw new ProbeFailure("configuration_required","authentication_or_store_access_required");
    if ([404,405].includes(response.status)) throw new ProbeFailure("unsupported","endpoint_not_available");
    if (!response.ok) throw new ProbeFailure("unavailable",response.status===429 ? "throttled" : "provider_unavailable");
    if (!response.headers.get("content-type")?.includes("application/json")) throw new ProbeFailure("unavailable","non_json_response");
    // Bound streamed bytes as well as time; provider content is never returned/logged/rendered.
    const reader = response.body?.getReader();
    if (!reader) throw new ProbeFailure("unavailable","invalid_schema");
    const chunks: Uint8Array[]=[]; let size=0;
    try { while(true) { const next=await reader.read(); if(next.done)break; size+=next.value.byteLength;
      if(size>256_000)throw new ProbeFailure("unavailable","response_too_large"); chunks.push(next.value); }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { clearTimeout(timer); }
}
export type ProbeInput = {
  shop: string; query: string; currency: string; profile: string | undefined;
  existing: ReadonlyArray<{externalId:string}>;
  // Validate every returned product/variant pair against this installation's owned catalog.
  owns: (products: Array<{id:string;variants:Array<{id:string}>}>) => Promise<boolean>;
  // Fresh existing-provider verification for common product/variant IDs, price and inventory.
  verify: (products: z.infer<typeof product>[]) => Promise<{price:boolean;availability:boolean}>;
  request: CatalogRequest;
  fetcher?: typeof fetch;
};
export async function runAgenticProbe(input: ProbeInput): Promise<ShopifyAgenticProbe> {
  const result: ShopifyAgenticProbe = {enabled:true,readOnly:true,cartCreationEnabled:false,checkoutEnabled:false,diagnostics:[]};
  const add=(capability:string,status:ProbeStatus,reason:string)=>result.diagnostics.push({capability,status,reason});
  const failure=(capability:string,error:unknown)=>add(capability,error instanceof ProbeFailure ? error.status :
    error instanceof CatalogApiError && error.code==="access_denied" ? "configuration_required" : "unavailable",
    error instanceof ProbeFailure ? error.reason : "provider_or_schema_unavailable");
  // Server-resolved canonical Shopify domain only. Never use advertised transport URLs.
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.shop)) throw new ProbeFailure("unavailable","merchant_identity_mismatch");
  try {
    const meta=await input.request(AGENTIC_META_QUERY);
    if(meta.shop?.myshopifyDomain!==input.shop)throw new ProbeFailure("unavailable","merchant_identity_mismatch");
    if(meta.shop?.plan?.partnerDevelopment!==true)throw new ProbeFailure("configuration_required","development_store_required");
    if(meta.shop?.currencyCode!==input.currency)throw new ProbeFailure("unavailable","currency_changed");
    const scopes=meta.currentAppInstallation?.accessScopes;
    if(!Array.isArray(scopes)||!scopes.some((s:any)=>s.handle==="read_products"))throw new ProbeFailure("configuration_required","read_products_required");
    add("merchant_identity","supported","connected_development_installation_verified");
  } catch(error) { failure("merchant_identity",error); return result; }
  add("existing_discovery","supported","existing_tenant_scoped_search_completed");
  const fetcher=input.fetcher??fetch;
  try {
    const profile=await readJson(fetcher,input.shop,"/.well-known/ucp");
    if(!profile?.ucp || typeof profile.ucp.version!=="string" || !profile.ucp.capabilities || typeof profile.ucp.capabilities!=="object")
      throw new ProbeFailure("unavailable","invalid_schema");
    const capabilities=profile.ucp.capabilities;
    for(const [label,key] of [["ucp_catalog_search","dev.ucp.shopping.catalog.search"],["ucp_catalog_lookup","dev.ucp.shopping.catalog.lookup"],["ucp_checkout_advertised","dev.ucp.shopping.checkout"]])
      add(label,Array.isArray(capabilities[key])&&capabilities[key].length ? "supported" : "unsupported",
        Array.isArray(capabilities[key])&&capabilities[key].length ? "advertised_only_not_execution_verified" : "not_advertised");
  } catch(error) { failure("ucp_profile",error); }
  const profile=agentProfile(input.profile);
  if(!profile) { add("mcp_authentication","configuration_required","server_agent_profile_required"); return result; }
  const meta={"ucp-agent":{profile}};
  let id=0;
  async function rpc(method:"tools/list"|"tools/call",params:unknown) {
    const requestId=++id;
    const raw=envelope.parse(await readJson(fetcher,input.shop,"/api/ucp/mcp",{jsonrpc:"2.0",id:requestId,method,params}));
    if(raw.id!==requestId)throw new ProbeFailure("unavailable","response_id_mismatch");
    if(raw.error!==undefined)throw new ProbeFailure("unavailable","rpc_rejected");
    return raw.result as any;
  }
  try {
    const listed=await rpc("tools/list",{arguments:{meta}});
    const tools=z.array(z.object({name:z.string(),inputSchema:z.object({type:z.literal("object"),properties:z.record(z.unknown())})})).max(100).parse(listed?.tools);
    if(listed.nextCursor)throw new ProbeFailure("unavailable","tool_list_incomplete");
    for(const name of ["search_catalog","lookup_catalog","get_product"])
      add(name,tools.some(t=>t.name===name) ? "supported" : "unsupported",tools.some(t=>t.name===name) ? "advertised_schema_only" : "tool_not_advertised");
    const search=tools.find(t=>t.name==="search_catalog");
    if(!search)return result;
    // Never execute discovered names or schema-provided URLs. Only the fixed read-only search is callable.
    if(!search.inputSchema.properties.catalog || !search.inputSchema.properties.meta)throw new ProbeFailure("unavailable","input_schema_incompatible");
    add("mcp_authentication","supported","agent_profile_accepted_without_api_token");
    const raw=await rpc("tools/call",{name:"search_catalog",arguments:{meta,catalog:{query:input.query,context:{currency:input.currency},pagination:{limit:5}}}});
    if(raw?.isError)throw new ProbeFailure("unavailable","tool_rejected");
    const data=searchResult.parse(raw?.structuredContent);
    const productIds=data.products.map(p=>p.id), variantIds=data.products.flatMap(p=>p.variants.map(v=>v.id));
    if(new Set(productIds).size!==productIds.length || new Set(variantIds).size!==variantIds.length)throw new ProbeFailure("unavailable","duplicate_catalog_identity");
    if(!await input.owns(data.products))throw new ProbeFailure("unavailable","catalog_identity_outside_owned_source");
    add("product_variant_identity","supported","all_results_bound_to_owned_catalog");
    const currencies=data.products.flatMap(p=>p.variants.flatMap(v=>v.price ? [v.price.currency] : []));
    const verification=await input.verify(data.products);
    add("currency_price",currencies.length && currencies.every(c=>c===input.currency) && verification.price ? "supported" : "unavailable",
      currencies.length && currencies.every(c=>c===input.currency) && verification.price ? "minor_units_match_fresh_admin_price" : "price_or_currency_unverified");
    add("availability",verification.availability && data.products.length ? "supported" : "unavailable",
      verification.availability && data.products.length ? "signals_match_fresh_admin_inventory" : "availability_unverified");
    add("exact_inventory_quantity","unsupported","catalog_availability_does_not_replace_inventory_verification");
    const standard=new Set(data.products.map(p=>p.id)),existing=new Set(input.existing.map(p=>p.externalId));
    result.comparison={existingProducts:existing.size,standardProducts:standard.size,overlappingProducts:[...standard].filter(p=>existing.has(p)).length};
    add("standard_discovery","supported",standard.size ? "bounded_search_completed" : "empty_search_not_eligibility_proof");
  } catch(error) { failure("storefront_catalog_mcp",error); }
  return result;
}

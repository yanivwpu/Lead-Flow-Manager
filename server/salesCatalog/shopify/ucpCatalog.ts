import { isIP } from "node:net";
import { z } from "zod";

// Preparation only. There is no runtime registration, HTTP route, profile host,
// grant provisioning or environment-variable activation in this milestone.
export const SHOPIFY_UCP_READ_ENABLED = false;
export const UCP_CATALOG_VERSION = "2026-08-25";
const productId = z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d*$/);
const variantId = z.string().regex(/^gid:\/\/shopify\/ProductVariant\/[1-9]\d*$/);
const identifier = z.union([productId, variantId]);
const money = z.object({amount:z.number().int().nonnegative().safe(),currency:z.string().regex(/^[A-Z]{3}$/)});
const variant = z.object({
  id:variantId, price:money.optional(), availability:z.object({available:z.boolean()}).optional(),
  quantity_unit:z.object({unit:z.literal("each")}).optional(),
  requires:z.object({selling_plan:z.literal(false).optional()}).optional(),
});
const product = z.object({id:productId,variants:z.array(variant).min(1).max(100)});
const ucp = z.object({version:z.literal(UCP_CATALOG_VERSION),status:z.literal("success").optional(),capabilities:z.record(z.array(z.object({version:z.literal(UCP_CATALOG_VERSION)})))});
export type UcpIdentity = {id:string;variants:Array<{id:string}>};
export type UcpBinding = Readonly<{userId:string;sourceId:string;integrationId:string;shop:string;currency:string}>;
export class UcpReadError extends Error {
  constructor(public readonly reason:string) {super(reason);}
}
type Tool = "search_catalog"|"lookup_catalog"|"get_product";
const lookupCapability="dev.ucp.shopping.catalog.lookup";

/** Server configuration only; never fetch this URL locally or accept it from a shopper. */
export function ucpAgentProfile(raw:string):string {
  const url=new URL(raw);
  if(url.protocol!=="https:" || url.username || url.password || url.port || url.search || url.hash ||
    isIP(url.hostname.replace(/^\[|\]$/g,"")) || !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new UcpReadError("agent_profile_required");
  return url.href;
}

/** Adapted from #205's bounded, credential-free fixed-destination reader.
 * Every request rechecks server authorization. A future #206 bridge must claim
 * once before the first request and assert the existing grant on later reads.
 * This client never creates, resets or retries a one-shot authorization.
 */
export function createUcpCatalogClient(deps:{
  binding:UcpBinding; profile:string;
  authorize:(binding:UcpBinding)=>Promise<boolean>;
  fetcher?:typeof fetch;
  /** Isolated test seam; no production caller supplies this. */ enabled?:()=>boolean;
}) {
  const binding=Object.freeze({...deps.binding});
  const fetcher=deps.fetcher??fetch;
  let sequence=0, busy=false;
  const enabled=()=> (deps.enabled??(()=>SHOPIFY_UCP_READ_ENABLED))();
  async function rpc(method:"tools/list"|"tools/call",params:unknown) {
    if(!enabled()) throw new UcpReadError("source_disabled");
    if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(binding.shop) || !binding.userId || !binding.sourceId || !binding.integrationId || !/^[A-Z]{3}$/.test(binding.currency)) throw new UcpReadError("merchant_binding_required");
    if(!await deps.authorize(binding)) throw new UcpReadError("read_authorization_required");
    const id=++sequence, controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetcher(`https://${binding.shop}/api/ucp/mcp`,{
        method:"POST",redirect:"manual",credentials:"omit",signal:controller.signal,
        headers:{Accept:"application/json","Content-Type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id,method,params}),
      });
      if(response.status>=300 && response.status<400) {
        let password=false;
        try {const url=new URL(response.headers.get("location")??"",`https://${binding.shop}`);password=url.origin===`https://${binding.shop}`&&url.pathname==="/password";} catch {}
        throw new UcpReadError(password?"password_protected":"redirect_refused");
      }
      if([401,403].includes(response.status)) throw new UcpReadError("store_access_required");
      if([404,405].includes(response.status)) throw new UcpReadError("endpoint_unavailable");
      if(!response.ok) throw new UcpReadError(response.status===429?"throttled":"provider_unavailable");
      if(!response.headers.get("content-type")?.includes("application/json")) throw new UcpReadError("non_json_response");
      const reader=response.body?.getReader();
      if(!reader) throw new UcpReadError("invalid_response");
      const chunks:Uint8Array[]=[];let bytes=0;
      try {while(true) {const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>256_000)throw new UcpReadError("response_too_large");chunks.push(next.value);}} finally {await reader.cancel();}
      const envelope=z.object({jsonrpc:z.literal("2.0"),id:z.literal(id),error:z.unknown().optional(),result:z.unknown().optional()}).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if(!enabled() || !await deps.authorize(binding)) throw new UcpReadError("read_authorization_required");
      if(envelope.error!==undefined || !envelope.result) throw new UcpReadError("rpc_rejected");
      return envelope.result;
    } catch(error) {throw error instanceof UcpReadError?error:new UcpReadError("provider_or_schema_unavailable");}
    finally {clearTimeout(timer);}
  }
  async function call(tool:Tool,catalog:Record<string,unknown>,limit:number,requested?:string[]) : Promise<UcpIdentity[]> {
    if(!enabled()) throw new UcpReadError("source_disabled");
    if(busy) throw new UcpReadError("read_in_progress");
    busy=true;
    try {
      const meta={"ucp-agent":{profile:ucpAgentProfile(deps.profile)}};
      const listed=z.object({tools:z.array(z.object({name:z.string(),inputSchema:z.object({type:z.literal("object"),properties:z.record(z.unknown())})})).max(100),nextCursor:z.string().optional()}).parse(await rpc("tools/list",{arguments:{meta}}));
      if(listed.nextCursor || !listed.tools.some(t=>t.name===tool&&t.inputSchema.properties.meta&&t.inputSchema.properties.catalog)) throw new UcpReadError("tool_or_schema_unavailable");
      // Tool names and arguments are constructed here; never execute discovered
      // URLs, arbitrary MCP tools, Ask, cart or checkout operations.
      const result=z.object({isError:z.boolean().optional(),structuredContent:z.unknown()}).parse(await rpc("tools/call",{name:tool,arguments:{meta,catalog:{...catalog,context:{currency:binding.currency}}}}));
      if(result.isError) throw new UcpReadError("tool_rejected");
      const data=tool==="get_product" ? z.object({ucp,product}).parse(result.structuredContent) : z.object({ucp,products:z.array(product).max(limit)}).parse(result.structuredContent);
      const capability=tool==="search_catalog"?"dev.ucp.shopping.catalog.search":lookupCapability;
      if(!data.ucp.capabilities[capability]?.length || Object.keys(data.ucp.capabilities).some(c=>c.includes("catalog.global"))) throw new UcpReadError("negotiated_capability_mismatch");
      const products="products" in data?data.products:[data.product];
      const seen=new Set<string>();
      return products.map(p=>{
        if(seen.has(p.id)) throw new UcpReadError("duplicate_identity");seen.add(p.id);
        if(requested && !requested.includes(p.id) && !p.variants.some(v=>requested.includes(v.id))) throw new UcpReadError("unrequested_identity");
        return {id:p.id,variants:p.variants.map(v=>{if(seen.has(v.id))throw new UcpReadError("duplicate_identity");seen.add(v.id);return {id:v.id};})};
      });
    } catch(error) {throw error instanceof UcpReadError?error:new UcpReadError("provider_or_schema_unavailable");}
    finally {busy=false;}
  }
  return {
    search(query:string,limit=8) {return call("search_catalog",{query:z.string().trim().min(1).max(200).parse(query),pagination:{limit:z.number().int().min(1).max(8).parse(limit)}},limit);},
    lookup(ids:string[]) {const owned=z.array(identifier).min(1).max(10).parse(ids);return call("lookup_catalog",{ids:owned},10,owned);},
    getProduct(id:string,selected:Array<{name:string;label:string}>=[]) {return call("get_product",{id:identifier.parse(id),selected:z.array(z.object({name:z.string().min(1).max(100),label:z.string().min(1).max(100)}).strict()).max(10).parse(selected)},1,[id]);},
  };
}
export type UcpCatalogClient=ReturnType<typeof createUcpCatalogClient>;
